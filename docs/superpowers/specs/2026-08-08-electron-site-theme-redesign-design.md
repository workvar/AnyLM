# AnyLM Electron — site theme redesign

**Date:** 2026-08-08  
**Status:** Approved — awaiting implementation plan  
**Scope:** Electron desktop app under `app/` (renderer chrome + brand assets + run-mode naming/menu)

## Goal

Restyle the AnyLM Electron app to share the landing site’s dark glass / void / slime visual language (`web/`), replace the coral “A” icon and in-app logo with the site constellation mark, and make window title / About / application menu reflect packaged vs unpackaged runs.

## Decisions (approved)

| Decision | Choice |
| --- | --- |
| Visual depth | **C** — Near-full visual redesign of chrome surfaces |
| Approach | **1** — Shared design tokens + app-native shell (not a marketing layout clone) |
| Run-mode naming | **A** — Packaged vs unpackaged only (`AnyLM` vs `AnyLM (Dev)`) |
| Theme modes | **A** — Dark-first to match the site; keep light/system as secondary |
| Brand assets | Apply site constellation mark directly (no alternate icon exploration) |
| Product name | Keep **AnyLM** |

## Visual system

Port the marketing tokens into Electron CSS variables (map onto existing `--bg`, `--panel`, `--accent`, etc. or replace them consistently):

| Token | Value (site) | Role in app |
| --- | --- | --- |
| void | `#030405` | App background |
| void-soft | `#0a0c10` | Secondary wash |
| ink | `#12151c` | Panels / elevated surfaces |
| slime | `#7df9a6` | Accent, active states, focus, ok-adjacent highlights |
| slime-deep | `#2fbf6d` | Accent hover / pressed |
| bile | `#ffd166` | Warnings / waiting attention |
| mist | `#9aa3b8` | Secondary / muted text |
| glass / glass-border | rgba whites | Frosted panels, borders |

**Typography**

- Display / brand / section titles: **Space Grotesk**
- UI body: **Manrope**
- Load via local `@font-face` or equivalent in the renderer (no Next.js `next/font` dependency)
- Avoid default system-only stacks for display headings

**Atmosphere**

- Soft nebula wash (radial slime/gray glows at low opacity) on auth and main chrome
- Do **not** mount a full interactive constellation canvas across every pane
- Prefer SVG glyphs over emoji where icons are touched in this pass
- Respect `prefers-reduced-motion` for decorative animation

**Light theme**

- Keep light / dark / system behavior in `theme.ts`
- Light mode uses the same token system with lifted surfaces (not the old WorkVar paper/forest palette)
- Dark remains the default visual match to the site

## Surfaces

Keep information architecture and flows. Restyle chrome:

1. **Auth screen** — Glass card on nebula void; constellation mark + AnyLM wordmark; primary button white with slime hover; ghost secondary where needed.
2. **Sidebar** — Glass-strong strip; brand row with SVG mark; active chat = slime-tinted symmetric pill.
3. **Main panes / toolbars / composer** — Glass borders, softer fills, pill controls where already pill-shaped.
4. **Modals / settings hub / cards** — Same glass language; contrast ≥ 4.5:1 for body text on glass.

No changes to chat/project/settings behavior, IPC, or navigation destinations.

## Brand assets

**Problem:** `app/build/icon.png` is a coral→pink gradient with a white stylized “A”. The site Nav uses a slime circle with a hub + ray constellation glyph.

**Solution:**

- Replace `app/build/icon.png` with a **1024×1024** app icon: void/ink squircle background, slime hub + ray mark (same geometry as `web/components/site/Nav.tsx`).
- Add an in-app **SVG** brand mark for auth + sidebar (crisp at all DPIs); stop relying on the PNG for in-UI logo.
- Dock / window / About panel / electron-builder continue to use `build/icon.png`.
- `package.json` `build.icon` path stays `build/icon.png`.

## Run-mode naming & menu

Derive a single display name from `app.isPackaged`:

| | Unpackaged (`bun start`) | Packaged |
| --- | --- | --- |
| Display name | `AnyLM (Dev)` | `AnyLM` |
| `app.setName` / window title / About / macOS app menu | Dev name | `AnyLM` |
| View → Toggle DevTools | Present | Hidden |
| Help → Check for Updates… | Omitted | Present |

Implement a small shared helper (e.g. `app/src/main/product.ts`) exporting `PRODUCT_NAME` (`"AnyLM"`) and `productDisplayName()` so `main.ts`, About panel, and `menu.ts` stay consistent.

Credits / About copy may stay product-accurate (“local-first LLM workspace” / router positioning); no need to mirror marketing tagline verbatim.

## Architecture

| Area | Files |
| --- | --- |
| Tokens + chrome CSS | `app/src/renderer/styles.css` |
| Markup / brand / fonts | `app/src/renderer/index.html` (+ SVG asset if extracted) |
| Theme resolve | `app/src/renderer/js/theme.ts` (behavior kept; tokens drive paint) |
| App icon | `app/build/icon.png` |
| Display name + About + window | `app/main.ts`, new `app/src/main/product.ts` |
| Menu differences | `app/src/main/menu.ts` |

**Out of scope**

- Changing chat / project / settings semantics or IPC
- Full marketing constellation as a live desktop backdrop
- Renaming the product away from AnyLM
- Website (`web/`) changes beyond borrowing tokens and mark geometry
- Removing light/system themes
- Auth-backend or Firebase changes

## Accessibility & quality

- Body text on glass: contrast ≥ 4.5:1
- Visible focus rings on interactive controls
- Decorative nebula / pulse respects `prefers-reduced-motion`
- Active sidebar highlight remains a **symmetric** pill (no asymmetric oval regression)

## Verification

1. Visual: auth, sidebar, chat, projects, settings hub, one modal — dark default + quick light check.
2. Run-mode: unpackaged shows `AnyLM (Dev)` in title/menu; DevTools present; Check for Updates omitted.
3. Packaged / simulated packaged path: `AnyLM`; DevTools hidden; Check for Updates present.
4. `cd app && bun run typecheck`.

## Success criteria

- Electron app reads as the same brand as the landing site (void / slime / glass).
- Icon and in-app logo match the constellation mark, not the coral “A”.
- Unpackaged vs packaged naming and menu differences work as specified.
- Existing flows still work; typecheck passes.
