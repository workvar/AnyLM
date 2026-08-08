# Brand & press kit

Canonical assets for Product Hunt, press, and social. Binary files live in [`/press-kit`](../../press-kit/).

## Product

| | |
| --- | --- |
| Name | **AnyLM** |
| Pronunciation | “any L M” |
| Site | https://anylm.app |
| Tagline | One router. Every model. Zero duplication. |
| PH tagline | Local LLM workspace. One endpoint. Zero cloud. |

## Colors

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#0a0c10` | Backgrounds, icon plate |
| Slime | `#7df9a6` | Primary accent / brand mark |
| Mist | soft white ~60% | Secondary text on dark |

Typography on the marketing site: **Space Grotesk** (display) + **Manrope** (body).

## Logo files

| File | Size | Use |
| --- | --- | --- |
| `press-kit/logo.svg` | vector | Master mark |
| `press-kit/logo-1024.png` | 1024×1024 | App / general |
| `press-kit/logo-512.png` | 512×512 | GitHub, general |
| `press-kit/logo-240.png` | 240×240 | Product Hunt thumbnail |
| `press-kit/icon-mark.svg` | vector | Glyph only |
| `app/build/icon.png` | 1024×1024 | Electron / installers (source of truth for app) |

## Social / Open Graph

| File | Size | Use |
| --- | --- | --- |
| `press-kit/social-1200x630.png` | 1200×630 | OG, Twitter, LinkedIn, README hero |
| `web/public/og.png` | 1200×630 | Served at https://anylm.app/og.png |
| `web/public/favicon.ico` / `icon-*.png` | — | Browser chrome |

## Gallery screenshots

Place Product Hunt gallery PNGs (1270×760) in `press-kit/gallery/` as:

- `01-hero.png`
- `02-projects-rag.png`
- `03-multi-agent.png`
- `04-models.png`
- `05-endpoint.png`

Captions are in [`../launch/product-hunt.md`](../launch/product-hunt.md). Capture from a real build before launch; do not ship placeholder UI as final PH media.

## Usage

- Prefer the full wordmark “AnyLM” in headlines; the circular slime mark alone is fine at small sizes.
- Keep the mark on dark (`#0a0c10`) or on photography dark enough for `#7df9a6` contrast.
- Do not recolor the mark to purple/indigo gradients for launch creatives — stay on the mint/ink system.
