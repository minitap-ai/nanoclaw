---
name: new-app-tickets
description: Creates the standard Notion kanban tickets for a new Rodger Studio app. Generates 8 Priority tickets (initial blockers) + 15 Backlog tickets (recurring tasks). Use when bootstrapping a new app.
user-invokable: true
argument-hint: 'App Name (e.g. "My New App")'
---

# New App Tickets

Creates all standard Notion kanban tickets for a new Rodger Studio app.

## Notion Config

- **Database ID**: `70a6004b-0db3-83ff-8847-81f022aa823e`
- **API version**: `2022-06-28`
- **Auth**: `$NOTION_API_KEY` (env var — already available)

## Known App Names (existing Notion select options)

- `Date Reminder`
- `Luna - Sleep Tracker`
- `All Good`
- `Blood Pressure`
- `Monorepo / Infra`
- `Audio Recorder`
- `Rodger BI / Website`
- `Crumb`
- `Debatium`

New names not in this list will create a new select option automatically in Notion.

## Step 1: Resolve App Name

Use `$ARGUMENTS` as the app name.

If `$ARGUMENTS` is empty → ask using `AskUserQuestion`:
- question: "Pour quelle app créer les tickets ?"
- options: the known list above + "Other" (freeform)

Store as `APP_NAME`.

## Step 2: Confirm

Display:

```
📋 Création de 23 tickets Notion pour : <APP_NAME>
  • 8 en Priority  (setup initial)
  • 15 en Backlog  (tâches récurrentes)

Continuer ?
```

Ask `AskUserQuestion` with `["Oui, créer les tickets", "Annuler"]`. Stop if cancelled.

## Step 3: Create Tickets

Use this bash helper (define it once, call it for each ticket):

```bash
create_ticket() {
  local name="$1"
  local status="$2"   # "Priority" or "Backlog"
  local types="$3"    # comma-separated, e.g. "Feature,Admin"

  TYPES_JSON=$(python3 -c "
types = [t.strip() for t in '''$types'''.split(',') if t.strip()]
import json; print(json.dumps([{'name': t} for t in types]))
")

  NAME_JSON=$(python3 -c "import json,sys; print(json.dumps('''$name'''))")

  APP_JSON=$(python3 -c "import json; print(json.dumps('$APP_NAME'))")

  curl -s -X POST "https://api.notion.com/v1/pages" \
    -H "Authorization: Bearer $NOTION_API_KEY" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d "{
      \"parent\": {\"database_id\": \"70a6004b-0db3-83ff-8847-81f022aa823e\"},
      \"properties\": {
        \"Name\": {\"title\": [{\"text\": {\"content\": $NAME_JSON}}]},
        \"App\":  {\"select\": {\"name\": $APP_JSON}},
        \"Status\": {\"status\": {\"name\": \"$status\"}},
        \"Type\": {\"multi_select\": $TYPES_JSON}
      }
    }"
}
```

Create all tickets in order, logging `✅ <name>` after each successful call.

### Priority tickets (status = "Priority")

| Name | Types |
|------|-------|
| App icon & splash screen | UI/UX, Admin |
| EAS Build & Store config (iOS + Android) | DevOps, Admin |
| RevenueCat integration — hard paywall | Feature, Admin |
| Setup RC Android | Admin |
| Onboarding flow | Feature, UI/UX |
| Attribution setup (ATT, Adjust, Meta Android) | Feature, Admin |
| PostHog project + API key setup | Admin, Chore |
| Setup Sentry | Admin, DevOps |

### Backlog tickets (status = "Backlog")

| Name | Types |
|------|-------|
| Store assets — screenshots (EN + FR) | Admin, UI/UX |
| Localized store assets (EN/FR) | Admin |
| ASO copy & keywords | Admin, Optimization |
| Progammatic ASO | Admin, Optimization |
| Error tracking setup (captureError → Sentry + PostHog) | Chore, DevOps |
| PostHog sourcemaps config | DevOps, Chore |
| Notifications settings screen | Feature |
| Push token sync & permissions handling | Chore, Fix |
| RC ↔ backend S2S integration | Feature, Chore |
| Release notes auto → Slack | Optimization, DevOps |
| OTA workflow (EAS + expo channel) | DevOps, Chore |
| Privacy policy + Store legal pages | Admin |
| Slack channel setup | Admin |
| RC Slack integration | Admin, Optimization |
| Widgets & Quick actions (iOS) | Feature, UI/UX |

## Step 4: Final Summary

```
✅ 23 tickets créés pour <APP_NAME>

Priority (8) : App icon, EAS, RevenueCat, RC Android, Onboarding, Attribution, PostHog, Sentry
Backlog (15) : Store assets, ASO, Error tracking, Notifs, RC S2S, OTA, Legal, Slack...

→ Notion : https://www.notion.so/70a6004b0db383ff884781f022aa823e
```

If any ticket failed, list them at the end.

## Notes for evolution

To add/remove/edit common tickets in the future: just edit the tables in Step 3 above. No code to change elsewhere.
