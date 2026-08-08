# Electron Site Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Electron app to the landing site’s void/slime/glass language, replace the coral “A” icon and in-app logo with the constellation mark, and set window title / About / menu from packaged vs unpackaged.

**Architecture:** Introduce a tiny `product.ts` helper for display naming; replace brand assets (SVG mark + 1024 PNG icon); rewrite renderer CSS tokens and chrome (auth, sidebar, panes, modals, buttons) to glass/nebula while keeping IA and flows. Dark-first; light/system stay as lifted variants of the same tokens.

**Tech Stack:** Electron, vanilla TypeScript/HTML/CSS under `app/`, Bun tests, electron-builder icon at `app/build/icon.png`.

**Spec:** `docs/superpowers/specs/2026-08-08-electron-site-theme-redesign-design.md`

## Global Constraints

- Product name remains **AnyLM** (base); unpackaged display name is exactly `AnyLM (Dev)`.
- Visual depth: near-full chrome restyle (approach 1 — app-native shell, not marketing layout clone).
- Keep light / dark / system in `theme.ts`; dark is the site match; light uses the same token system with lifted surfaces (no WorkVar forest/paper palette).
- No IA / IPC / settings semantics changes.
- Prefer SVG glyphs over emoji where icons are touched.
- Respect `prefers-reduced-motion` for decorative nebula/pulse.
- Active sidebar highlight stays a **symmetric** pill.
- Do **not** commit unless the user asks.
- After TypeScript changes: `cd app && bun run typecheck`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app/src/main/product.ts` | `PRODUCT_NAME`, `productDisplayName(isPackaged)` |
| `app/src/main/product.test.ts` | Unit tests for display name |
| `app/main.ts` | `setName`, window `title`, About panel use display name |
| `app/src/main/menu.ts` | Menu labels from display name; DevTools unpackaged-only; Check for Updates packaged-only |
| `app/src/renderer/assets/logo-mark.svg` | In-app constellation mark (black/currentColor on transparent) |
| `app/build/icon.svg` | Source art for app icon (void squircle + slime mark) |
| `app/build/icon.png` | 1024×1024 app/dock/About/builder icon (replace coral “A”) |
| `app/scripts/render-icon.mjs` | One-shot SVG → PNG via `@resvg/resvg-js` (devDependency or bunx) |
| `app/src/renderer/index.html` | Fonts, SVG brand marks on auth + sidebar, drop PNG brand imgs |
| `app/src/renderer/styles.css` | Token rewrite + glass/nebula + chrome restyle |

---

### Task 1: Product display name helper + menu/window wiring

**Files:**
- Create: `app/src/main/product.ts`
- Create: `app/src/main/product.test.ts`
- Modify: `app/main.ts`
- Modify: `app/src/main/menu.ts`

**Interfaces:**
- Produces:
  - `export const PRODUCT_NAME = "AnyLM"`
  - `export function productDisplayName(isPackaged: boolean): string` → `"AnyLM"` if packaged, else `"AnyLM (Dev)"`
- Consumes: `app.isPackaged` at call sites in `main.ts` / `menu.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/main/product.test.ts
import { describe, expect, test } from "bun:test";
import { PRODUCT_NAME, productDisplayName } from "./product";

describe("productDisplayName", () => {
  test("packaged is AnyLM", () => {
    expect(productDisplayName(true)).toBe("AnyLM");
  });

  test("unpackaged is AnyLM (Dev)", () => {
    expect(productDisplayName(false)).toBe("AnyLM (Dev)");
  });

  test("PRODUCT_NAME stays AnyLM", () => {
    expect(PRODUCT_NAME).toBe("AnyLM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/product.test.ts`

Expected: FAIL (module not found / export missing)

- [ ] **Step 3: Implement `product.ts`**

```ts
// app/src/main/product.ts
export const PRODUCT_NAME = "AnyLM";

export function productDisplayName(isPackaged: boolean): string {
  return isPackaged ? PRODUCT_NAME : `${PRODUCT_NAME} (Dev)`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && bun test src/main/product.test.ts`

Expected: PASS

- [ ] **Step 5: Wire `main.ts`**

Replace hard-coded `"AnyLM"` name/title/About with:

```ts
import { PRODUCT_NAME, productDisplayName } from "./src/main/product";

const displayName = productDisplayName(app.isPackaged);
app.setName(displayName);

// in createWindow:
title: displayName,

// in whenReady About:
app.setAboutPanelOptions({
  applicationName: displayName,
  applicationVersion: app.getVersion(),
  iconPath: APP_ICON,
  credits: "A local-first LLM workspace.",
});
```

Keep `PRODUCT_NAME` available for any copy that must stay brand-only (not Dev-suffixed). Do not change protocol scheme or `appId`.

- [ ] **Step 6: Wire `menu.ts`**

```ts
import { app, Menu, shell, BrowserWindow } from "electron";
import { productDisplayName } from "./product";

function build(): Menu {
  const name = productDisplayName(app.isPackaged);
  const packaged = app.isPackaged;
  // ... mac app menu uses `name` for About/Hide/Quit labels ...

  const viewSubmenu: Electron.MenuItemConstructorOptions[] = [
    { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: () => send("menu:sidebar") },
    { label: "Toggle Context Panel", accelerator: "CmdOrCtrl+Shift+B", click: () => send("menu:rail") },
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];
  if (!packaged) {
    viewSubmenu.push({ role: "toggleDevTools" });
  }
  template.push({ label: "View", submenu: viewSubmenu });

  const helpSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: `${PRODUCT_NAME} on GitHub`, // always brand name, not Dev
      click: () => shell.openExternal("https://github.com/workvar/AnyLM"),
    },
  ];
  if (packaged) {
    helpSubmenu.push({ label: "Check for Updates…", click: () => send("menu:check-updates") });
  }
  template.push({ role: "help", submenu: helpSubmenu });
  // ...
}
```

Import `PRODUCT_NAME` from `./product` for the GitHub label. Stop using `app.getName()` for menu construction so tests of naming stay pure; runtime menu still reflects `productDisplayName(app.isPackaged)`.

- [ ] **Step 7: Typecheck**

Run: `cd app && bun run typecheck`

Expected: PASS

---

### Task 2: Constellation brand mark + app icon

**Files:**
- Create: `app/src/renderer/assets/logo-mark.svg`
- Create: `app/build/icon.svg`
- Create: `app/scripts/render-icon.mjs`
- Replace: `app/build/icon.png`
- Modify: `app/src/renderer/index.html` (brand markup only in this task; fonts can wait for Task 3)

**Interfaces:**
- Produces: SVG mark used as `<img class="brand-mark" src="assets/logo-mark.svg">` (path relative to renderer HTML after copy-assets)
- Icon geometry matches Nav mark: center circle + 8 rays (see `web/components/site/Nav.tsx`)

- [ ] **Step 1: Add in-app SVG mark**

Create `app/src/renderer/assets/logo-mark.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="3" fill="currentColor"/>
  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

Note: `currentColor` does not apply through `<img>`. For `<img>` use a filled variant: black glyph on transparent, and wrap in a slime circle via CSS (preferred — matches site Nav).

Preferred markup pattern (site-faithful):

```html
<span class="brand-badge" aria-hidden="true">
  <svg viewBox="0 0 24 24" class="brand-badge-icon" fill="none">
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
</span>
```

Inline the SVG in `index.html` for auth (`.brand-mark.lg` size) and sidebar (default size). Remove `<img … icon.png>` brand usages.

- [ ] **Step 2: Add `app/build/icon.svg` (1024 artboard)**

Void/ink rounded-rect background + slime (#7df9a6) circular badge with black constellation glyph centered. Use a squircle-like `rx` (~22% of side). Exact SVG:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="224" fill="#0a0c10"/>
  <circle cx="512" cy="512" r="220" fill="#7df9a6"/>
  <g transform="translate(512 512) scale(14) translate(-12 -12)" fill="none">
    <circle cx="12" cy="12" r="3" fill="#05060a"/>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
          stroke="#05060a" stroke-width="1.5" stroke-linecap="round"/>
  </g>
</svg>
```

- [ ] **Step 3: Add render script and generate PNG**

`app/scripts/render-icon.mjs`:

```js
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "build", "icon.svg"));
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
writeFileSync(join(root, "build", "icon.png"), resvg.render().asPng());
console.log("wrote build/icon.png");
```

Run (from `app/`):

```bash
bunx --bun @resvg/resvg-js --version 2>/dev/null || true
bun add -d @resvg/resvg-js
node scripts/render-icon.mjs
# or: bun scripts/render-icon.mjs
```

Verify: `file build/icon.png` → PNG 1024×1024. Sample center should be slime/black, not coral.

If `@resvg/resvg-js` install fails, fall back to generating PNG via a short Electron offscreen load of the SVG, or macOS `qlmanage -t` — document which fallback was used. Keep `icon.svg` in repo as source of truth.

- [ ] **Step 4: Update brand markup in `index.html`**

Replace auth and sidebar logo `<img class="brand-mark…">` with the inline `.brand-badge` + SVG pattern. Keep visible text `AnyLM`. Leave `<link rel="icon" href="../../build/icon.png">` pointing at the new PNG (path unchanged).

- [ ] **Step 5: Confirm copy-assets picks up `assets/`**

`scripts/copy-assets.js` already copies non-`.ts` trees under `src/renderer` recursively — `assets/logo-mark.svg` is copied if present. If only inline SVG is used, no extra asset file is required; either approach is fine as long as auth + sidebar show the constellation mark.

---

### Task 3: Design tokens, fonts, glass/nebula utilities

**Files:**
- Modify: `app/src/renderer/styles.css` (top `:root` tokens + new utility classes + `body` font)
- Modify: `app/src/renderer/index.html` (font loading)

**Interfaces:**
- Produces CSS variables used by later chrome tasks:
  - Dark (default / `data-theme="dark"`): map `--bg`→void, `--panel`→ink/void-soft, `--accent`→slime, `--muted`→mist, `--warn`→bile, glass borders
  - Light (`data-theme="light"`): lifted surfaces, slime-deep accent, mist-equivalent muted — **not** WorkVar paper/forest

- [ ] **Step 1: Load fonts in `index.html`**

Add before `styles.css`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
  rel="stylesheet"
/>
```

(Offline-hardening with local woff2 is optional follow-up; CDN is acceptable for this pass.)

- [ ] **Step 2: Replace token blocks in `styles.css`**

Replace the WorkVar comment and both `:root` / `[data-theme="light"]` blocks with:

```css
/* AnyLM site palette: void / slime / mist / glass (matches web/app/globals.css). */
:root,
:root[data-theme="dark"] {
  --bg: #030405;
  --panel: #0a0c10;
  --panel-2: #12151c;
  --border: rgba(255, 255, 255, 0.1);
  --text: #eef1f7;
  --muted: #9aa3b8;
  --accent: #7df9a6;
  --accent-2: #2fbf6d;
  --accent-grad: linear-gradient(135deg, #7df9a6, #2fbf6d);
  --accent-contrast: #05060a;
  --danger: #ff5a5a;
  --ok: #7df9a6;
  --warn: #ffd166;
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 8px 26px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 12px 34px rgba(0, 0, 0, 0.55);
  --overlay-bg: rgba(0, 0, 0, 0.62);
  --glass: rgba(255, 255, 255, 0.04);
  --glass-border: rgba(255, 255, 255, 0.1);
}

:root[data-theme="light"] {
  --bg: #f4f6f8;
  --panel: #ffffff;
  --panel-2: #e8ecf2;
  --border: rgba(18, 21, 28, 0.12);
  --text: #12151c;
  --muted: #5c6578;
  --accent: #2fbf6d;
  --accent-2: #249a57;
  --accent-grad: linear-gradient(135deg, #3ddc84, #2fbf6d);
  --accent-contrast: #ffffff;
  --danger: #c04a3a;
  --ok: #2fbf6d;
  --warn: #b07314;
  --shadow-sm: 0 1px 2px rgba(18, 21, 28, 0.06);
  --shadow-md: 0 8px 24px rgba(18, 21, 28, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --overlay-bg: rgba(0, 0, 0, 0.35);
  --glass: rgba(255, 255, 255, 0.72);
  --glass-border: rgba(18, 21, 28, 0.1);
}
```

Update `body` to use `font-family: var(--font-sans)`.

- [ ] **Step 3: Add glass / nebula / brand-badge utilities**

```css
.glass {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02));
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.glass-strong {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
:root[data-theme="light"] .glass,
:root[data-theme="light"] .glass-strong {
  background: var(--glass);
  border-color: var(--glass-border);
}
.nebula {
  background:
    radial-gradient(ellipse 60% 45% at 50% 20%, rgba(125, 249, 166, 0.14), transparent 70%),
    radial-gradient(ellipse 40% 35% at 15% 70%, rgba(80, 120, 100, 0.18), transparent 65%),
    radial-gradient(ellipse 45% 40% at 85% 60%, rgba(60, 90, 80, 0.16), transparent 60%);
}
.brand-badge {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  flex-shrink: 0;
}
.brand-badge.lg {
  width: 56px;
  height: 56px;
}
.brand-badge-icon {
  width: 60%;
  height: 60%;
  display: block;
}
@media (prefers-reduced-motion: reduce) {
  .nebula {
    background: var(--bg);
  }
}
```

Remove obsolete `.brand-mark` img rules or retarget them if any PNG remains for favicon only.

---

### Task 4: Auth + sidebar chrome

**Files:**
- Modify: `app/src/renderer/styles.css` (`#auth-screen`, `.auth-card`, `#sidebar`, `.logo`, `.nav-list li.active`, primary/ghost buttons as needed for these surfaces)
- Modify: `app/src/renderer/index.html` only if class hooks needed (`nebula` on auth)

- [ ] **Step 1: Auth restyle**

```css
#auth-screen {
  /* keep layout props */
  background: var(--bg);
}
#auth-screen.nebula,
#auth-screen {
  /* apply nebula via class on the element in HTML: class="nebula" on #auth-screen */
}
.auth-card {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  box-shadow: var(--shadow-lg);
}
```

Add `nebula` class to `#auth-screen` in HTML. Primary auth submit: white background / dark text with slime hover (site `btn-primary`):

```css
#auth-screen button.primary {
  background: #fff;
  color: #05060a;
}
#auth-screen button.primary:hover {
  background: var(--accent);
  color: var(--accent-contrast);
}
```

OAuth buttons: ghost/glass style (border `var(--glass-border)`, translucent fill).

Preserve existing `platform-darwin` auth overrides; only adjust colors if they fight the new glass (keep Liquid Glass compatibility).

- [ ] **Step 2: Sidebar restyle**

```css
#sidebar {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02));
  border-right: 1px solid var(--glass-border);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.logo {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.02em;
}
.nav-list li.active {
  background: color-mix(in srgb, var(--accent) 22%, var(--panel-2));
  color: var(--text);
  border-radius: 10px; /* symmetric pill — do not reintroduce asymmetric oval */
}
```

New chat primary in sidebar can stay accent slime fill (or white→slime like site CTA — prefer slime fill for density).

- [ ] **Step 3: Smoke-check in app**

Run: `cd app && bun start` (or existing `../scripts/dev.sh`)

Check: auth shows nebula + glass card + constellation badge; after sign-in, sidebar badge + slime-tinted active chat; window title is `AnyLM (Dev)`.

---

### Task 5: Main chrome restyle (panes, buttons, modals, composer, settings)

**Files:**
- Modify: `app/src/renderer/styles.css` (shared buttons, `#main`, toolbars, `.modal`, cards, composer, settings hub surfaces)

- [ ] **Step 1: Global buttons**

Align with site:

```css
button.primary {
  background: #fff;
  color: #05060a;
  border: none;
}
button.primary:hover {
  background: var(--accent);
  color: var(--accent-contrast);
  filter: none;
}
:root[data-theme="light"] button.primary {
  background: var(--accent);
  color: var(--accent-contrast);
}
:root[data-theme="light"] button.primary:hover {
  background: var(--accent-2);
}
button.ghost {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
button.ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
```

Keep `.small` / `.danger` variants working.

- [ ] **Step 2: Main pane + toolbars + cards + modals**

- `#main` background `var(--bg)`; optional very subtle nebula only if it does not hurt chat readability (prefer flat void in chat).
- `.view-toolbar`, cards, `.modal`: glass borders, `border-radius` 14–16px, translucent fills using `--panel` / glass gradients.
- Composer (`#chat-input` container): glass border, soft fill.
- Settings hub / org cards: same language; ensure text contrast ≥ 4.5:1 on glass.

Do not change element IDs or JS wiring.

- [ ] **Step 3: Focus rings**

Ensure interactive controls show a visible focus ring using slime:

```css
:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 80%, transparent);
  outline-offset: 2px;
}
```

Avoid breaking inputs that already suppress outline intentionally — prefer adding rings on buttons/tabs/links first.

- [ ] **Step 4: Typecheck**

Run: `cd app && bun run typecheck`

Expected: PASS (CSS/HTML-only task should be unaffected; run anyway after any TS touch)

---

### Task 6: Verification

**Files:** none (manual + automated checks)

- [ ] **Step 1: Unit tests**

Run: `cd app && bun test src/main/product.test.ts`

Expected: PASS

- [ ] **Step 2: Typecheck**

Run: `cd app && bun run typecheck`

Expected: PASS

- [ ] **Step 3: Visual checklist (unpackaged)**

With `bun start`:

1. Window title / About / first macOS menu = `AnyLM (Dev)`
2. View menu includes Toggle DevTools
3. Help menu does **not** include Check for Updates…
4. Dock/window icon is void+slime constellation (not coral A)
5. Auth: nebula + glass + badge; sidebar badge matches
6. Chat / projects / settings / one modal: glass language, readable
7. Toggle theme to light: still coherent (lifted tokens, not forest green)

- [ ] **Step 4: Packaged menu logic sanity**

If a full pack is heavy, temporarily force `productDisplayName(true)` / `packaged = true` in a local throwaway branch **or** add a one-line debug — prefer reading the menu code paths and confirming conditions. Optional: `electron-builder --dir` smoke if already in workflow.

Confirm intended packaged behavior: name `AnyLM`, no DevTools item, Check for Updates present.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Void/slime/mist/glass tokens | Task 3 |
| Space Grotesk + Manrope | Task 3 |
| Soft nebula on auth/chrome | Tasks 3–4 |
| Light/system kept, lifted light tokens | Task 3 |
| Auth / sidebar / panes / modals restyle | Tasks 4–5 |
| Replace coral icon + constellation mark | Task 2 |
| `AnyLM` vs `AnyLM (Dev)` | Task 1 |
| DevTools unpackaged-only | Task 1 |
| Updates packaged-only | Task 1 |
| No IA/IPC changes | Global + Tasks 4–5 |
| Typecheck + visual verify | Tasks 1, 5, 6 |
| Symmetric active pill | Task 4 |
| `prefers-reduced-motion` | Task 3 |

No TBD/placeholder steps remain after this review.
