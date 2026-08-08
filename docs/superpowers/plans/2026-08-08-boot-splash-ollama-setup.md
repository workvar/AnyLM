# Boot Splash + Ollama Setup Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a logo boot splash until auth resolves (min ~1s), then after login guide users to install or start Ollama via modal → session banner, with permanent Later.

**Architecture:** Pure detect/start helpers under `app/src/main/ollama-setup/` (testable without Electron). Thin IPC + settings flag. Renderer boot splash gates first paint; `ollama-setup.ts` owns modal/banner and a sequential launch-prompt queue with first-run and embed.

**Tech Stack:** Electron main/renderer TypeScript, Bun tests (`bun:test`), existing `ollama.status()`, settings JSON, `shell.openExternal`, modal-overlay patterns.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-boot-splash-ollama-setup-design.md`
- Ollama states: `running` | `installed` | `missing`
- Platforms: Windows, macOS, Linux (Debian/Ubuntu + Arch path fallbacks)
- Install URL: `https://ollama.com/download` only (no package-manager installers)
- Later → `ollamaSetupDeclined: true` forever (no Settings reset in this plan)
- Close modal without Later → session banner; modal again next launch
- Banner stays until Later or Ollama becomes reachable (no banner X)
- Splash: auth + min ~1s only; do not wait on Ollama/projects/Chroma
- API-key skip: deferred — do not implement
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Prefer pure, injectable helpers; keep `ollama.ts` as the HTTP client

## File map

| File | Responsibility |
|------|----------------|
| `app/src/main/ollama-setup/detect.ts` | Resolve install paths + map to state given reachability |
| `app/src/main/ollama-setup/detect.test.ts` | PATH/fallback/platform cases |
| `app/src/main/ollama-setup/start.ts` | Platform start commands (injectable spawn/exec) |
| `app/src/main/ollama-setup/start.test.ts` | Command selection per platform |
| `app/src/main/ollama-setup/index.ts` | `probe()` / `startAndWait()` composing detect + reachability + poll |
| `app/src/main/ollama-setup/index.test.ts` | State mapping + poll timeout behavior |
| `app/src/main/ollama-setup/runtime.ts` | Real fs/spawn/shell wiring for IPC |
| `app/src/main/settings.ts` | Default `ollamaSetupDeclined: null` |
| `app/src/types/domain.d.ts` | `ollamaSetupDeclined` on `AppSettings` |
| `app/src/main/ipc.ts` | `ollama:probe`, `ollama:start`, `ollama:openDownload` |
| `app/preload.ts` + `api.d.ts` | Renderer API surface |
| `app/src/renderer/index.html` | `#boot-splash`, ollama modal, banner; hide auth initially |
| `app/src/renderer/styles.css` | Splash animation, banner styles |
| `app/src/renderer/js/auth.ts` | Boot gate: splash → reveal auth or app |
| `app/src/renderer/js/ollama-setup.ts` | Modal/banner UI + decline/dismiss/start/install |
| `app/src/renderer/js/updates/index.ts` | Make first-run flow awaitable |
| `app/src/renderer/js/app.ts` | Sequential launch queue: updates → embed → ollama |

Paths below for `app/` sources are relative to `app/` unless noted.

---

### Task 1: Detect helpers (paths + state)

**Files:**
- Create: `src/main/ollama-setup/detect.ts`
- Create: `src/main/ollama-setup/detect.test.ts`

**Interfaces:**
- Produces:
  - `type OllamaSetupState = "running" | "installed" | "missing"`
  - `fallbackPaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[]`
  - `findOllamaBinary(opts: { platform; env; pathEnv; exists(path: string): boolean; which(): string | null }): { kind: "binary" | "app"; path: string } | null`
  - `resolveSetupState(reachable: boolean, install: ReturnType<typeof findOllamaBinary>): OllamaSetupState`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/ollama-setup/detect.test.ts
import { describe, expect, test } from "bun:test";
import { fallbackPaths, findOllamaBinary, resolveSetupState } from "./detect";

describe("fallbackPaths", () => {
  test("darwin includes homebrew and Applications app", () => {
    const paths = fallbackPaths("darwin", {});
    expect(paths).toContain("/opt/homebrew/bin/ollama");
    expect(paths).toContain("/usr/local/bin/ollama");
    expect(paths).toContain("/Applications/Ollama.app");
  });
  test("linux includes usr bins", () => {
    const paths = fallbackPaths("linux", {});
    expect(paths).toContain("/usr/bin/ollama");
    expect(paths).toContain("/usr/local/bin/ollama");
  });
  test("win32 uses LOCALAPPDATA and ProgramFiles", () => {
    const paths = fallbackPaths("win32", {
      LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local",
      ProgramFiles: "C:\\Program Files",
    });
    expect(paths.some((p) => p.includes("Ollama\\ollama.exe"))).toBe(true);
  });
});

describe("findOllamaBinary", () => {
  test("prefers which() when present", () => {
    const hit = findOllamaBinary({
      platform: "linux",
      env: {},
      pathEnv: "/usr/bin",
      exists: () => false,
      which: () => "/custom/ollama",
    });
    expect(hit).toEqual({ kind: "binary", path: "/custom/ollama" });
  });
  test("falls back to existing path", () => {
    const hit = findOllamaBinary({
      platform: "darwin",
      env: {},
      pathEnv: "",
      exists: (p) => p === "/Applications/Ollama.app",
      which: () => null,
    });
    expect(hit).toEqual({ kind: "app", path: "/Applications/Ollama.app" });
  });
  test("missing when nothing found", () => {
    const hit = findOllamaBinary({
      platform: "linux",
      env: {},
      pathEnv: "",
      exists: () => false,
      which: () => null,
    });
    expect(hit).toBeNull();
  });
});

describe("resolveSetupState", () => {
  test("reachable is running even if no binary found", () => {
    expect(resolveSetupState(true, null)).toBe("running");
  });
  test("unreachable + binary is installed", () => {
    expect(resolveSetupState(false, { kind: "binary", path: "/usr/bin/ollama" })).toBe("installed");
  });
  test("unreachable + nothing is missing", () => {
    expect(resolveSetupState(false, null)).toBe("missing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/ollama-setup/detect.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Minimal implementation**

```typescript
// src/main/ollama-setup/detect.ts
import * as path from "path";

export type OllamaSetupState = "running" | "installed" | "missing";

export type OllamaInstall =
  | { kind: "binary"; path: string }
  | { kind: "app"; path: string };

export function fallbackPaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === "darwin") {
    return ["/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", "/Applications/Ollama.app"];
  }
  if (platform === "linux") {
    return ["/usr/bin/ollama", "/usr/local/bin/ollama"];
  }
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || "";
    const pf = env.ProgramFiles || "C:\\Program Files";
    const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    return [
      local ? path.join(local, "Programs", "Ollama", "ollama.exe") : "",
      path.join(pf, "Ollama", "ollama.exe"),
      path.join(pf86, "Ollama", "ollama.exe"),
    ].filter(Boolean);
  }
  return [];
}

export function findOllamaBinary(opts: {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  pathEnv: string;
  exists: (p: string) => boolean;
  which: () => string | null;
}): OllamaInstall | null {
  const fromWhich = opts.which();
  if (fromWhich) return { kind: "binary", path: fromWhich };
  for (const p of fallbackPaths(opts.platform, opts.env)) {
    if (!opts.exists(p)) continue;
    if (p.endsWith(".app")) return { kind: "app", path: p };
    return { kind: "binary", path: p };
  }
  return null;
}

export function resolveSetupState(
  reachable: boolean,
  install: OllamaInstall | null
): OllamaSetupState {
  if (reachable) return "running";
  if (install) return "installed";
  return "missing";
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd app && bun test src/main/ollama-setup/detect.test.ts`

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/ollama-setup/detect.ts app/src/main/ollama-setup/detect.test.ts
git commit -m "feat: add Ollama install path detection helpers"
```

---

### Task 2: Start command selection

**Files:**
- Create: `src/main/ollama-setup/start.ts`
- Create: `src/main/ollama-setup/start.test.ts`

**Interfaces:**
- Consumes: `OllamaInstall` from `detect.ts`
- Produces:
  - `type StartPlan = { command: string; args: string[]; cwd?: string }`
  - `planStart(platform: NodeJS.Platform, install: OllamaInstall | null): StartPlan | null`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/ollama-setup/start.test.ts
import { describe, expect, test } from "bun:test";
import { planStart } from "./start";

describe("planStart", () => {
  test("darwin prefers open -a when app install", () => {
    expect(planStart("darwin", { kind: "app", path: "/Applications/Ollama.app" })).toEqual({
      command: "open",
      args: ["-a", "Ollama"],
    });
  });
  test("darwin binary uses serve", () => {
    expect(planStart("darwin", { kind: "binary", path: "/opt/homebrew/bin/ollama" })).toEqual({
      command: "/opt/homebrew/bin/ollama",
      args: ["serve"],
    });
  });
  test("linux uses serve", () => {
    expect(planStart("linux", { kind: "binary", path: "/usr/bin/ollama" })).toEqual({
      command: "/usr/bin/ollama",
      args: ["serve"],
    });
  });
  test("win32 launches exe", () => {
    const p = "C:\\Users\\a\\AppData\\Local\\Programs\\Ollama\\ollama.exe";
    expect(planStart("win32", { kind: "binary", path: p })).toEqual({
      command: p,
      args: [],
    });
  });
  test("null install returns null", () => {
    expect(planStart("linux", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/ollama-setup/start.test.ts`

- [ ] **Step 3: Minimal implementation**

```typescript
// src/main/ollama-setup/start.ts
import type { OllamaInstall } from "./detect";

export type StartPlan = { command: string; args: string[]; cwd?: string };

export function planStart(
  platform: NodeJS.Platform,
  install: OllamaInstall | null
): StartPlan | null {
  if (!install) return null;
  if (platform === "darwin" && install.kind === "app") {
    return { command: "open", args: ["-a", "Ollama"] };
  }
  if (platform === "win32") {
    // GUI/app entry: empty args starts the tray app which serves locally.
    return { command: install.path, args: [] };
  }
  return { command: install.path, args: ["serve"] };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd app && bun test src/main/ollama-setup/start.test.ts`

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 3: Probe + startAndWait composition

**Files:**
- Create: `src/main/ollama-setup/index.ts`
- Create: `src/main/ollama-setup/index.test.ts`

**Interfaces:**
- Consumes: `findOllamaBinary`, `resolveSetupState`, `planStart`; injectable `isReachable()`, `spawnPlan()`, `sleep()`
- Produces:
  - `probe(deps): Promise<{ state: OllamaSetupState; host: string; installPath: string | null }>`
  - `startAndWait(deps): Promise<{ ok: boolean; error?: string }>` — spawn + poll until reachable or timeout (~20s)

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/ollama-setup/index.test.ts
import { describe, expect, test } from "bun:test";
import { probe, startAndWait } from "./index";

describe("probe", () => {
  test("maps reachable to running", async () => {
    const r = await probe({
      host: "http://127.0.0.1:11434",
      isReachable: async () => true,
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
    });
    expect(r.state).toBe("running");
  });
  test("maps unreachable + install to installed", async () => {
    const r = await probe({
      host: "http://127.0.0.1:11434",
      isReachable: async () => false,
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
    });
    expect(r.state).toBe("installed");
    expect(r.installPath).toBe("/usr/bin/ollama");
  });
});

describe("startAndWait", () => {
  test("ok when becomes reachable", async () => {
    let n = 0;
    const r = await startAndWait({
      platform: "linux",
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
      spawnPlan: async () => {},
      isReachable: async () => (++n >= 2),
      sleep: async () => {},
      timeoutMs: 5000,
      intervalMs: 1,
    });
    expect(r.ok).toBe(true);
  });
  test("fails when never reachable", async () => {
    const r = await startAndWait({
      platform: "linux",
      findInstall: () => ({ kind: "binary", path: "/usr/bin/ollama" }),
      spawnPlan: async () => {},
      isReachable: async () => false,
      sleep: async () => {},
      timeoutMs: 5,
      intervalMs: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
  test("fails when not installed", async () => {
    const r = await startAndWait({
      platform: "linux",
      findInstall: () => null,
      spawnPlan: async () => {},
      isReachable: async () => false,
      sleep: async () => {},
      timeoutMs: 5,
      intervalMs: 1,
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd app && bun test src/main/ollama-setup/index.test.ts`

- [ ] **Step 3: Minimal implementation**

Implement `probe` / `startAndWait` in `index.ts` using `resolveSetupState` + `planStart`. Default timeout 20_000ms, interval 500ms. On spawn throw, return `{ ok: false, error: message }`. Error string when timeout: `"Ollama did not become reachable in time."`. When no install: `"Ollama is not installed."`.

Example shape:

```typescript
export async function probe(deps: {
  host: string;
  isReachable: () => Promise<boolean>;
  findInstall: () => import("./detect").OllamaInstall | null;
}) {
  const install = deps.findInstall();
  const reachable = await deps.isReachable();
  return {
    state: resolveSetupState(reachable, install),
    host: deps.host,
    installPath: install ? install.path : null,
  };
}

export async function startAndWait(deps: {
  platform: NodeJS.Platform;
  findInstall: () => import("./detect").OllamaInstall | null;
  spawnPlan: (plan: import("./start").StartPlan) => Promise<void>;
  isReachable: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const install = deps.findInstall();
  const plan = planStart(deps.platform, install);
  if (!plan) return { ok: false, error: "Ollama is not installed." };
  try {
    await deps.spawnPlan(plan);
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Failed to start Ollama." };
  }
  const timeoutMs = deps.timeoutMs ?? 20_000;
  const intervalMs = deps.intervalMs ?? 500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await deps.isReachable()) return { ok: true };
    await deps.sleep(intervalMs);
  }
  return { ok: false, error: "Ollama did not become reachable in time." };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd app && bun test src/main/ollama-setup/`

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 4: Settings, IPC, preload, types

**Files:**
- Create: `src/main/ollama-setup/runtime.ts`
- Modify: `src/main/settings.ts`
- Modify: `src/types/domain.d.ts`
- Modify: `src/main/ipc.ts`
- Modify: `preload.ts`
- Modify: `src/types/api.d.ts`

**Interfaces:**
- Produces on `window.api`:
  - `ollamaProbe(): Promise<{ state: OllamaSetupState; host: string; installPath: string | null }>`
  - `ollamaStart(): Promise<{ ok: boolean; error?: string }>`
  - `ollamaOpenDownload(): Promise<void>`
- Settings: `ollamaSetupDeclined: boolean | null` default `null`

- [ ] **Step 1: Add settings field**

In `DEFAULTS` (`settings.ts`) and `AppSettings` (`domain.d.ts`):

```typescript
ollamaSetupDeclined: null, // null = not declined; true = Later forever
```

- [ ] **Step 2: Implement `runtime.ts`**

Wire real deps:
- `isReachable`: `(await ollama.status()).ok`
- `findInstall`: `findOllamaBinary` with `fs.existsSync`, and `which` via `execFileSync` (`which ollama` / `where ollama` on win32), catch → null
- `spawnPlan`: `spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true })` then `child.unref()`
- Export `probeRuntime()`, `startRuntime()`, `openDownload()` using `shell.openExternal("https://ollama.com/download")`

- [ ] **Step 3: Wire IPC**

```typescript
ipcMain.handle("ollama:probe", () => ollamaSetup.probeRuntime());
ipcMain.handle("ollama:start", () => ollamaSetup.startRuntime());
ipcMain.handle("ollama:openDownload", () => ollamaSetup.openDownload());
```

Keep existing `ollama:status` unchanged for the status-dot.

- [ ] **Step 4: Preload + api.d.ts**

```typescript
ollamaProbe: () => ipcRenderer.invoke("ollama:probe"),
ollamaStart: () => ipcRenderer.invoke("ollama:start"),
ollamaOpenDownload: () => ipcRenderer.invoke("ollama:openDownload"),
```

- [ ] **Step 5: Run unit tests still PASS**

Run: `cd app && bun test src/main/ollama-setup/`

- [ ] **Step 6: Commit** (only if user asked)

---

### Task 5: Boot splash (HTML/CSS/auth)

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/js/auth.ts`

**Interfaces:**
- Produces: first paint is `#boot-splash` only; `initAuth` reveals login or app after auth + min 1000ms

- [ ] **Step 1: Markup**

At top of `<body>`, before auth:

```html
<div id="boot-splash" class="nebula" aria-busy="true" aria-label="Loading AnyLM">
  <div class="boot-splash-inner">
    <span class="brand-badge lg boot-splash-logo" aria-hidden="true">
      <!-- same SVG paths as auth-brand badge -->
    </span>
    <span class="boot-splash-name">AnyLM</span>
  </div>
</div>
```

Add `hidden` to `#auth-screen` by default (same as `#app`).

- [ ] **Step 2: CSS**

```css
#boot-splash {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg);
}
#boot-splash.nebula {
  background:
    radial-gradient(ellipse 60% 45% at 50% 20%, rgba(125, 249, 166, 0.14), transparent 70%),
    radial-gradient(ellipse 40% 35% at 15% 70%, rgba(80, 120, 100, 0.18), transparent 65%),
    radial-gradient(ellipse 45% 40% at 85% 60%, rgba(60, 90, 80, 0.16), transparent 60%),
    var(--bg);
}
.boot-splash-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.boot-splash-logo {
  animation: boot-pulse 1.2s ease-in-out infinite;
}
.boot-splash-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 22px;
  letter-spacing: -0.02em;
}
@keyframes boot-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.06); opacity: 0.85; }
}
@media (prefers-reduced-motion: reduce) {
  .boot-splash-logo { animation: none; }
  #boot-splash.nebula { background: var(--bg); }
}
```

- [ ] **Step 3: Auth boot gate**

```typescript
const MIN_SPLASH_MS = 1000;

export async function initAuth(onAuthedCallback) {
  onAuthed = onAuthedCallback;
  bind();
  const splash = el("boot-splash");
  const started = Date.now();
  const user = await window.api.authMe();
  const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - started));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  splash.classList.add("hidden");
  if (user) {
    enterApp(user);
    return true;
  }
  showAuth();
  return false;
}
```

Remove the old `checkSession` early `showAuth` path that painted login before splash finished. Logout via `location.reload()` is fine.

- [ ] **Step 4: Manual check**

Logged-out → splash then login (no app flash). Logged-in → splash then dashboard (no login flash).

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 6: Ollama setup modal + banner UI

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/js/ollama-setup.ts`

**Interfaces:**
- Produces:
  - `initOllamaSetup(onBecameReady?: () => void): void`
  - `runOllamaLaunchFlow(settings: AppSettings): Promise<void>` — resolves when modal is no longer blocking (Later, Start success, or dismissed to banner)

- [ ] **Step 1: HTML**

```html
<div id="ollama-setup-modal" class="modal-overlay hidden">
  <div class="modal">
    <h2 id="ollama-setup-title">Ollama is not installed</h2>
    <p class="modal-sub" id="ollama-setup-body">
      Ollama is required to run models locally.
    </p>
    <div class="auth-error hidden" id="ollama-setup-error"></div>
    <div class="modal-foot">
      <button id="ollama-setup-later" class="ghost">I'll do it later</button>
      <button id="ollama-setup-primary" class="primary">Install Ollama</button>
    </div>
  </div>
</div>

<!-- Place as first child inside #app -->
<div id="ollama-setup-banner" class="ollama-setup-banner hidden" role="status">
  <span id="ollama-setup-banner-text"></span>
  <div class="ollama-setup-banner-actions">
    <button type="button" id="ollama-setup-banner-later" class="ghost small">I'll do it later</button>
    <button type="button" id="ollama-setup-banner-primary" class="primary small">Install Ollama</button>
  </div>
</div>
```

- [ ] **Step 2: Copy by state**

| state | title | body | primary label | primary action |
|-------|-------|------|---------------|----------------|
| `missing` | Ollama is not installed | Ollama is required to run models locally. | Install Ollama | `ollamaOpenDownload()` |
| `installed` | Ollama isn't running | Ollama is installed but not running. Start it to use local models. | Start Ollama | `ollamaStart()`; hide on ok |

Banner one-liners: missing → “Ollama is not installed.” / installed → “Ollama isn’t running.”

- [ ] **Step 3: Implement `ollama-setup.ts`**

Behavior:
- Skip if `settings.ollamaSetupDeclined === true` or probe `running`
- Show modal painted for state
- **Later** (modal or banner): `setSettings({ ollamaSetupDeclined: true })`, hide both, resolve
- **Overlay dismiss** (click `#ollama-setup-modal` backdrop): hide modal, show banner, resolve (do not set declined)
- **Primary missing:** open download (keep UI; user may install later)
- **Primary installed:** disable button, call `ollamaStart()`; on fail show `#ollama-setup-error`; on ok hide both, call `onBecameReady`, resolve
- Banner primary/later mirror modal actions
- Banner has no separate dismiss control

- [ ] **Step 4: Banner CSS**

Quiet full-width bar: flex, space-between, subtle glass background, small gap, compact padding. Place so `#app` remains a column flex when banner visible (banner `flex: 0 0 auto`; existing sidebar+main wrapper may need a content row — if `#app` is currently `display: flex` row, wrap sidebar+main in a row container **or** make `#app` `flex-direction: column` with an inner row. Prefer minimal DOM change: absolute/sticky top banner inside `#app` that does not break the existing row layout (`position: absolute; top: 0; left: 0; right: 0; z-index: 20` with padding-top on content only if needed). Pick the approach that avoids restructuring the whole shell.

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 7: Sequential launch queue

**Files:**
- Modify: `src/renderer/js/updates/index.ts`
- Modify: `src/renderer/js/app.ts`

**Interfaces:**
- Consumes: awaitable `runLaunchUpdateFlow`, `runEmbedLaunchFlow`, `runOllamaLaunchFlow`
- Produces: no stacked overlays after auth

- [ ] **Step 1: Make first-run awaitable**

```typescript
export function runLaunchUpdateFlow(settings: AppSettings): Promise<void> {
  if (settings.checkUpdatesOnLaunch === null) {
    return new Promise((resolve) => {
      el("first-run").classList.remove("hidden");
      el("fr-no").onclick = async () => {
        el("first-run").classList.add("hidden");
        await window.api.setSettings({ checkUpdatesOnLaunch: false });
        resolve();
      };
      el("fr-yes").onclick = async () => {
        el("first-run").classList.add("hidden");
        await window.api.setSettings({ checkUpdatesOnLaunch: true });
        window.api.checkForUpdate();
        resolve();
      };
    });
  }
  if (settings.checkUpdatesOnLaunch === true) window.api.checkForUpdate();
  return Promise.resolve();
}
```

- [ ] **Step 2: Wire app init**

```typescript
import { initOllamaSetup, runOllamaLaunchFlow } from "./ollama-setup.js";

// in init():
initOllamaSetup(() => { refreshStatus(); });

initAuth(async () => {
  if (started) return;
  started = true;
  await startApp(settings);
  await runLaunchUpdateFlow(settings);
  await runEmbedLaunchFlow(settings);
  await runOllamaLaunchFlow(settings);
});
```

Note: `refreshStatus` is currently local to `app.ts` — either pass it into `initOllamaSetup` from `init` after defining it, or duplicate a thin status refresh in the callback closure after `startApp` has run (set callback in the authed path).

- [ ] **Step 3: Manual verification checklist**

1. Cold start logged-in, Ollama running → splash → dashboard, no modal  
2. Ollama quit, not declined → splash → dashboard → (after update/embed) Ollama modal  
3. Dismiss modal → banner; relaunch → modal again  
4. Later → no modal/banner on relaunch  
5. Start Ollama from modal → becomes running, UI clears  
6. Missing install → Install opens browser  
7. first-run + Ollama needed → first-run first, then Ollama (no double overlay)

- [ ] **Step 4: Run unit tests**

Run: `cd app && bun test src/main/ollama-setup/`

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/ollama-setup app/src/main/settings.ts app/src/main/ipc.ts \
  app/preload.ts app/src/types app/src/renderer
git commit -m "feat: boot splash and Ollama setup gate"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Boot splash first paint; hide auth+app | 5 |
| Min ~1s + authMe | 5 |
| States running/installed/missing | 1, 3 |
| Win/macOS/Linux paths | 1 |
| Install → ollama.com/download | 4, 6 |
| Start background per OS | 2, 3, 4 |
| Later persists | 4, 6 |
| Dismiss → banner; modal next launch | 6 |
| Banner until Later or reachable | 6 |
| Sequential prompts | 7 |
| API-key skip deferred | none (intentional) |
| Unit tests for detect/start | 1–3 |

## Self-review notes

- No TBD placeholders in tasks.
- Types `OllamaSetupState` / `OllamaInstall` / `StartPlan` consistent across tasks.
- Existing `ollamaStatus` left intact for status-dot; probe is additive.
- Commit steps gated on user request per user rules.
