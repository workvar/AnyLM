# GA4 + Clarity Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shipped Electron PostHog with main-process GA4 Measurement Protocol + renderer Clarity, expand the event taxonomy, and add web marketing conversion events on top of the existing script loader.

**Architecture:** Keep the existing `policy` / `captureWith` / consent / Privacy UI. Swap `client.ts` from `posthog-node` to GA4 MP. Add Clarity in the renderer, gated by the same consent. Web keeps `Analytics.tsx` scripts and adds a thin `track()` helper for marketing events.

**Tech Stack:** Electron main/renderer TypeScript, GA4 Measurement Protocol (`fetch`), Microsoft Clarity browser snippet, Next.js `next/script` + `gtag`, Bun tests (`bun:test`), Node `node:test` for web helpers.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-ga4-clarity-analytics-design.md`
- GA4 = structured product events; Clarity = session/UX only (no message text to Clarity)
- Desktop consent model unchanged: soft-ask + field groups; identify Firebase UID only when `analyticsConsent === true`
- Truncated `text_preview` → GA4 only when `truncatedMessageText` is on
- Env: desktop `ANYLM_*`; web `NEXT_PUBLIC_*`; do not invent or commit real IDs
- Desktop GA4 MP needs **both** `ANYLM_GA_MEASUREMENT_ID` and `ANYLM_GA_API_SECRET` (GA4 Admin → Data stream → Measurement Protocol API secrets). Empty either → GA4 no-op. Logical name: `DESKTOP_GA_API_SECRET` (user provides later with the four IDs)
- Web marketing events only; full product taxonomy on desktop
- WordShield out of scope
- Remove `posthog-node` and all PostHog env/CI/docs references from active paths
- Commit steps run **only** when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Paths under `app/` are relative to `app/` unless noted; web paths relative to `web/`

## File map

| File | Responsibility |
|------|----------------|
| `scripts/env-schema.js` | Replace PostHog keys with GA + Clarity + API secret |
| `.env.example` | Document new keys; remove PostHog |
| `src/main/env.ts` | `env.ga` / `env.clarity` instead of `env.posthog` |
| `../.github/workflows/build.yml` | Swap PostHog CI env for desktop GA/Clarity |
| `src/main/analytics/client.ts` | Rewrite as GA4 MP client (keep export names used by index where possible) |
| `src/main/analytics/events.ts` | Taxonomy renames/additions; attach common params |
| `src/main/analytics/policy.ts` | Extend dual-gate for `ai_request_failed`; keep strips |
| `src/main/analytics/clarity-ipc.ts` (or IPC in `ipc.ts`) | Expose clarity id + consent-driven enable to renderer |
| `src/renderer/js/clarity.ts` | Load/unload Clarity; set tags |
| `src/renderer/js/analytics-consent.ts` / privacy | Unload Clarity on decline |
| Call sites (`main.ts`, `ipc.ts`, updater, setup-wizard, …) | Event renames + missing taxonomy events |
| `../web/components/site/Analytics.tsx` | Use `NEXT_PUBLIC_CLARITY_ID` |
| `../web/lib/analytics.ts` + `analytics.events.ts` + tests | `track()` + marketing event names |
| Download/Hero/Nav/releases | Fire marketing events |
| `../web/.env.example` | Rename Clarity key |
| Superseded PostHog docs | Status banners |

---

### Task 1: Desktop env — remove PostHog, add GA4 + Clarity

**Files:**
- Modify: `scripts/env-schema.js`
- Modify: `.env.example`
- Modify: `src/main/env.ts`
- Modify: `../.github/workflows/build.yml`

**Interfaces:**
- Produces: `env.ga.measurementId: string`, `env.ga.apiSecret: string`, `env.clarity.id: string`
- Removes: `env.posthog`

- [ ] **Step 1: Update `PUBLIC_KEYS` in `scripts/env-schema.js`**

Remove `ANYLM_POSTHOG_KEY` / `ANYLM_POSTHOG_HOST`. Add:

```js
ANYLM_GA_MEASUREMENT_ID: { required: false, description: "GA4 measurement ID (G-…); empty disables GA4" },
ANYLM_GA_API_SECRET: { required: false, description: "GA4 Measurement Protocol API secret; required with measurement ID" },
ANYLM_CLARITY_ID: { required: false, description: "Microsoft Clarity project id; empty disables Clarity" },
```

- [ ] **Step 2: Update `src/main/env.ts`**

Replace `posthog` block with:

```ts
ga: {
  measurementId: value("ANYLM_GA_MEASUREMENT_ID"),
  apiSecret: value("ANYLM_GA_API_SECRET"),
},
clarity: {
  id: value("ANYLM_CLARITY_ID"),
},
```

- [ ] **Step 3: Update `.env.example`**

Replace PostHog comments with:

```bash
# Analytics (optional). Leave blank to disable.
# ANYLM_GA_MEASUREMENT_ID=G-XXXXXXXX
# ANYLM_GA_API_SECRET=
# ANYLM_CLARITY_ID=
```

- [ ] **Step 4: Update `.github/workflows/build.yml`**

In the Build and package `env:` block, remove `ANYLM_POSTHOG_*` and add:

```yaml
ANYLM_GA_MEASUREMENT_ID: ${{ vars.ANYLM_GA_MEASUREMENT_ID || secrets.ANYLM_GA_MEASUREMENT_ID }}
ANYLM_GA_API_SECRET: ${{ vars.ANYLM_GA_API_SECRET || secrets.ANYLM_GA_API_SECRET }}
ANYLM_CLARITY_ID: ${{ vars.ANYLM_CLARITY_ID || secrets.ANYLM_CLARITY_ID }}
```

- [ ] **Step 5: Verify schema still loads**

Run: `cd app && node -e "require('./scripts/env-schema.js')"`  
Expected: exits 0.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add app/scripts/env-schema.js app/.env.example app/src/main/env.ts .github/workflows/build.yml
git commit -m "chore: replace PostHog env with GA4 and Clarity"
```

---

### Task 2: Replace PostHog client with GA4 Measurement Protocol

**Files:**
- Modify: `src/main/analytics/client.ts`
- Create: `src/main/analytics/client.test.ts` (pure helpers if extracted)
- Modify: `src/main/analytics/events.ts` (sink still calls `client.capture` shape — adapt)
- Modify: `package.json` + lockfile (remove `posthog-node` at end of this task or Task 8)

**Interfaces:**
- Consumes: `env.ga.measurementId`, `env.ga.apiSecret`
- Produces (keep names for callers):
  - `isEnabled(): boolean` — true only when **both** measurement ID and API secret are non-empty
  - `init(): void`
  - `identify(uid: string): void` — sets local `user_id` when consent === true
  - `reset(): void` — clears `user_id`
  - `shutdown(): Promise<void>` — flush pending queue
  - `getDistinctId(): string` — anonymous UUID file (reuse existing persistence) used as GA4 `client_id`
  - `sendEvent(name: string, params: Record<string, unknown>): void` — or keep sink-compatible `capture` on a small adapter

- [ ] **Step 1: Write failing test for MP payload builder**

Create `src/main/analytics/ga-payload.ts` + `ga-payload.test.ts`:

```ts
// ga-payload.ts
export function buildMpBody(input: {
  clientId: string;
  userId?: string | null;
  events: Array<{ name: string; params?: Record<string, unknown> }>;
}): { client_id: string; user_id?: string; events: unknown[] } {
  const body: {
    client_id: string;
    user_id?: string;
    events: Array<{ name: string; params: Record<string, unknown> }>;
  } = {
    client_id: input.clientId,
    events: input.events.map((e) => ({
      name: e.name,
      params: { engagement_time_msec: 1, ...(e.params ?? {}) },
    })),
  };
  if (input.userId) body.user_id = input.userId;
  return body;
}

export function mpCollectUrl(measurementId: string, apiSecret: string): string {
  const u = new URL("https://www.google-analytics.com/mp/collect");
  u.searchParams.set("measurement_id", measurementId);
  u.searchParams.set("api_secret", apiSecret);
  return u.toString();
}
```

```ts
// ga-payload.test.ts
import { describe, expect, test } from "bun:test";
import { buildMpBody, mpCollectUrl } from "./ga-payload";

describe("ga-payload", () => {
  test("buildMpBody omits user_id when absent", () => {
    const body = buildMpBody({
      clientId: "c1",
      events: [{ name: "app_opened", params: { app: "desktop" } }],
    });
    expect(body.user_id).toBeUndefined();
    expect(body.client_id).toBe("c1");
    expect(body.events[0].name).toBe("app_opened");
  });

  test("mpCollectUrl includes measurement_id and api_secret", () => {
    const url = mpCollectUrl("G-ABC", "secret");
    expect(url).toContain("measurement_id=G-ABC");
    expect(url).toContain("api_secret=secret");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `cd app && bun test src/main/analytics/ga-payload.test.ts`  
Expected: FAIL cannot find module / file.

- [ ] **Step 3: Implement `ga-payload.ts` and rewrite `client.ts`**

Rewrite `client.ts`:

- Remove `import { PostHog } from "posthog-node"`.
- `isEnabled()` → both `env.ga.measurementId` and `env.ga.apiSecret`.
- Keep anonymous id file `analytics-distinct-id` as GA4 `client_id`.
- Queue events in memory; `flush()` POSTs JSON via `fetch` to `mpCollectUrl`; never throw.
- `identify(uid)` stores `identifiedUid` when consent === true (no PostHog alias; subsequent events include `user_id`).
- `reset()` clears `identifiedUid`.
- Export `captureEvent(event, properties)` used by `events.ts` sink:

```ts
export function captureEvent(event: string, properties: Record<string, unknown>): void {
  try {
    if (!isEnabled()) return;
    // enqueue { name: event, params: properties }; schedule flush
  } catch {
    /* never throw */
  }
}
```

- [ ] **Step 4: Point `events.ts` sink at `captureEvent`**

Replace PostHog `client.capture({ distinctId, event, properties })` with:

```ts
sink: isEnabled()
  ? {
      capture: (payload) => {
        captureEvent(payload.event, payload.properties);
      },
    }
  : null,
```

`distinctId` is unused by MP path (client_id comes from `getDistinctId()` inside `captureEvent`). Keep `CaptureSink` type for tests — tests can keep calling sink with distinctId.

- [ ] **Step 5: Run unit tests**

Run: `cd app && bun test src/main/analytics/`  
Expected: PASS (update any client-specific mocks if present).

- [ ] **Step 6: Remove `posthog-node`**

```bash
cd app && bun remove posthog-node
```

Confirm `package.json` / `bun.lock` no longer list `posthog-node`.

- [ ] **Step 7: Typecheck**

Run: `cd app && bun run typecheck`  
Expected: PASS.

- [ ] **Step 8: Commit (only if user asked)**

```bash
git add app/src/main/analytics app/package.json app/bun.lock
git commit -m "feat: replace PostHog client with GA4 Measurement Protocol"
```

---

### Task 3: Event taxonomy alignment

**Files:**
- Modify: `src/main/analytics/events.ts`
- Modify: `src/main/analytics/events.test.ts`
- Modify: `src/main/analytics/policy.ts` + `policy.test.ts`
- Modify: `main.ts` (`app_quit` → `app_closed`)
- Modify: call sites in `src/main/ipc.ts` as needed

**Interfaces:**
- Produces helpers (add/rename):
  - `trackAppClosed()`
  - `trackOnboardingCompleted()`
  - `trackSetupWizardStep(step: string)`
  - `trackAiRequestStarted/Completed/Failed(...)`
  - Keep `trackMessage`, `trackChatCreated`; prefer dual-emitting `ai_request_*` alongside or instead of `chat_completed` / `chat_failed` per spec
- Common params injected in `capture()` / `captureWith`: `app: "desktop"`, `app_version`, `platform` (`process.platform`)

- [ ] **Step 1: Update failing expectations for renames**

In `events.test.ts`, add tests that `trackAppClosed` emits `app_closed`, and `captureWith` merges `app`/`platform` when a deps hook provides `baseProps`.

Simplest approach — inside `capture` / `captureWith` after filter:

```ts
const properties = {
  app: "desktop",
  platform: process.platform,
  app_version: app.getVersion(), // guard if app not ready in tests — inject via deps
  ...filtered.properties,
};
```

For tests, extend `CaptureDeps` with optional `baseProperties?: Record<string, unknown>`.

- [ ] **Step 2: Run tests — FAIL on missing helpers**

Run: `cd app && bun test src/main/analytics/events.test.ts`

- [ ] **Step 3: Implement renames and AI helpers**

- `main.ts`: `app_quit` → `app_closed` (or `trackAppClosed()`).
- Chat completion path: emit `ai_request_completed` (and keep or drop `chat_completed` — **drop `chat_completed` / `chat_failed` names** in favor of `ai_request_completed` / `ai_request_failed` to match taxonomy; update `policy.ts` dual-gate from `chat_failed`/`error_code` to `ai_request_failed`/`error_type`).
- Map `error_code` → `error_type` in failed events.
- `trackFeatureUsed("project_created")` at project create: **also** emit dedicated `project_created` event (category `productUsage`) so GA4 key-event marking works; keep `feature_used` only for coarse non-CRUD features.

- [ ] **Step 4: Update policy tests for `ai_request_failed` + `error_type`**

When `reliability` is false, strip `error_type` from `ai_request_failed`.

- [ ] **Step 5: Run analytics tests + typecheck**

Run: `cd app && bun test src/main/analytics/ && bun run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add app/src/main/analytics app/main.ts app/src/main/ipc.ts
git commit -m "feat: align desktop analytics event taxonomy with GA4 spec"
```

---

### Task 4: Desktop Clarity (renderer) + consent gating

**Files:**
- Modify: `src/main/ipc.ts`, `preload.ts`, `src/types/api.d.ts`
- Create: `src/renderer/js/clarity.ts`
- Modify: `src/renderer/js/analytics-consent.ts`
- Modify: `src/renderer/js/privacy-settings.ts` (or settings save path)
- Modify: `src/renderer/js/app.ts` (init clarity after load)

**Interfaces:**
- `analyticsAvailable(): Promise<boolean>` — true if GA enabled **or** Clarity id present
- `analyticsClarityConfig(): Promise<{ id: string | null; enabled: boolean }>`  
  - `enabled` = id present && `analyticsConsent !== false`
- Renderer: `startClarity(id)`, `stopClarity()`, `setClarityTags(tags)`

- [ ] **Step 1: Write failing test for availability helper**

Create pure helper in `src/main/analytics/availability.ts`:

```ts
export function analyticsAvailable(input: {
  gaEnabled: boolean;
  clarityId: string;
}): boolean {
  return input.gaEnabled || Boolean(input.clarityId);
}
```

Test both true/false combinations.

- [ ] **Step 2: Implement IPC**

```ts
ipcMain.handle("analytics:available", () =>
  analyticsAvailable({
    gaEnabled: analytics.isEnabled(),
    clarityId: env.clarity.id,
  }),
);

ipcMain.handle("analytics:clarity-config", () => {
  const id = env.clarity.id || null;
  const consent = settings.read().analyticsConsent;
  return { id, enabled: Boolean(id) && consent !== false };
});
```

Expose on preload as `analyticsClarityConfig`.

- [ ] **Step 3: Implement `clarity.ts`**

- Inject Clarity snippet once when `enabled && id`.
- On disable/decline: remove script if possible / set a no-op; avoid sending further tags.
- Tags (only when enabled): `app=desktop`, `platform`, `app_version`, `environment` (`production` if packaged else `development`), `user_state` (`signed_in` | `anonymous`).
- **Never** set message text or titles as tags.

- [ ] **Step 4: Wire lifecycle**

- After soft-ask Accept/Decline and Privacy master toggle: refresh Clarity via config IPC.
- On app start (renderer ready): start Clarity if config.enabled.

- [ ] **Step 5: Run related tests + typecheck**

Run: `cd app && bun test src/renderer/js/analytics-consent.test.ts src/main/analytics/ && bun run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add app/src/main/analytics app/src/main/ipc.ts app/preload.ts app/src/types/api.d.ts app/src/renderer/js/clarity.ts app/src/renderer/js/analytics-consent.ts app/src/renderer/js/app.ts
git commit -m "feat: add consent-gated Microsoft Clarity to Electron renderer"
```

---

### Task 5: Fill remaining desktop product events

**Files:**
- Modify: `src/renderer/js/setup-wizard.ts` (or completion path)
- Modify: settings open/save paths in renderer
- Modify: auth success/failure paths in `ipc.ts` / auth modules
- Modify: ollama-setup / proxy error sites if not already emitting

**Interfaces:**
- Emit (via main helpers or `analyticsCapture` IPC):
  - `setup_wizard_step` / `onboarding_completed`
  - `user_signed_up` / `user_logged_in` / `user_logged_out` / `authentication_failed`
  - `settings_opened` / `settings_updated` (coarse)
  - `project_opened` / `project_updated` / `project_deleted` where IPC already mutates projects
  - Keep updater reliability events; ensure event names match spec

- [ ] **Step 1: Inventory call sites**

```bash
rg -n "analytics\.(capture|track)|analyticsCapture" app/src app/main.ts
```

List gaps vs spec §3.3–3.5; only add meaningful product actions (no chrome clicks).

- [ ] **Step 2: Instrument setup wizard completion**

On wizard complete: `onboarding_completed`. Optional step events only for major steps (not every UI tick).

- [ ] **Step 3: Instrument auth**

After successful login/register: `user_logged_in` or `user_signed_up` (use existing signal for new vs returning if available; otherwise `user_logged_in` only). On logout: `user_logged_out` + `analytics.reset()`. On auth failure: `authentication_failed` with coarse `error_type` only.

- [ ] **Step 4: Instrument project open/update/delete + settings**

Match existing IPC handlers; use `analytics.capture({ event, category: "productUsage", properties })`.

- [ ] **Step 5: Typecheck + tests**

Run: `cd app && bun test && bun run typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add app/src app/main.ts
git commit -m "feat: instrument remaining desktop GA4 product events"
```

---

### Task 6: Web marketing analytics helper + events

**Files:**
- Modify: `../web/components/site/Analytics.tsx`
- Modify: `../web/.env.example`
- Create: `../web/lib/analytics.events.ts`
- Create: `../web/lib/analytics.ts`
- Create: `../web/lib/analytics.test.ts`
- Modify: `../web/components/download/AssetRow.tsx`, `DownloadButton.tsx`, `../web/components/home/Hero.tsx`, `../web/components/site/Nav.tsx`, releases page/card as needed
- Modify: `../web/app/layout.tsx` or a small client `AppAnalytics` for one-time `app_opened`

**Interfaces:**
- `track(event: string, params?: Record<string, unknown>): void` — calls `window.gtag('event', event, { app: 'web', ...params })` if `gtag` and GA id present; else no-op
- Event constants: `download_clicked`, `cta_clicked`, `release_viewed`, `app_opened`

- [ ] **Step 1: Rename Clarity env to match spec**

In `Analytics.tsx` and `.env.example`:

```ts
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID?.trim();
```

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_CLARITY_ID=
```

(Remove `NEXT_PUBLIC_CLARITY_PROJECT_ID`.)

- [ ] **Step 2: Write failing tests for `track` no-op**

```ts
// lib/analytics.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { track } from "./analytics";

describe("analytics.track", () => {
  it("does not throw when gtag is missing", () => {
    assert.doesNotThrow(() => track("download_clicked", { source: "test" }));
  });
});
```

- [ ] **Step 3: Implement `analytics.ts` / `analytics.events.ts`**

```ts
// analytics.events.ts
export const WebEvents = {
  appOpened: "app_opened",
  downloadClicked: "download_clicked",
  ctaClicked: "cta_clicked",
  releaseViewed: "release_viewed",
} as const;
```

```ts
// analytics.ts
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: string, params: Record<string, unknown> = {}): void {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", event, { app: "web", ...params });
  } catch {
    // no-op
  }
}
```

Note: `track` must only run in client components / event handlers.

- [ ] **Step 4: Wire call sites**

- `AssetRow` / download buttons: `track(WebEvents.downloadClicked, { source, platform })`
- Hero/Nav primary CTA: `track(WebEvents.ctaClicked, { source: "hero" | "nav", feature: "download" })`
- Releases page mount (client effect): `track(WebEvents.releaseViewed, { version })` once
- Client once-per-load: `track(WebEvents.appOpened)` from a tiny client component mounted in layout next to `Analytics` (guard with `sessionStorage` key so React Strict Mode doesn’t double-count in prod logic — or accept once per full page load)

- [ ] **Step 5: Add Clarity tags on web (optional light touch)**

In `Analytics.tsx` after Clarity snippet, or a follow-up script: `clarity("set", "app", "web")` only when Clarity loaded — keep minimal.

- [ ] **Step 6: Run web tests + typecheck + build**

Run:

```bash
cd web && npm test && npm run typecheck && npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add web/
git commit -m "feat: add web marketing GA4 events and Clarity env rename"
```

---

### Task 7: Docs supersession + PostHog scrub

**Files:**
- Modify: `../docs/superpowers/specs/2026-08-09-electron-posthog-analytics-design.md` (status banner)
- Modify: `../docs/superpowers/plans/2026-08-09-electron-posthog-analytics.md` (status banner)
- Modify: `../docs/superpowers/specs/2026-08-09-web-ui-seo-analytics-design.md` §6 pointer
- Grep entire repo for leftover PostHog

- [ ] **Step 1: Add superseded banners**

At top of PostHog design + plan:

```markdown
> **Superseded (2026-08-09):** Do not implement. Replaced by `docs/superpowers/specs/2026-08-09-ga4-clarity-analytics-design.md` and `docs/superpowers/plans/2026-08-09-ga4-clarity-analytics.md`.
```

- [ ] **Step 2: Update web SEO design §6**

Point analytics env keys and behavior at the GA4+Clarity design; note `NEXT_PUBLIC_CLARITY_ID`.

- [ ] **Step 3: Repo scrub**

```bash
rg -i 'posthog|ANYLM_POSTHOG|CLARITY_PROJECT_ID' --glob '!**/node_modules/**' --glob '!**/bun.lock' --glob '!**/.next/**'
```

Expected: only superseded doc historical mentions (or none in active code). Fix any remaining code/docs.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add docs/ app/ web/ .github/
git commit -m "docs: supersede PostHog analytics plans with GA4+Clarity"
```

---

### Task 8: Validation pass

**Files:** none (verification only)

- [ ] **Step 1: Desktop verification**

```bash
cd app && bun test && bun run typecheck
```

Expected: PASS.

Manual checklist (document results in final report when executing):

- Empty GA/Clarity env → soft-ask skipped / no network to google-analytics or clarity.ms
- With IDs + Accept → `app_opened` visible in GA4 DebugView (MP debug endpoint optional: `https://www.google-analytics.com/debug/mp/collect`)
- Decline → no further events; Clarity stopped
- Web empty env → build OK, no scripts

- [ ] **Step 2: Web verification**

```bash
cd web && npm test && npm run typecheck && npm run build
```

Expected: PASS.

- [ ] **Step 3: Separation grep**

```bash
rg 'ANYLM_GA_|ANYLM_CLARITY_' web/ || true
rg 'NEXT_PUBLIC_GA_|NEXT_PUBLIC_CLARITY_' app/ || true
```

Expected: no cross-hits.

- [ ] **Step 4: Final report** (when executing for the user)

Cover spec §19 items: files changed, PostHog removed, GA4/Clarity impl, taxonomy, migrations, CI/Vercel manual vars, build results, remaining manual GA4 key-event marking.

---

## Self-review

1. **Spec coverage:** Architecture, consent, taxonomy, web marketing, desktop MP+Clarity, CI env, PostHog removal, no WordShield — covered in Tasks 1–8. Vercel is manual (Task 8 report) — no Vercel API in repo.
2. **Placeholders:** None intentional; `DESKTOP_GA_API_SECRET` explicitly required for MP (called out in Global Constraints).
3. **Type consistency:** `captureWith` / `CaptureSink` preserved; `error_type` replaces `error_code`; Clarity config IPC named consistently.
4. **Gap note:** User’s four IDs omit API secret — plan requires a fifth desktop secret for MP; do not invent its value.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-09-ga4-clarity-analytics.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
