# anylm-github-relay

A small Cloudflare Worker with one job: receive GitHub webhooks (Issues,
Pull requests, Projects v2) and write a normalized copy into AnyLM's
Firestore, because the AnyLM desktop app has no public address of its own
for GitHub to call. See `../docs/github-projects-sync.md` for the full
picture.

## Deploy

```
cd cloudflare-github-relay
npm install
npx wrangler login
npx wrangler secret put GITHUB_WEBHOOK_SECRET     # any random string you generate
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON  # paste the whole key JSON, one line
npx wrangler deploy
```

`wrangler deploy` prints the Worker's URL — that's what you point the
GitHub webhook at (Settings -> Webhooks -> Add webhook, content type
`application/json`, secret = the same string you put above, events: Issues,
Pull requests, Projects v2).

## Local test

```
npm run dev
```

`wrangler dev` runs the Worker locally and prints a URL; `smee.io` or
`ngrok http` can forward a real GitHub webhook to it for testing before you
deploy.
