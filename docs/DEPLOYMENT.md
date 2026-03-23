# Deployment

NanoClaw runs on a GCP VM as two sibling Docker containers. Deployment is automated via GitHub Actions on every push to `main`.

## How it works

The workflow (`.github/workflows/deploy.yml`) does the following on every push to `main`:

1. SSHs into the GCP VM (with host fingerprint verification)
2. Writes the `.env` file from the `DOTENV` GitHub secret (owner-only permissions)
3. Checks out the exact commit SHA that triggered the deploy
4. Rebuilds both Docker images:
   - **`nanoclaw:latest`** — the host orchestrator (from root `Dockerfile`)
   - **`nanoclaw-agent:latest`** — the agent sandbox (from `container/Dockerfile`)
5. Restarts the service (`docker compose up -d --remove-orphans`)

Both images are rebuilt on every deploy for simplicity. The agent image is always rebuilt alongside the host to avoid version mismatches.

## GitHub secrets

The deploy workflow requires these secrets (repo → Settings → Secrets and variables → Actions):

| Secret                | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `VM_HOST`             | External IP of the GCP VM                             |
| `VM_USER`             | SSH username (e.g. `luc_minitap_ai`)                  |
| `VM_SSH_KEY`          | Private SSH key for the VM                            |
| `VM_HOST_FINGERPRINT` | SSH host key fingerprint (SHA256) for MITM protection |
| `DOTENV`              | Full contents of the `.env` file                      |

The deploy directory on the VM defaults to `~/nanoclaw`. To change it, set the `DEPLOY_DIR` variable in the repo's GitHub Actions variables (repo → Settings → Secrets and variables → Actions → Variables tab).

### Setting up SSH access

Generate a dedicated deploy key and add it to the VM:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/nanoclaw-deploy -C "github-actions-deploy" -N ""

# Add public key to VM
gcloud compute ssh luc_minitap_ai@nanoclaw --zone=europe-west9-a --project=minitap-sandbox \
  --command="echo '$(cat ~/.ssh/nanoclaw-deploy.pub)' >> ~/.ssh/authorized_keys"

# Copy the private key — paste this into the VM_SSH_KEY secret
cat ~/.ssh/nanoclaw-deploy
```

Get the VM's SSH host fingerprint (paste into `VM_HOST_FINGERPRINT` secret):

```bash
ssh-keyscan -t ed25519 <VM_IP> 2>/dev/null | ssh-keygen -lf - | cut -d' ' -f2
```

Get the VM's external IP:

```bash
gcloud compute instances describe nanoclaw \
  --zone=europe-west9-a --project=minitap-sandbox \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

## Environment variables

GitHub is the source of truth for all environment variables and secrets. They are stored as a single GitHub secret called `DOTENV`, which contains the full `.env` file content.

### Adding or updating a variable

1. Go to repo → Settings → Secrets and variables → Actions
2. Edit the `DOTENV` secret
3. Add or change the variable (standard `KEY=value` format, one per line)
4. Save — the change takes effect on the next deploy (push to `main`)

### Format

The `DOTENV` secret uses standard `.env` format:

```dotenv
# Required
HOST_PROJECT_ROOT=/home/luc_minitap_ai/nanoclaw
ANTHROPIC_API_KEY=sk-ant-...

# Channel tokens (add as needed)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Optional config
TZ=Europe/Paris
LOG_LEVEL=info
ASSISTANT_NAME=Andy
```

### How env vars reach containers

The host orchestrator reads `.env` directly (not via `process.env`) to keep secrets out of the process environment. When spawning agent containers, it forwards non-sensitive vars while blocking these prefixes:

- `ANTHROPIC_`, `CLAUDE_CODE_` — handled by credential proxy
- `SLACK_`, `WHATSAPP_`, `TELEGRAM_`, `DISCORD_`, `GMAIL_` — host-only channel tokens

Everything else (external API keys, feature flags, config) is passed through to agent containers as `-e` flags.

## Manual deployment

If you need to deploy without merging to `main`:

```bash
gcloud compute ssh luc_minitap_ai@nanoclaw --zone=europe-west9-a --project=minitap-sandbox \
  --command="cd ~/nanoclaw && sudo git pull && sg docker -c 'docker build -t nanoclaw:latest . && docker build -t nanoclaw-agent:latest -f container/Dockerfile container/ && docker compose up -d --remove-orphans'"
```

## Checking logs

```bash
gcloud compute ssh luc_minitap_ai@nanoclaw --zone=europe-west9-a --project=minitap-sandbox \
  --command="sg docker -c 'docker logs nanoclaw --tail 50'"
```

## Restarting without rebuild

```bash
gcloud compute ssh luc_minitap_ai@nanoclaw --zone=europe-west9-a --project=minitap-sandbox \
  --command="sg docker -c 'cd ~/nanoclaw && docker compose restart'"
```
