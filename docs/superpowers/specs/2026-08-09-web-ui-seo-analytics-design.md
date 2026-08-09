# Web UI polish, SEO, and analytics

**Date:** 2026-08-09  
**Status:** Approved (design)  
**Approach:** Minimal polish in place (Approach A) + env-gated SEO/analytics  
**Surfaces:** `web/` marketing site only (`app/`, `components/`, `lib/`, `public/`)

## Problem

The download and home surfaces have concrete UX/SEO gaps:

1. Release notes render as raw markdown (hashes, asterisks visible).
2. Download asset rows truncate filenames; format pills obscure the action; “Built by GitHub Actions” adds noise.
3. “Everything the router does” ends on an incomplete last row (8 cards / 3 columns).
4. Drop-in code sample is mono-green — not real syntax coloring.
5. Skills catalog looks sparse; groups do not fill rows.
6. Site lacks favicon/OG assets, rich metadata, sitemap/robots, search verification hooks, and analytics (GA4 + Microsoft Clarity).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | `web/` only; no Electron app changes |
| Markdown | `react-markdown` + `remark-gfm` (GitHub-flavored release bodies) |
| Asset row | Full filename (small mono, wrap), size under name, download icon (green on hover); remove format pill |
| Features grid | Keep 8 shipped; add 1 Coming soon → 9 cards (3×3 on `lg`) |
| Upcoming content | From app roadmap (cloud API backends, Phase 2+ agents, connectors, etc.) |
| Code highlight | Hand-tokenized Python snippet using reference palette (not Shiki/Prism) |
| Skills fill | Pad each Skills group to a full desktop row with Coming soon cards |
| Analytics IDs | Env placeholders; scripts load only when set |
| Search verify | Env-driven Google + Bing `metadata.verification` |
| Icons / OG | Static assets under `web/public/` + Next Metadata API; brand-matched dark OG image |

## Goals

1. Release notes readable as formatted markdown.
2. Download rows show the full artifact name and a clear download affordance.
3. Features and Skills grids have no empty holes on desktop; Coming soon is explicit.
4. Drop-in sample uses multi-token syntax colors matching the reference aesthetic.
5. Site ships favicon + OG/Twitter cards + robots/sitemap + JSON-LD.
6. GA4 and Clarity are ready via env vars without breaking local/dev when unset.

## Non-goals

- Creating GA / Clarity / Search Console / Bing accounts or submitting sitemaps.
- Committing real measurement IDs or verification tokens.
- Full Prism/Shiki pipeline or a CMS for release notes.
- Redesigning the entire landing beyond the listed sections.
- Changing release fetch / GitHub API behavior.
- Electron desktop theming or in-app UI.

---

## 1. Download page

### 1.1 Heading copy

In `web/app/download/page.tsx`, change the subtitle to published-date only when a release exists:

- Before: `Published {date}. Built by GitHub Actions straight from the tagged commit.`
- After: `Published {date}.`

Keep the empty-state copy unchanged.

### 1.2 Asset row

Rewrite `web/components/download/AssetRow.tsx`:

- Entire row remains an `<a href={downloadUrl}>`.
- Left stack: **label** (existing), then **filename** in smaller mono with `break-all` / wrap (no `truncate`).
- **Size** sits under the filename (mist color, small).
- Right: compact download icon (SVG arrow-into-tray). Default mist/white; on `group-hover` → slime green. No format pill (“DMG”, “Installer”, etc.).
- Keep existing hover border/background treatment on the row.

### 1.3 Release notes

Replace the preformatted dump in `web/components/releases/ReleaseNotes.tsx` with `react-markdown`.

Styles (Tailwind prose-like classes on the container / elements):

- `h1`/`h2`/`h3`: white, semibold, tighter tracking; spacing above sections
- `ul`/`ol`: mist text, disc/decimal, comfortable gap
- `strong`: white
- `a`: slime, underline on hover; `target`/`rel` via markdown components if needed
- `p`/`li`: mist, `text-sm`, relaxed leading
- `code`: mono, subtle surface; `pre`: scrollable if long

Ship `react-markdown` + `remark-gfm` together so GitHub-flavored release bodies (tables, strikethrough, task lists, autolinks) render correctly without a follow-up pass.

Reuse the same component on `/releases` cards if they share `ReleaseNotes`.

---

## 2. Features (“Everything the router does”)

File: `web/components/home/features.data.ts` + `Features.tsx`.

### 2.1 Grid symmetry

- Desktop (`lg:grid-cols-3`): exactly **9** cards → three full rows.
- Tablet (`sm:grid-cols-2`): 2-column flow; last row may be odd — acceptable.
- Mobile: single column; no empty cells.

### 2.2 Data model

Extend `Feature`:

```ts
export interface Feature {
  glyph: string;
  title: string;
  body: string;
  upcoming?: boolean; // when true, show Coming soon badge
}
```

### 2.3 Upcoming card (roadmap)

Add one shipped-count padder:

| Title | Body gist | Badge |
|-------|-----------|--------|
| Cloud API backends | Optional Claude / OpenAI (and similar) API keys as selectable backends beside local models | Coming soon |

Keep the existing 8 shipped features unchanged in copy unless a typo fix is required.

### 2.4 Badge UI

When `upcoming` is true: small pill on the card (e.g. top-right or under title) — border slime/mist, text “Coming soon”. Do not grey out the whole card; keep it readable and clearly labeled.

Add a glyph/icon for the new card (reuse an existing style; e.g. key/cloud-style path in the `ICONS` map).

---

## 3. Drop-in code sample

File: `web/components/home/CodeSample.tsx`.

Replace the single-color `<pre><code>{SNIPPET}</code></pre>` with a structured token render of the same Python OpenAI snippet.

### 3.1 Token palette (from reference)

| Token | Role | Color |
|-------|------|--------|
| Keyword / import | `from`, `import` | pink / magenta |
| Function / attribute names | `OpenAI`, `create`, `chat`, … | lime / light green |
| Strings | `"…"`, `'…'` | orange / tan |
| Punctuation | `()[]{},:=.` | off-white / light gray |
| Plain / identifiers not otherwise classified | e.g. `client`, `model` where not attribute chain | white |
| Background | panel | near-black (`bg-black/55` existing) |

Do **not** color the entire block slime green.

### 3.2 Implementation

- Prefer a small static array of `{ text, kind }` spans (hand-authored for this one snippet) over a runtime highlighter dependency.
- Preserve mono font, size (~13px), overflow-x, rounded border panel.
- Accessible: still one logical code block; decorative spans only.

---

## 4. Skills / Capabilities

Files: `capabilities.data.ts`, `Capabilities.tsx`.

### 4.1 Data model

```ts
export interface CapabilityItem {
  name: string;
  description: string;
  group?: string;
  risky?: boolean;
  upcoming?: boolean;
}
```

When `upcoming`, show the same “Coming soon” badge pattern as Features (and keep `risky` mutually exclusive in practice).

### 4.2 Skills fill (roadmap-based)

Pad so each Skills group fills a full **desktop** row (`lg:grid-cols-3` → multiples of 3):

| Group | Shipped (keep) | Add (Coming soon) |
|-------|----------------|-------------------|
| Built-in | Web research, Project-first coding | Research specialist (Phase 2+) |
| Connector | Google Calendar, Outlook | Slack connector (or equivalent chat connector) |
| User-defined | Custom skills | Shared team skills, Skill marketplace |

Resulting counts: Built-in 3, Connector 3, User-defined 3.

Tools and Platform tabs: no requirement to pad in this pass unless an uneven last row is trivial to leave; focus is Skills emptiness called out in the bug report. Optional: if Platform last row is incomplete and easy, leave as-is (many items already).

### 4.3 Copy constraints

- Do not claim Phase 2–5 multi-agent specialists as shipped.
- Upcoming cards must say Coming soon in UI, not only in data comments.

---

## 5. SEO, social, icons

### 5.1 Site config

Extend `web/lib/config.ts` (or a small `web/lib/seo.ts`):

- `SITE_URL` from `NEXT_PUBLIC_SITE_URL` with fallback `https://anylm.app` (override in env for preview/prod hosts)
- Reuse `PRODUCT_NAME`, `TAGLINE`
- Default description (existing layout copy)

### 5.2 Root metadata (`app/layout.tsx`)

Expand `Metadata`:

- `metadataBase: new URL(SITE_URL)`
- `title` template (keep)
- `description`, `keywords` (short product-relevant list)
- `applicationName`, `authors`, `creator`
- `openGraph`: type website, url, title, description, siteName, images (`/og.png`)
- `twitter`: `summary_large_image`, title, description, images
- `icons`: favicon.ico, icon.png sizes, apple-touch-icon
- `manifest` optional (`site.webmanifest`) if icons warrant it
- `verification.google` / `verification.other` for Bing from env (empty → omit)

Per-page `metadata` on `/download` and `/releases` keeps specific titles/descriptions; inherit OG defaults.

### 5.3 robots + sitemap

- `web/app/robots.ts` — allow `/`, disallow nothing critical; sitemap URL `${SITE_URL}/sitemap.xml`
- `web/app/sitemap.ts` — home, download, releases (static routes)

### 5.4 Assets

Under `web/public/` (and/or App Router file conventions where cleaner):

| Asset | Purpose |
|-------|---------|
| `favicon.ico` | Browser tab |
| `icon-192.png` / `icon-512.png` | PWA / Android-style |
| `apple-touch-icon.png` | iOS home screen |
| `og.png` | OG + Twitter (1200×630), dark bg, slime accent, “AnyLM” + tagline |

Generate simple brand-matched static images (no photo stock). Prefer SVG where Next accepts it for icons; raster for OG.

### 5.5 JSON-LD

On the home page (or root layout once): `SoftwareApplication` (name, description, url, applicationCategory, operatingSystem covering macOS/Windows/Linux) + optional `Organization` / `WebSite` with `url`. Inject via `<script type="application/ld+json">`.

---

## 6. Analytics (env-gated)

> **Analytics behavior superseded:** Event taxonomy, web modules, and full env contract live in [`2026-08-09-ga4-clarity-analytics-design.md`](./2026-08-09-ga4-clarity-analytics-design.md) (§3.7 web marketing events; §4.3–4.4 web modules/env). Implement via [`2026-08-09-ga4-clarity-analytics.md`](../plans/2026-08-09-ga4-clarity-analytics.md).

### 6.1 Env keys (`.env.example`)

```bash
NEXT_PUBLIC_SITE_URL=https://anylm.app
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_CLARITY_ID=
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_BING_SITE_VERIFICATION=
```

Use `NEXT_PUBLIC_CLARITY_ID` (not `NEXT_PUBLIC_CLARITY_PROJECT_ID`). See GA4+Clarity spec §4.4 for Vercel setup. Keep existing GitHub env keys. Do not put real secrets in the repo.

### 6.2 Client component

Per GA4+Clarity spec §4.3:

- `web/components/site/Analytics.tsx` — if `NEXT_PUBLIC_GA_MEASUREMENT_ID` set → GA4 via `next/script`; if `NEXT_PUBLIC_CLARITY_ID` set → Clarity via `next/script`; if neither set → render null
- `web/lib/analytics.ts` — marketing `track(event, params)` → `gtag`; no-op when GA ID unset
- Mount `Analytics` once from `app/layout.tsx`; wire conversion events at download/CTA/release call sites (spec §3.7)

### 6.3 Privacy / behavior

- No cookie banner in this pass (document that adding one may be required for some jurisdictions later).
- No analytics calls when IDs are empty (local/dev safe).

---

## 7. Testing / verification

- Manual: download page notes render headings/lists; filenames wrap fully; icon greens on hover.
- Manual: Features = 9 cards, 3 per row at `lg`; Skills groups fill 3 columns.
- Manual: Drop-in colors are multi-token, not all green.
- `npm run typecheck` / `npm run build` in `web/`.
- With env empty: build succeeds; no GA/Clarity network requests.
- With env set locally: scripts appear in document.

---

## 8. File touch list (expected)

| Path | Change |
|------|--------|
| `web/package.json` | add `react-markdown` + `remark-gfm` |
| `web/components/releases/ReleaseNotes.tsx` | markdown render |
| `web/components/download/AssetRow.tsx` | layout / icon |
| `web/app/download/page.tsx` | subtitle copy |
| `web/components/home/features.data.ts` | upcoming feature |
| `web/components/home/Features.tsx` | badge + icon |
| `web/components/home/CodeSample.tsx` | token colors |
| `web/components/home/capabilities.data.ts` | upcoming skills |
| `web/components/home/Capabilities.tsx` | badge |
| `web/app/layout.tsx` | metadata + Analytics |
| `web/lib/config.ts` or `web/lib/seo.ts` | site URL / SEO helpers |
| `web/app/robots.ts` | new |
| `web/app/sitemap.ts` | new |
| `web/components/site/Analytics.tsx` | new |
| `web/public/*` icons + `og.png` | new |
| `web/.env.example` | new public env keys |

---

## Self-review checklist

- [x] No TBD/TODO placeholders left in requirements
- [x] Upcoming content sourced from roadmap; not claimed as shipped
- [x] Analytics/verification are env-gated
- [x] Scope limited to `web/`
- [x] Single implementation plan is enough (UI polish + SEO/analytics together)
