# GitHub Projects (v2) sync — design

## Goal

Mirror a GitHub Projects v2 board (issues, pull requests, draft items, custom
fields, and views) inside AnyLM, kept in near-real-time and writable both
ways, without adding a paid server. AnyLM currently has *no server at all*
(Firebase Spark plan, no Cloud Functions — see `firebase/README.md` and
project memory `anylm-firebase-migration`), so a GitHub webhook, which needs
a public HTTPS endpoint, cannot land on the Electron app directly. This
design adds exactly one small piece of new infrastructure to close that gap:
a Cloudflare Worker.

## Data flow

```
GitHub repo/org
   |  (webhook: issues, pull_request, projects_v2, projects_v2_item)
   v
Cloudflare Worker  (cloudflare-github-relay/)
   - verifies X-Hub-Signature-256 against a shared secret
   - normalizes the event into a small doc
   - writes it to Firestore using a Google service account
   |
   v
Firestore  (githubProjects, githubProjectItems collections)
   ^
   |  (initial full sync + manual "resync", GraphQL reads/writes)
   |
Electron main (app/src/main/github/)
   - GitHub OAuth (loopback flow, same pattern as oauth/loopback.ts)
   - GraphQL client against api.github.com for Projects v2
   - short-poll against Firestore (every ~3s while a board is open) since
     the app talks to Firestore over REST, not the JS SDK, and has no
     always-on server-sent-events channel
   - pushes diffs to the renderer over the existing IPC channel
   |
   v
Renderer (app/src/renderer/js/github-projects.ts)
   - Table / Board / Roadmap views, custom fields, filter/sort/group
   - edits go back out through Electron main -> GitHub GraphQL mutations
```

"Real-time" here means: GitHub -> Worker -> Firestore is push-based and
typically lands in under a second; Firestore -> open AnyLM window is a fast
poll (a few seconds), which is indistinguishable from push for a project
board's timescale. True server push into Firestore would need the
firebase-js-sdk's listen channel or gRPC streaming, which the app
deliberately avoids (see `anylm-firebase-migration` memory) because it needs
browser storage / a persistent connection model the REST-based main process
doesn't have. Polling was the pragmatic choice; it can be swapped for a
websocket-based listen channel later without changing the schema.

## Firestore schema

Two new top-level collections, alongside the existing org/usage ones.
GitHub tokens are **never** written to Firestore — they stay in the OS
keychain via Electron's `safeStorage`, same as other app secrets. Only
project *data* (titles, fields, statuses) is synced.

`githubProjects/{projectId}`
  - `projectId` = the GitHub Projects v2 node ID (stable, opaque)
  - `ownerUid` — the AnyLM user who connected this project (rules key)
  - `ownerLogin`, `repoOrOrgName`, `number`, `title`, `url`
  - `fields`: array of `{ id, name, dataType, options? }` — mirrors every
    field type GitHub's Projects page supports: text, number, date,
    single-select, iteration, milestone, tracked-by/tracks (read-only),
    assignees/labels/linked-repos (read-only)
  - `views`: array of `{ id, name, layout: 'table'|'board'|'roadmap',
    groupBy?, sortBy?, filter? }`
  - `updatedAt`

`githubProjectItems/{itemId}`
  - `itemId` = the GitHub node ID of the project item
  - `projectId`, `ownerUid`
  - `contentType`: `'Issue' | 'PullRequest' | 'DraftIssue'`
  - `title`, `url`, `state`, `assignees`, `labels`, `milestone`
  - `fieldValues`: `{ [fieldId]: value }`
  - `updatedAt`

## Firestore rules (additions)

- A user may read/write `githubProjects/*` and `githubProjectItems/*` only
  where `resource.data.ownerUid == uid()` (or, on create, `request.resource
  .data.ownerUid == uid()`).
- The Cloudflare Worker writes with a Google service account, which is
  Admin-SDK-equivalent and bypasses rules entirely — that's why the Worker
  is the only thing trusted to fan events in from GitHub without a user
  already being signed in to attribute them to.

## Manual, one-time setup (needs your accounts, not something I can do for you)

1. Create a GitHub OAuth App (or GitHub App) under your GitHub account/org
   settings, scoped to `repo` + `read:project`/`project` — gives us a
   client ID for the loopback OAuth flow.
2. `wrangler login` + `wrangler deploy` the Worker in
   `cloudflare-github-relay/` (free tier). Set two secrets:
   `GITHUB_WEBHOOK_SECRET` (random string, also entered when registering
   the webhook) and `GOOGLE_SERVICE_ACCOUNT_JSON` (a Firebase service
   account key with Firestore write access, from Firebase console ->
   Project settings -> Service accounts).
3. Register a webhook on the repo/org (Settings -> Webhooks, or via the
   GitHub App's webhook config) pointing at the deployed Worker URL,
   content type `application/json`, events: Issues, Pull requests,
   Projects v2.

Everything else — the Electron auth flow, GraphQL sync, polling, and the
board UI — ships in the app and needs no further setup from you.
