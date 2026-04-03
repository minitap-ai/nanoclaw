/**
 * Release Diffs Handler
 *
 * Fetches diffs between latest release and default branch for all repos in a GitHub org.
 * Called via IPC from container agents, returns structured JSON with changes per repo.
 */

import fs from 'fs';
import path from 'path';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

interface CommitInfo {
  sha: string;
  message: string;
  author: string;
}

interface PullRequestInfo {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
}

interface RepoReleaseDiff {
  name: string;
  latestRelease: string | null;
  releasedAt: string | null;
  defaultBranch: string;
  hasChanges: boolean;
  commits: CommitInfo[];
  pullRequests: PullRequestInfo[];
}

interface ReleaseDiffsResult {
  success: boolean;
  message: string;
  data?: {
    org: string;
    fetchedAt: string;
    repos: RepoReleaseDiff[];
  };
}

async function githubApi(endpoint: string, token: string): Promise<unknown> {
  const resp = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'nanoclaw-release-drafter',
    },
  });
  if (!resp.ok) {
    throw new Error(
      `GitHub API ${endpoint}: ${resp.status} ${resp.statusText}`,
    );
  }
  return resp.json();
}

async function fetchAllPages(
  endpoint: string,
  token: string,
  maxPages = 5,
): Promise<unknown[]> {
  const results: unknown[] = [];
  let page = 1;
  while (page <= maxPages) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const data = await githubApi(
      `${endpoint}${separator}per_page=100&page=${page}`,
      token,
    );
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchReleaseDiffs(): Promise<ReleaseDiffsResult> {
  const env = readEnvFile(['GITHUB_TOKEN', 'GITHUB_ORG']);
  const token = env.GITHUB_TOKEN;
  const org = env.GITHUB_ORG || 'minitap-ai';

  if (!token) {
    return { success: false, message: 'GITHUB_TOKEN not found in .env file' };
  }

  try {
    const repos = (await fetchAllPages(
      `/orgs/${org}/repos?sort=updated`,
      token,
    )) as any[];
    logger.info({ count: repos.length }, 'Fetched repos from GitHub');

    const diffs: RepoReleaseDiff[] = [];

    for (const repo of repos) {
      if (repo.archived || repo.fork) continue;

      try {
        // Get latest release
        let latestRelease: any = null;
        try {
          latestRelease = await githubApi(
            `/repos/${org}/${repo.name}/releases/latest`,
            token,
          );
        } catch {
          // No releases for this repo
        }

        if (!latestRelease) continue;

        const tag = latestRelease.tag_name;
        const defaultBranch = repo.default_branch || 'main';

        // Compare release tag with default branch
        let compare: any;
        try {
          const encodedTag = encodeURIComponent(tag);
          const encodedBranch = encodeURIComponent(defaultBranch);
          compare = await githubApi(
            `/repos/${org}/${repo.name}/compare/${encodedTag}...${encodedBranch}`,
            token,
          );
        } catch {
          continue;
        }

        if (!compare.commits || compare.commits.length === 0) continue;

        // Get merged PRs since the release
        const releaseDate =
          latestRelease.published_at || latestRelease.created_at;
        let mergedPRs: any[] = [];
        try {
          const encodedRepo = encodeURIComponent(`${org}/${repo.name}`);
          const dateStr = releaseDate.split('T')[0];
          const prSearch = (await githubApi(
            `/search/issues?q=repo:${encodedRepo}+is:pr+is:merged+merged:>${dateStr}&sort=updated&order=desc`,
            token,
          )) as any;
          mergedPRs = prSearch.items || [];
        } catch {
          // Search might fail, not critical
        }

        diffs.push({
          name: repo.name,
          latestRelease: tag,
          releasedAt: releaseDate,
          defaultBranch,
          hasChanges: true,
          commits: compare.commits.map((c: any) => ({
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split('\n')[0],
            author: c.author?.login || c.commit.author?.name || 'unknown',
          })),
          pullRequests: mergedPRs.map((pr: any) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login || 'unknown',
            mergedAt: pr.pull_request?.merged_at || '',
          })),
        });
      } catch (err) {
        logger.warn({ repo: repo.name, err }, 'Failed to process repo');
      }
    }

    // Sort by number of changes (most changes first)
    diffs.sort((a, b) => b.commits.length - a.commits.length);

    return {
      success: true,
      message: `Found changes in ${diffs.length} repos since their latest release`,
      data: {
        org,
        fetchedAt: new Date().toISOString(),
        repos: diffs,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to fetch release diffs: ${msg}` };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function writeIpcResult(
  dataDir: string,
  sourceGroup: string,
  requestId: string,
  result: ReleaseDiffsResult,
): void {
  const resultsDir = path.join(dataDir, 'ipc', sourceGroup, 'release_results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const filepath = path.join(resultsDir, `${requestId}.json`);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(result));
  fs.renameSync(tempPath, filepath);
}

/**
 * Handle release-related IPC messages from container agents.
 *
 * @returns true if message was handled, false if not a release message
 */
export async function handleReleaseIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  isMain: boolean,
  dataDir: string,
): Promise<boolean> {
  const type = data.type as string;

  if (!type?.startsWith('release_')) {
    return false;
  }

  const requestId =
    typeof data.requestId === 'string' ? data.requestId : undefined;

  if (!requestId) {
    logger.warn({ type }, 'Release tools blocked: missing requestId');
    return true;
  }

  logger.info({ type, requestId }, 'Processing release request');

  let result: ReleaseDiffsResult;

  switch (type) {
    case 'release_fetch_diffs':
      result = await fetchReleaseDiffs();
      break;
    default:
      return false;
  }

  writeIpcResult(dataDir, sourceGroup, requestId, result);
  if (result.success) {
    logger.info({ type, requestId }, 'Release request completed');
  } else {
    logger.error(
      { type, requestId, message: result.message },
      'Release request failed',
    );
  }
  return true;
}
