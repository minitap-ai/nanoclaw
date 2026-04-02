---
name: github
description: Access GitHub repositories and APIs for the rodger-studio organization. Use when the user asks about code, PRs, issues, releases, or anything involving GitHub repos.
allowed-tools: Bash(gh:*),Bash(git:*)
---

# GitHub — Repository & API Access

You have access to GitHub via the `gh` CLI. Authentication is pre-configured via `$GITHUB_TOKEN` (auto-provisioned, no setup needed).

## Organization

**rodger-studio** — all repos the GitHub App is installed on are accessible.

## Common Operations

### Repositories

```bash
# List repos
gh repo list rodger-studio

# Clone a repo
gh repo clone rodger-studio/rodger-apps

# View repo info
gh repo view rodger-studio/rodger-apps
```

### Pull Requests

```bash
# List open PRs
gh pr list -R rodger-studio/rodger-apps

# View a specific PR
gh pr view 123 -R rodger-studio/rodger-apps

# View PR diff
gh pr diff 123 -R rodger-studio/rodger-apps
```

### Issues

```bash
# List open issues
gh issue list -R rodger-studio/rodger-apps

# View an issue
gh issue view 456 -R rodger-studio/rodger-apps
```

### API Calls

```bash
# Direct API access for anything not covered by gh subcommands
gh api repos/rodger-studio/rodger-apps/commits?per_page=5

# Get authenticated user/app info
gh api /user
```

### Code Search

```bash
# Search code in a repo
gh search code "className" --repo rodger-studio/rodger-apps
```

## Notes

- The token is scoped to repositories where the GitHub App is installed
- Token is auto-refreshed — no manual auth needed
- For large repos, prefer `gh api` with pagination over cloning the entire repo
- Use `--json` flag for machine-readable output: `gh pr list --json number,title,state`
