# web

Marketing and download site for the AnyLM desktop app. Next.js 15, App Router,
Tailwind v4, framer-motion.

## Run it

```
cd web
npm install
cp .env.example .env.local   # optional, defaults point at workvar/AnyLM
npm run dev
```

## How downloads work

Nothing about the binaries is stored here. The site reads GitHub Releases at
request time:

- `lib/github.ts` calls the GitHub REST API and caches for 5 minutes.
- `lib/releases.ts` turns asset filenames into platform, arch and format.
- `lib/pickAsset.ts` chooses the single best asset for a visitor's OS.

So the flow is: push a tag → `.github/workflows/release.yml` builds mac, Windows
and Linux → installers are attached to a GitHub Release → this site picks them
up on the next revalidate.

Set `GITHUB_TOKEN` in `.env.local` only if you hit the 60 requests/hour
unauthenticated rate limit while developing.

## Pages

| Route       | What it does                                                       |
| ----------- | ------------------------------------------------------------------ |
| `/`         | Glass hero with constellation, insights, comparison, capabilities catalog, features |
| `/download` | Every asset in the latest release, grouped by platform and arch      |
| `/releases` | Full version history, so older builds stay reachable                 |
| `/privacy`  | Local-first privacy summary (accounts vs on-device data)             |
| `/api/releases`, `/api/releases/latest` | JSON, same data, for anything else that needs it |

Open Graph image and icons live in `public/` (`og.png`, favicons). Regenerate from repo root with `node scripts/generate-press-kit.js` (requires `@resvg/resvg-js`).

## Visual language

Dark glassmorphism with mint accents: pill nav, nebula glows, constellation
backdrop, and frosted cards. Homepage content covers comparison vs peer desktop
apps, how AnyLM enhances local models, and the full skills/tools catalog from
the desktop app.
