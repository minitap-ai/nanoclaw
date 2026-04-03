#!/usr/bin/env node

/**
 * Fetch release diffs for all repos in a GitHub org.
 * Outputs JSON with commits and merged PRs since latest release per repo.
 *
 * Env vars:
 *   GITHUB_TOKEN - required
 *   GITHUB_ORG   - optional, defaults to "minitap-ai"
 *
 * Usage: node /app/scripts/fetch-release-diffs.mjs
 */

const token = process.env.GITHUB_TOKEN;
const org = process.env.GITHUB_ORG || "minitap-ai";

if (!token) {
  console.error(JSON.stringify({ success: false, message: "GITHUB_TOKEN env var not set" }));
  process.exit(1);
}

async function githubApi(endpoint) {
  const resp = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "nanoclaw-release-drafter",
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub API ${endpoint}: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

async function fetchAllPages(endpoint, maxPages = 5) {
  const results = [];
  let page = 1;
  while (page <= maxPages) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const data = await githubApi(`${endpoint}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

async function main() {
  const repos = await fetchAllPages(`/orgs/${org}/repos?sort=updated`);
  const diffs = [];

  for (const repo of repos) {
    if (repo.archived || repo.fork) continue;

    try {
      let latestRelease;
      try {
        latestRelease = await githubApi(`/repos/${org}/${repo.name}/releases/latest`);
      } catch {
        continue;
      }

      const tag = latestRelease.tag_name;
      const defaultBranch = repo.default_branch || "main";

      let compare;
      try {
        const encodedTag = encodeURIComponent(tag);
        const encodedBranch = encodeURIComponent(defaultBranch);
        compare = await githubApi(
          `/repos/${org}/${repo.name}/compare/${encodedTag}...${encodedBranch}`
        );
      } catch {
        continue;
      }

      if (!compare.commits || compare.commits.length === 0) continue;

      const releaseDate = latestRelease.published_at || latestRelease.created_at;
      let mergedPRs = [];
      try {
        const encodedRepo = encodeURIComponent(`${org}/${repo.name}`);
        const dateStr = releaseDate.split("T")[0];
        const prSearch = await githubApi(
          `/search/issues?q=repo:${encodedRepo}+is:pr+is:merged+merged:>${dateStr}&sort=updated&order=desc`
        );
        mergedPRs = prSearch.items || [];
      } catch {
        // Search might fail, not critical
      }

      diffs.push({
        name: repo.name,
        latestRelease: tag,
        releasedAt: releaseDate,
        defaultBranch,
        commits: compare.commits.map((c) => ({
          sha: c.sha.slice(0, 7),
          message: c.commit.message.split("\n")[0],
          author: c.author?.login || c.commit.author?.name || "unknown",
        })),
        pullRequests: mergedPRs.map((pr) => ({
          number: pr.number,
          title: pr.title,
          author: pr.user?.login || "unknown",
          mergedAt: pr.pull_request?.merged_at || "",
        })),
      });
    } catch (err) {
      console.error(`Warning: failed to process ${repo.name}: ${err.message}`);
    }
  }

  diffs.sort((a, b) => b.commits.length - a.commits.length);

  console.log(
    JSON.stringify({
      success: true,
      message: `Found changes in ${diffs.length} repos since their latest release`,
      org,
      fetchedAt: new Date().toISOString(),
      repos: diffs,
    })
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, message: err.message }));
  process.exit(1);
});
