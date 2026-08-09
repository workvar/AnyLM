# Electron PostHog Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostHog product + reliability analytics to the Electron desktop app with soft-ask consent, a Privacy settings tab (independent field-group toggles), chat/message events, Firebase UID identify only after Accept, and CI injection of the project API key.

**Architecture:** Main-process `posthog-node` client behind a pure `policy.filter` gate; renderer only sends settings/UI events over IPC. Empty `ANYLM_POSTHOG_KEY` is a full no-op. Defaults match payload level B (counts + titles; truncated text off).

**Tech Stack:** Electron main/renderer TypeScript, `posthog-node`, existing settings/IPC patterns, Bun tests (`bun:test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-electron-posthog-analytics-design.md`
- Scope: Electron `app/` + `.github/workflows/build.yml` only — **no** `web/` PostHog
- No session replay, autocapture, or heatmaps
- Hard never-send: full message bodies beyond truncation, tool args/outputs, absolute file paths, emails, API keys
- Identify with Firebase UID only when `analyticsConsent === true`; never send email/name traits
- Soft-ask `null`: capture on with field groups; `false`: off; `true`: on + identify when signed in
- Default field groups: productUsage, reliability, chatEvents, titles, modelAndTokens **true**; truncatedMessageText **false**; truncateChars **200** (clamp 50–500)
- PostHog key optional in CI (blank must not fail the build)
- Prefer repository **Variables** `ANYLM_POSTHOG_KEY` / `ANYLM_POSTHOG_HOST` (not personal API keys)
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Paths under `app/` are relative to `app/` unless noted

## File map

| File | Responsibility |
|------|----------------|
| `package.json` | Add `posthog-node` dependency |
| `scripts/env-schema.js` | Allowlist `ANYLM_POSTHOG_KEY`, `ANYLM_POSTHOG_HOST` |
| `.env.example` | Document PostHog keys |
| `../.github/workflows/build.yml` | Inject PostHog env into Build and package |
| `src/main/env.ts` | Expose `posthog.key` / `posthog.host` |
| `src/types/domain.d.ts` | `analyticsConsent`, `AnalyticsSettings`, extend `AppSettings` |
| `src/main/settings.ts` | Defaults + deep-merge `analytics` + clamp `truncateChars` |
| `src/main/analytics/clamp.ts` | `clampTruncateChars` |
| `src/main/analytics/policy.ts` | Pure filter: consent + categories + prop strip |
| `src/main/analytics/policy.test.ts` | Policy unit tests |
| `src/main/analytics/client.ts` | posthog-node init / capture / identify / reset / shutdown |
| `src/main/analytics/events.ts` | Typed capture helpers + event→category map |
| `src/main/analytics/index.ts` | Re-exports used by main/ipc |
| `main.ts` | Init after ready; `app_opened`; shutdown on `will-quit` |
| `src/main/ipc.ts` | Analytics IPC; chat/auth instrumentation hooks |
| `preload.ts` + `src/types/api.d.ts` | `analyticsCapture` (+ reuse `getSettings`/`setSettings`) |
| `src/main/updater/index.ts` | Reliability updater events |
| `src/renderer/js/settings-hub.ts` | Add `privacy` section |
| `src/renderer/js/privacy-settings.ts` | Privacy panel paint/save |
| `src/renderer/js/analytics-consent.ts` | Soft-ask modal flow |
| `src/renderer/index.html` | Privacy nav/panel + soft-ask modal |
| `src/renderer/styles.css` | Minimal Privacy / soft-ask styles if needed |
| `src/renderer/js/app.ts` | Run soft-ask after wizard / launch |

---

### Task 1: Env allowlist, CI injection, dependency

**Files:**
- Modify: `package.json`
- Modify: `scripts/env-schema.js`
- Modify: `.env.example`
- Modify: `src/main/env.ts`
- Modify: `../.github/workflows/build.yml`

**Interfaces:**
- Produces: `env.posthog.key: string`, `env.posthog.host: string` (default host when empty: `https://us.i.posthog.com`)

- [ ] **Step 1: Install posthog-node**

```bash
cd app
bun add posthog-node
```

- [ ] **Step 2: Allowlist public keys in `scripts/env-schema.js`**

Add to `PUBLIC_KEYS` (both `required: false`):

```js
ANYLM_POSTHOG_KEY: { required: false, description: "PostHog project API key (phc_…); empty disables analytics" },
ANYLM_POSTHOG_HOST: { required: false, description: "PostHog host; defaults to https://us.i.posthog.com" },
```

- [ ] **Step 3: Document in `.env.example`**

Append:

```bash
# --- Analytics (optional) ---
# PostHog project API key (client-side phc_…). Leave blank to disable.
# ANYLM_POSTHOG_KEY=
# ANYLM_POSTHOG_HOST=https://us.i.posthog.com
```

- [ ] **Step 4: Expose on `env` in `src/main/env.ts`**

```ts
posthog: {
  key: value("ANYLM_POSTHOG_KEY"),
  host: value("ANYLM_POSTHOG_HOST", "https://us.i.posthog.com"),
},
```

- [ ] **Step 5: Inject in `.github/workflows/build.yml`**

In the **Build and package** step `env:` block (alongside Firebase keys), add:

```yaml
ANYLM_POSTHOG_KEY: ${{ vars.ANYLM_POSTHOG_KEY || secrets.ANYLM_POSTHOG_KEY }}
ANYLM_POSTHOG_HOST: ${{ vars.ANYLM_POSTHOG_HOST || secrets.ANYLM_POSTHOG_HOST }}
```

Do **not** add a hard-fail check when these are empty.

- [ ] **Step 6: Verify build-env still works**

```bash
cd app && bun run build:env
```

Expected: succeeds (PostHog keys optional).

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add app/package.json app/bun.lock app/scripts/env-schema.js app/.env.example app/src/main/env.ts .github/workflows/build.yml
git commit -m "chore: allow PostHog env bake and CI injection"
```

---

### Task 2: Settings types, defaults, merge, clamp

**Files:**
- Modify: `src/types/domain.d.ts`
- Modify: `src/main/settings.ts`
- Create: `src/main/analytics/clamp.ts`
- Create: `src/main/analytics/clamp.test.ts`
- Create: `src/main/settings-analytics.test.ts` (or extend an existing settings test if present)

**Interfaces:**
- Produces:
  - `interface AnalyticsSettings { productUsage: boolean; reliability: boolean; chatEvents: boolean; titles: boolean; modelAndTokens: boolean; truncatedMessageText: boolean; truncateChars: number }`
  - `AppSettings.analyticsConsent: boolean | null`
  - `AppSettings.analytics: AnalyticsSettings`
  - `clampTruncateChars(n: unknown, fallback?: number): number` — clamp to 50–500 inclusive; invalid → fallback (default 200)
  - Settings `read()` deep-merges `analytics` like `agents`

- [ ] **Step 1: Write failing clamp tests**

```ts
// src/main/analytics/clamp.test.ts
import { describe, expect, test } from "bun:test";
import { clampTruncateChars } from "./clamp";

describe("clampTruncateChars", () => {
  test("defaults invalid to 200", () => {
    expect(clampTruncateChars(undefined)).toBe(200);
    expect(clampTruncateChars("nope")).toBe(200);
  });
  test("clamps to 50..500", () => {
    expect(clampTruncateChars(10)).toBe(50);
    expect(clampTruncateChars(200)).toBe(200);
    expect(clampTruncateChars(9999)).toBe(500);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd app && bun test src/main/analytics/clamp.test.ts
```

- [ ] **Step 3: Implement clamp**

```ts
// src/main/analytics/clamp.ts
const DEFAULT = 200;
const MIN = 50;
const MAX = 500;

export function clampTruncateChars(n: unknown, fallback = DEFAULT): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(MAX, Math.max(MIN, Math.round(num)));
}
```

- [ ] **Step 4: Extend `domain.d.ts` `AppSettings`**

```ts
interface AnalyticsSettings {
  productUsage: boolean;
  reliability: boolean;
  chatEvents: boolean;
  titles: boolean;
  modelAndTokens: boolean;
  truncatedMessageText: boolean;
  truncateChars: number;
}

interface AppSettings {
  // ...existing fields...
  analyticsConsent: boolean | null;
  analytics: AnalyticsSettings;
}
```

- [ ] **Step 5: Defaults + merge in `settings.ts`**

In `DEFAULTS`:

```ts
analyticsConsent: null,
analytics: {
  productUsage: true,
  reliability: true,
  chatEvents: true,
  titles: true,
  modelAndTokens: true,
  truncatedMessageText: false,
  truncateChars: 200,
},
```

In `read()`, after shallow merge, deep-merge analytics (mirror agents pattern) and clamp `truncateChars`.

In `write()`, if `patch.analytics` present, deep-merge and clamp.

- [ ] **Step 6: Test older settings files get analytics defaults**

```ts
// Assert read() with a partial saved object missing analytics still returns DEFAULTS.analytics
```

(If file IO is hard to unit-test without Electron `app`, export a pure `mergeSettings(saved: Partial<AppSettings>): AppSettings` from settings or a tiny helper and test that instead.)

- [ ] **Step 7: Run tests**

```bash
cd app && bun test src/main/analytics/clamp.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit** (only if user asked)

---

### Task 3: Policy filter (TDD)

**Files:**
- Create: `src/main/analytics/policy.ts`
- Create: `src/main/analytics/policy.test.ts`

**Interfaces:**
- Consumes: `AnalyticsSettings`, `analyticsConsent`, `hasKey: boolean`
- Produces:

```ts
type AnalyticsCategory = "productUsage" | "reliability" | "chatEvents";

type EventDraft = {
  event: string;
  category: AnalyticsCategory;
  properties?: Record<string, unknown>;
};

type FilterInput = {
  draft: EventDraft;
  consent: boolean | null;
  analytics: AnalyticsSettings;
  hasKey: boolean;
};

/** Returns null to drop; otherwise sanitized properties (may be {}). */
export function filterEvent(input: FilterInput): { event: string; properties: Record<string, unknown> } | null;
```

Rules (exact):
1. `!hasKey` or `consent === false` → `null`
2. If `analytics[category] === false` → `null` (`chat_failed` uses category `chatEvents`; error code prop only kept if `reliability` is true — strip `error_code` when reliability off)
3. Strip `title`, `project_title` unless `titles`
4. Strip `model`, `prompt_tokens`, `completion_tokens` unless `modelAndTokens`
5. Strip `text_preview` unless `truncatedMessageText`; else coerce to string and slice to `truncateChars`
6. Always delete known dangerous keys if present: `email`, `path`, `file_path`, `tool_args`, `tool_output`, `content`, `messages`

- [ ] **Step 1: Write failing policy tests** covering: no key; consent false; consent null allows; each category off; titles/model/preview strip; truncate length; dangerous keys removed

- [ ] **Step 2: Run — expect FAIL**

```bash
cd app && bun test src/main/analytics/policy.test.ts
```

- [ ] **Step 3: Implement `policy.ts`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 4: PostHog client + capture API

**Files:**
- Create: `src/main/analytics/client.ts`
- Create: `src/main/analytics/events.ts`
- Create: `src/main/analytics/index.ts`

**Interfaces:**
- Produces:

```ts
// client.ts
export function init(): void;           // no-op if !env.posthog.key
export function shutdown(): Promise<void>;
export function identify(uid: string): void;  // no-op unless consent === true && client
export function reset(): void;
export function isEnabled(): boolean;   // key present

// events.ts
export function capture(draft: EventDraft): void;
// convenience wrappers optional:
export function trackAppOpened(): void;
export function trackConsentSet(value: boolean): void;
export function trackFeatureUsed(feature: string): void;
export function trackChatCreated(props: { title?: string }): void;
export function trackMessage(props: {
  direction: "sent" | "received";
  role: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  text?: string; // becomes text_preview after policy
  title?: string;
}): void;
export function trackChatCompleted(props: { model?: string; duration_bucket?: string; prompt_tokens?: number; completion_tokens?: number }): void;
export function trackChatFailed(props: { error_code?: string }): void;
```

`capture` must:
1. `settings.read()` for consent + analytics
2. `filterEvent(...)`
3. If non-null, `posthog.capture({ distinctId, event, properties })` inside try/catch (never throw)
4. Use a stable anonymous distinct id stored in userData (e.g. `analytics-distinct-id` file) until identify

For `posthog-node`, set `host: env.posthog.host`. Prefer `captureImmediate` only if needed; default queue + `shutdown` on quit is enough.

- [ ] **Step 1: Implement client + events**

- [ ] **Step 2: Smoke unit test with mocked client** (optional but preferred): export `captureWith` or inject a sink so policy+capture can be tested without network

- [ ] **Step 3: `bun run typecheck` in `app/`

- [ ] **Step 4: Commit** (only if user asked)

---

### Task 5: Main lifecycle + IPC surface

**Files:**
- Modify: `main.ts`
- Modify: `src/main/ipc.ts` (settings:set side-effect + new handlers)
- Modify: `preload.ts`
- Modify: `src/types/api.d.ts`

**Interfaces:**
- Produces on `AnyLMApi`:
  - `analyticsCapture(draft: { event: string; category: AnalyticsCategory; properties?: Record<string, unknown> }): Promise<void>`
- `settings:set` after write: if patch touches `analyticsConsent`, call `trackConsentSet` when boolean; if consent becomes true and user already signed in, `identify(uid)`; if false, do not identify

- [ ] **Step 1: Wire `main.ts`**

After `registerIpc()` / window create (or right after settings read):

```ts
import * as analytics from "./src/main/analytics";
analytics.init();
analytics.trackAppOpened();
```

In `will-quit` (before or after chroma/proxy stop):

```ts
void analytics.shutdown();
```

Also capture `app_quit` best-effort before shutdown.

- [ ] **Step 2: IPC handlers**

```ts
ipcMain.handle("analytics:capture", (_e, draft) => {
  analytics.capture(draft);
});
```

Validate `draft.event` is a non-empty string and `category` is one of the three enums; ignore otherwise.

- [ ] **Step 3: Preload + `api.d.ts`**

```ts
analyticsCapture: (draft) => ipcRenderer.invoke("analytics:capture", draft),
```

- [ ] **Step 4: Typecheck**

```bash
cd app && bun run typecheck
```

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 6: Auth identify / reset

**Files:**
- Modify: `src/main/ipc.ts` (auth:login, auth:register, auth:oauth, auth:logout, auth:me)

**Interfaces:**
- Consumes: `analytics.identify`, `analytics.reset`, `settings.read().analyticsConsent`
- After successful login/register/oauth/me refresh: if `analyticsConsent === true` and `user.uid` (or whatever field auth returns — use the Firebase user id field already used elsewhere), call `identify(uid)`
- On logout: `analytics.reset()`

- [ ] **Step 1: Find the user id field** on the auth user object (e.g. `user.uid` / `user.localId`) via existing `auth.me` / identity code; use that exact property

- [ ] **Step 2: Hook identify/reset as above (try/catch, never throw)**

- [ ] **Step 3: Typecheck**

- [ ] **Step 4: Commit** (only if user asked)

---

### Task 7: Chat & message instrumentation

**Files:**
- Modify: `src/main/ipc.ts` (`chats:create`, `chat:start` success/error paths)

**Interfaces:**
- `chats:create` success → `trackChatCreated({ title: data.title or data.name if present })`
- Near start of `chat:start` after model resolved and last user found → `trackMessage({ direction: "sent", role: "user", model: useModel, text: lastUser.content, title: project?.name or chat title if cheap to get })`
- On `chat:done` path before/after send → `trackMessage({ direction: "received", role: "assistant", model, text, prompt_tokens, completion_tokens })` + `trackChatCompleted({ model, duration_bucket, prompt_tokens, completion_tokens })`
- On `chat:error` catch → `trackChatFailed({ error_code: short code or "chat_error" })` — do not send full `e.message` if it may contain user content; prefer a coarse code

Duration bucket helper (pure, can live in `events.ts`):

```ts
export function durationBucket(ms: number): string {
  if (ms < 5_000) return "0-5s";
  if (ms < 30_000) return "5-30s";
  if (ms < 120_000) return "30s-2m";
  return "2m+";
}
```

- [ ] **Step 1: Add instrumentation at the three sites**

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit** (only if user asked)

---

### Task 8: Reliability hooks (updater + light product)

**Files:**
- Modify: `src/main/updater/index.ts`
- Modify: `src/renderer/js/setup-wizard.ts` (optional step events via `analyticsCapture`)
- Modify: other coarse `feature_used` call sites only where trivial (e.g. project create in ipc)

**Interfaces:**
- Updater: on checking → `updater_check`; on download start → `updater_download`; on ready/install → `updater_install`; on error → `updater_error` with `{ code: "updater_error" }` (not full message if it may leak paths)
- Category: `reliability` for updater_*; `productUsage` for setup_wizard_* / feature_used

- [ ] **Step 1: Wire updater emits through `analytics.capture`**

- [ ] **Step 2: On setup wizard complete in renderer**, `analyticsCapture({ event: "setup_wizard_completed", category: "productUsage" })`

- [ ] **Step 3: Typecheck / quick bun test policy still green**

- [ ] **Step 4: Commit** (only if user asked)

---

### Task 9: Privacy settings tab

**Files:**
- Modify: `src/renderer/index.html` (nav button + panel markup)
- Modify: `src/renderer/js/settings-hub.ts`
- Create: `src/renderer/js/privacy-settings.ts`
- Modify: `src/renderer/styles.css` (only if existing settings row classes are insufficient)
- Modify: `src/renderer/js/app.ts` if init needed

**Interfaces:**
- Extend `SettingsSection` with `"privacy"`
- `PANEL_IDS.privacy = "settings-panel-privacy"`
- `openSettingsHub("privacy")` works from soft-ask Configure

Markup pattern (match General toggles):

- Master checkbox `#analytics-master` ↔ `analyticsConsent === true` (checked) / false (unchecked). When user checks → `setSettings({ analyticsConsent: true })`; unchecks → `{ analyticsConsent: false }`. While consent still `null`, show master unchecked **or** indeterminate — prefer unchecked with helper text “Not decided yet — analytics collecting with defaults until you Accept or Decline.”
- Field checkboxes bound to `analytics.*` booleans via `setSettings({ analytics: { ...settings.analytics, productUsage: el.checked } })` — must deep-merge on main (Task 2)
- `#analytics-truncate-chars` number input shown when truncatedMessageText on

- [ ] **Step 1: Add HTML nav + panel**

- [ ] **Step 2: Implement `privacy-settings.ts` paint/save + wire in settings-hub**

- [ ] **Step 3: Manual checklist** — toggle master and field groups persist across restart

- [ ] **Step 4: Commit** (only if user asked)

---

### Task 10: Soft-ask UI

**Files:**
- Modify: `src/renderer/index.html` (modal `#analytics-consent` mirroring `#first-run`)
- Create: `src/renderer/js/analytics-consent.ts`
- Modify: `src/renderer/js/app.ts` (call after setup wizard / launch update flow)

**Interfaces:**

```ts
export function runAnalyticsConsentFlow(settings: AppSettings): Promise<void>;
```

Behavior:
- If `settings.analyticsConsent !== null` → resolve immediately
- If `!` key available: either skip UI always, or show nothing — **skip soft-ask when analytics disabled at build** (need `app:analyticsAvailable` IPC returning `Boolean(env.posthog.key)` OR bake a preload flag). Add `ipcMain.handle("analytics:available", () => analytics.isEnabled())` and `api.analyticsAvailable()`
- Else show modal: Accept → `analyticsConsent: true` + `trackConsentSet(true)`; Decline → false; Configure → `openSettingsHub("privacy")` without setting consent (leave `null`)

Call order in app boot (after wizard / alongside update flow): after setup wizard completes and when entering home, `await runAnalyticsConsentFlow(await getSettings())`.

- [ ] **Step 1: Add `analytics:available` IPC + preload**

- [ ] **Step 2: HTML modal + `analytics-consent.ts`**

- [ ] **Step 3: Hook into `app.ts` boot path**

- [ ] **Step 4: Manual** — with blank key, no modal; with key + null consent, modal appears once

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 11: Verification

**Files:** none new

- [ ] **Step 1: Unit tests**

```bash
cd app && bun test src/main/analytics/
```

Expected: all PASS.

- [ ] **Step 2: Typecheck**

```bash
cd app && bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Spec coverage self-check**

| Spec item | Task |
|-----------|------|
| Main posthog-node | 4 |
| Soft-ask | 10 |
| Privacy field groups | 9 |
| Chat/message events | 7 |
| Identify after Accept | 6 |
| Empty key no-op | 1+4 |
| CI Variables injection | 1 |
| No website changes | (none) |
| Truncate default off / N=200 | 2+3 |

- [ ] **Step 4: Manual with local `app/.env` key** (optional) — Accept, send a chat, confirm events in PostHog live view; Decline stops further events

---

## Self-review (plan author)

1. **Spec coverage:** All locked decisions mapped to tasks 1–11; CI section in Task 1; chat analytics in Task 7; Privacy toggles in Task 9.
2. **Placeholders:** None intentional; implementers must use the real auth uid field name discovered in Task 6 Step 1.
3. **Types:** `AnalyticsSettings`, `EventDraft`, `filterEvent`, `analyticsCapture` names consistent across tasks.

---

## GitHub setup (human, outside code)

Add repository **Variables** (Settings → Secrets and variables → Actions → Variables):

| Name | Value |
|------|--------|
| `ANYLM_POSTHOG_KEY` | PostHog project API key `phc_…` |
| `ANYLM_POSTHOG_HOST` | Optional; e.g. `https://us.i.posthog.com` |
