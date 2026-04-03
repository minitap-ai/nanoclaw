---
name: draft-release
description: Draft a release changelog by fetching diffs from all GitHub repos since their latest release and creating a Notion page. Triggers on "draft release", "draft changelog", "prepare release", "changelog".
---

# Draft Release Changelog

Fetches diffs between the latest release and main for all repos in the GitHub org, then creates a draft changelog page on Notion.

> **Compatibility:** NanoClaw v1.0.0+

## Features

| Action              | Tool                  | Description                                        |
| ------------------- | --------------------- | -------------------------------------------------- |
| Fetch release diffs | `fetch_release_diffs` | Get commits/PRs since last release for all repos   |
| Create Notion page  | `mcp__notion__*`      | Create changelog page in Changelog Cockpit database |

## Prerequisites

1. **NanoClaw is installed and running** with Slack channel connected
2. **Environment variables** in `.env`:
   ```bash
   GITHUB_TOKEN=ghp_xxx          # GitHub personal access token with repo scope
   GITHUB_ORG=minitap-ai         # GitHub organization (default: minitap-ai)
   NOTION_API_KEY=secret_xxx     # Notion integration token (already configured)
   ```
3. **Notion integration** has access to the Changelog Cockpit database

## How It Works

```
User: "@Mega draft release"
  |
  v
Agent calls fetch_release_diffs (MCP tool)
  |                                         Host side:
  |--- IPC task ---> src/release-handler.ts
  |                    |
  |                    +-> GitHub API: list org repos
  |                    +-> For each repo: get latest release
  |                    +-> Compare release tag vs main
  |                    +-> Get merged PRs since release
  |                    |
  |<-- IPC result ---+  (JSON with diffs per repo)
  |
  v
Agent (Claude) writes user-facing changelog
  from raw diffs (marketing style, grouped by feature)
  |
  v
Agent calls Notion MCP tools:
  1. API-post-page: create page in Changelog Cockpit DB
  2. API-patch-block-children: add formatted content blocks
  |
  v
Agent confirms on Slack with Notion page link
```

## Architecture

**Host side (`src/release-handler.ts`):**
- Handles `release_fetch_diffs` IPC type
- Reads `GITHUB_TOKEN` from `.env` via `readEnvFile()`
- Uses native `fetch()` to call GitHub REST API
- Returns structured JSON: org, repos[], commits[], pullRequests[]

**Container side (`container/agent-runner/src/ipc-mcp-stdio.ts`):**
- `fetch_release_diffs` MCP tool (registered on the nanoclaw MCP server)
- Writes IPC task, polls for result (180s timeout)
- Returns diffs JSON to the agent

**Notion (already available via `mcp__notion__*`):**
- Agent uses existing Notion MCP server to create the page
- No additional integration needed

## Integration Points

### Host: `src/ipc.ts`

The release handler is imported and called in the `processTaskIpc` default case:

```typescript
import { handleReleaseIpc } from './release-handler.js';

// In processTaskIpc switch default:
const handled = await handleReleaseIpc(data, sourceGroup, isMain, DATA_DIR);
if (!handled) {
  logger.warn({ type: data.type }, 'Unknown IPC task type');
}
```

### Container: `container/agent-runner/src/ipc-mcp-stdio.ts`

The `fetch_release_diffs` tool is added directly to the nanoclaw MCP server.

### Agent instructions: `groups/main/CLAUDE.md`

The "Release Changelog Drafting" section tells the agent how to:
- Format the changelog (marketing style)
- Create the Notion page with correct database ID and properties
- Use the right Notion block types (headings, paragraphs, bullets, dividers)

## Notion Database

**Database ID:** `302cf438-d3ea-80b6-b54a-ee60b8d1d97b`

**Properties:**
- `Name` (title): Format `"DD.MM.YY - Short descriptive title"`
- `Date` (date): Release date (ISO format `YYYY-MM-DD`)
- `Status` (status): `"Draft"` initially, manually changed to `"Published"`

**Content structure:**
- Intro paragraph (1-2 sentences summarizing the release)
- `---` divider
- Per-feature sections: H2 with emoji + title, paragraphs, bullet points
- `[Demo video/screenshot placeholder]` where media should go
- `---` divider between sections
- Final callout block

## Troubleshooting

### GITHUB_TOKEN not found
```bash
# Add to .env
echo "GITHUB_TOKEN=ghp_your_token_here" >> .env
```

### Notion page creation fails
- Verify the Notion integration has access to the Changelog Cockpit database
- Check that `NOTION_API_KEY` is in `.env`

### Timeout on fetch_release_diffs
The tool has a 180s timeout. If the org has many repos, some may be skipped.
Check host logs:
```bash
grep "release" logs/nanoclaw.log | tail -20
```
