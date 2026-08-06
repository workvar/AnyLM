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
| `/`         | Hero with a one-click download for the visitor's OS, the scroll animation, features |
| `/download` | Every asset in the latest release, grouped by platform and arch      |
| `/releases` | Full version history, so older builds stay reachable                 |
| `/api/releases`, `/api/releases/latest` | JSON, same data, for anything else that needs it |

## The animation

`components/home/MonsterScroll.tsx` drives everything from a single scroll
progress value: a small monster (one duplicated model process) drifts toward a
larger one (the router), which opens its jaws, swallows it and settles into a
single endpoint. `prefers-reduced-motion` swaps it for a static block of text.
