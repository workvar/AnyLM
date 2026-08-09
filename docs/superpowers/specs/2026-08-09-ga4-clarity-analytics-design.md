# GA4 + Microsoft Clarity analytics

**Date:** 2026-08-09  
**Status:** Approved (design)  
**Approach:** Main-process GA4 Measurement Protocol + renderer Clarity (Approach 2)  
**Surfaces:** Electron `app/` (full product taxonomy) + Next.js `web/` (marketing conversions only)

## Problem

We need structured product analytics and behavioral/session analysis without PostHog.

PostHog was designed for Electron (`docs/superpowers/specs/2026-08-09-electron-posthog-analytics-design.md`) but **never shipped** (no packages, no CI vars, no capture calls). The web SEO design planned env-gated GA4/Clarity scripts only, without an event taxonomy.

This design replaces the PostHog plan and expands web analytics beyond script install.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Stack | GA4 for structured product events/metrics; Clarity for session/UX behavior |
| Architecture | Approach 2: desktop GA4 in **main** (Measurement Protocol); Clarity in **renderer**; web via `next/script` + thin `track` helper |
| Consent (desktop) | Soft-ask + Privacy settings + independent field-group toggles (carry forward PostHog privacy model) |
| Truncated chat text | Opt-in field group → **GA4 only**; never send message text to Clarity |
| Web scope | Marketing conversions only (page views + download/CTA/release events) |
| Env naming | Repo conventions: desktop `ANYLM_*`; web `NEXT_PUBLIC_*` |
| Shared runtime package | No — shared **taxonomy conventions** only |
| WordShield | Out of scope (not used in this repo) |
| IDs | User-provided later; do not invent, reuse, or commit real IDs |

## Goals

1. Ship GA4 + Clarity with a stable event taxonomy suitable for funnels and UX investigation.
2. Desktop: consent-gated capture with field groups; Firebase UID as GA4 `user_id` only after Accept + sign-in.
3. Web: page views + marketing conversion events; separate measurement IDs from desktop.
4. Empty IDs → full no-op (local/dev safe).
5. Supersede PostHog design/plan; ensure no PostHog dependencies remain in active docs or code paths.

## Non-goals

- WordShield deployment configuration.
- Shared monorepo `packages/analytics`.
- Creating GA4/Clarity properties or marking key events in the GA4 Admin UI (manual follow-up).
- Cookie banners / GDPR legal copy beyond clear in-app Privacy wording.
- Committing real measurement IDs.
- Using GA4 as a crash/log sink (use existing diagnostics if any).
- Shipping every UI interaction as an event.

---

## 1. Architecture & responsibilities

### 1.1 GA4 vs Clarity

| System | Answers | Examples |
|--------|---------|----------|
| **GA4** | What happened? | Projects created, onboarding completion, feature usage, download clicks |
| **Clarity** | Why did it happen? | Rage clicks, ignored CTAs, confusing navigation, session replay |

Do not duplicate every GA4 event into Clarity. Clarity gets init + coarse custom tags only.

### 1.2 Desktop

```
Renderer (soft-ask, Privacy settings, UI-ish events)
    │  IPC: settings get/set, optional ui capture, clarity context
    ▼
Main analytics
    ├── policy.filter(draft, settings)   // consent + field groups
    ├── ga client (Measurement Protocol) // no-op if no ID / opted out
    └── callers: lifecycle, auth, chat, updater, ollama-setup, projects…
Clarity loads only in the BrowserWindow (script), gated by consent + ANYLM_CLARITY_ID.
```

- Init after `app.whenReady` when GA measurement ID present; flush/shutdown on quit.
- Analytics failures never throw into product paths.
- Anonymous `client_id` until identify; clear `user_id` on sign-out.

### 1.3 Web

- Client `Analytics` component loads GA4 + Clarity via `next/script` when IDs are set.
- Thin `analytics.track(event, params)` for marketing events.
- No auth/identify. No desktop env vars.

### 1.4 Supersession

| Prior doc | Status |
|-----------|--------|
| `docs/superpowers/specs/2026-08-09-electron-posthog-analytics-design.md` | **Superseded** by this spec |
| `docs/superpowers/plans/2026-08-09-electron-posthog-analytics.md` | **Superseded** — do not implement |
| `docs/superpowers/specs/2026-08-09-web-ui-seo-analytics-design.md` §6 | Analytics subsection **replaced** by this spec’s web section; SEO/UI parts unchanged |
| `docs/superpowers/plans/2026-08-09-web-ui-seo-analytics.md` analytics tasks | Align to this taxonomy / env names when executing |

---

## 2. Consent, policy, identity

### 2.1 Settings (`AppSettings`)

```ts
analyticsConsent: null | boolean; // null = soft-ask pending; false = off; true = on

analytics: {
  productUsage: boolean;           // default true
  reliability: boolean;            // default true
  chatEvents: boolean;             // default true
  titles: boolean;                 // default true
  modelAndTokens: boolean;         // default true
  truncatedMessageText: boolean;   // default false
  truncateChars: number;           // default 200; clamp 50–500
};
```

| `analyticsConsent` | GA4 capture? | Clarity? | GA4 `user_id` (Firebase UID)? |
|--------------------|--------------|----------|-------------------------------|
| `null` | Yes (defaults = level B: counts + titles; truncated text off) | Yes | No |
| `false` | No | No (do not load / tear down) | No |
| `true` | Yes | Yes | Yes when signed in |

Master Settings toggle: off → `false`; on → `true`. Soft-ask Accept → `true`; Decline → `false`. Configure… opens Privacy tab without resolving soft-ask until Accept/Decline or master toggle.

### 2.2 Policy (`policy.filter`)

1. No GA measurement ID or `analyticsConsent === false` → drop.
2. Map event → category (`productUsage` | `reliability` | `chatEvents`). If that group is off → drop.
3. Strip props per toggles: titles; model/tokens; `text_preview` (clamp to `truncateChars` when allowed).
4. Never send: full message bodies, tool args/outputs, absolute file paths, emails, passwords, tokens, API keys, stack traces, request bodies.

### 2.3 Identity

- Desktop: anonymous until `analyticsConsent === true` and signed in → GA4 `user_id` = Firebase UID only (no email).
- Sign-out: clear `user_id` / reset anonymous client identity as appropriate for MP.
- Web: no user identification.

### 2.4 UI

- Soft-ask after setup wizard (or first home if wizard done and consent still `null`).
- Privacy / Analytics settings tab: master enable + independent field groups; truncate length control only when truncated text is on.
- Brief copy: message bodies are never sent in full; truncated previews only when enabled (GA4 only).

---

## 3. Event taxonomy

### 3.1 Rules

- Meaningful, stable, snake_case event names.
- Prefer parameters over embedding dimensions in the event name.
- Shared names between web and desktop where the same user action exists.
- No chrome events (`button_clicked`, `modal_opened`, `component_rendered`) unless the interaction itself is a product conversion.

### 3.2 Common parameters

Use when relevant and non-sensitive:

`app` (`web` | `desktop`), `platform`, `app_version`, `environment`, `feature`, `source`, `plan`, `project_type`, `success`, `error_type`, `operation`, `http_status`, `retryable`

### 3.3 Desktop — product usage (`productUsage`)

| Event | Key parameters |
|-------|----------------|
| `app_opened` | `app_version`, `platform` |
| `app_closed` | `app_version`, `platform` |
| `setup_wizard_step` | `step` |
| `onboarding_completed` | — |
| `analytics_consent_set` | `value` (`true` \| `false`) |
| `user_signed_up` | — (no PII) |
| `user_logged_in` | — |
| `user_logged_out` | — |
| `project_created` | `source`; optional title if `titles` |
| `project_opened` | `source`; optional title if `titles` |
| `project_updated` | optional title if `titles` |
| `project_deleted` | — |
| `settings_opened` | — |
| `settings_updated` | coarse `feature` / keys only |
| `feature_used` | `feature` (coarse: e.g. `tools_toggled`, `skill_enabled`) |
| `file_opened` | `source` / `feature` — **no paths** |
| `file_exported` | `source` / `feature` — **no paths** |

### 3.4 Desktop — AI / chat (`chatEvents`)

Prefer `ai_request_*` for funnels; keep message events for volume.

| Event | Key parameters |
|-------|----------------|
| `chat_created` | optional `title` if `titles` |
| `ai_request_started` | optional model if `modelAndTokens` |
| `ai_request_completed` | optional model/tokens; optional `text_preview` if toggled |
| `ai_request_failed` | `error_type`; optional model; requires `reliability` for error detail attachment when dual-gated |
| `message_sent` | `role`; optional model/tokens/`text_preview` |
| `message_received` | `role`; optional model/tokens/`text_preview` |

`text_preview` is GA4-only and only when `truncatedMessageText` is on.

### 3.5 Desktop — reliability (`reliability`)

| Event | Key parameters |
|-------|----------------|
| `updater_check` / `updater_download` / `updater_install` / `updater_error` | sanitized `error_type` on error |
| `ollama_setup_*` | coarse state / `error_type` |
| `api_request_failed` | `operation`, `error_type`, optional `http_status`, `retryable` |
| `authentication_failed` | `error_type`, `operation` |
| `file_operation_failed` | `operation`, `error_type` — no paths |

### 3.6 Desktop — conversion candidates (GA4 key events)

Mark in GA4 Admin (manual): `user_signed_up`, `onboarding_completed`, `project_created` (first-project analysis via audiences/funnels).

Reserve names only (do not instrument until billing exists): `subscription_started`, `subscription_upgraded`, `subscription_cancelled`.

### 3.7 Web — marketing only

| Event | Key parameters |
|-------|----------------|
| Automatic page views | route (GA4 enhanced measurement / explicit page_view as implemented) |
| `app_opened` | once per session load; `app=web` |
| `download_clicked` | `platform` / asset label if known; `source` |
| `cta_clicked` | `feature` / `source` (hero, nav, …) |
| `release_viewed` | version string when on releases |

### 3.8 Clarity custom tags

Both surfaces, non-sensitive only:

- `app`, `platform`, `app_version`, `environment`
- `user_state` (`anonymous` | `signed_in`) on desktop when known
- `plan` if known

**Never** tag: message text, private chat titles, emails, UIDs (prefer omit), tokens, file paths.

### 3.9 Intentionally not tracked

Modal open/close, component render, generic clicks, every settings keystroke, stack traces, full transcripts.

### 3.10 Mapping from PostHog plan (never shipped)

| PostHog plan event | Fate |
|--------------------|------|
| `app_opened` / `app_quit` | Keep; `app_quit` → `app_closed` |
| `setup_wizard_step` / `setup_wizard_completed` | Keep; completed → `onboarding_completed` |
| `analytics_consent_set` | Keep |
| `feature_used` | Keep |
| `chat_created`, `message_*`, `chat_completed` / `chat_failed` | Keep volume events; prefer `ai_request_*` for completion/failure funnel |
| `updater_*`, `ollama_setup_*`, `proxy_error` | Keep as reliability; `proxy_error` → `api_request_failed` with `operation` |
| Autocapture / session replay via PostHog | **Removed** — Clarity owns session/UX |

---

## 4. Implementation shape

### 4.1 Desktop modules

| Path | Role |
|------|------|
| `app/src/main/analytics/policy.ts` | Pure filter + unit tests |
| `app/src/main/analytics/events.ts` | Event name constants + category map |
| `app/src/main/analytics/ga.ts` | GA4 MP client: init / track / identify / reset / shutdown |
| `app/src/main/analytics/index.ts` | Public `track` + lifecycle helpers |
| Clarity bridge (IPC + renderer) | Load/unload Clarity; apply allowed tags |
| Settings / IPC / preload / types | Consent + analytics field groups |
| Renderer Privacy UI + soft-ask | Same UX intent as PostHog plan |
| Call sites | `main.ts`, auth, chat, projects, updater, ollama-setup, settings |

### 4.2 Desktop env

| Key | Required | Notes |
|-----|----------|--------|
| `ANYLM_GA_MEASUREMENT_ID` | no | Empty → GA4 disabled |
| `ANYLM_GA_API_SECRET` | no | GA4 Measurement Protocol API secret; required together with measurement ID (both empty or both set). Create in GA4 Admin → Data stream → Measurement Protocol API secrets. Treated like other public bake-in write tokens (same class as former PostHog project key) — prefer repo Variables, not a personal API key. |
| `ANYLM_CLARITY_ID` | no | Empty → Clarity disabled |

GA4 is enabled only when **both** measurement ID and API secret are non-empty.

Add to `app/scripts/env-schema.js` `PUBLIC_KEYS`, `app/.env.example`, and `app/src/main/env.ts`.

GitHub Actions (`.github/workflows/build.yml` Build and package `env:`):

```yaml
ANYLM_GA_MEASUREMENT_ID: ${{ vars.ANYLM_GA_MEASUREMENT_ID || secrets.ANYLM_GA_MEASUREMENT_ID }}
ANYLM_GA_API_SECRET: ${{ vars.ANYLM_GA_API_SECRET || secrets.ANYLM_GA_API_SECRET }}
ANYLM_CLARITY_ID: ${{ vars.ANYLM_CLARITY_ID || secrets.ANYLM_CLARITY_ID }}
```

Optional: blank must not fail the build. Prefer repository **Variables**.

Logical ID mapping (user-provided later → env):

| Logical | Env |
|---------|-----|
| `DESKTOP_GA_MEASUREMENT_ID` | `ANYLM_GA_MEASUREMENT_ID` |
| `DESKTOP_GA_API_SECRET` | `ANYLM_GA_API_SECRET` (fifth value required for desktop MP; not one of the four public IDs) |
| `DESKTOP_CLARITY_ID` | `ANYLM_CLARITY_ID` |

### 4.3 Web modules

| Path | Role |
|------|------|
| `web/components/site/Analytics.tsx` | GA4 + Clarity via `next/script` when IDs set |
| `web/lib/analytics.ts` | `track(event, params)` → `gtag`; no-op if unset |
| `web/lib/analytics.events.ts` | Marketing event name constants |
| Call sites | Download asset/CTA, hero/nav CTA, releases |

### 4.4 Web env

| Key | Required | Notes |
|-----|----------|--------|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | no | Empty → GA4 disabled |
| `NEXT_PUBLIC_CLARITY_ID` | no | Empty → Clarity disabled |

Document in `web/.env.example`. Set on Vercel; do not commit real values.

| Logical | Env |
|---------|-----|
| `WEB_GA_MEASUREMENT_ID` | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| `WEB_CLARITY_ID` | `NEXT_PUBLIC_CLARITY_ID` |

### 4.5 Environment separation

```
WEB
├── NEXT_PUBLIC_GA_MEASUREMENT_ID
└── NEXT_PUBLIC_CLARITY_ID
DESKTOP
├── ANYLM_GA_MEASUREMENT_ID
├── ANYLM_GA_API_SECRET
└── ANYLM_CLARITY_ID
```

Web builds must not receive desktop IDs; desktop builds must not receive web IDs. Preview/dev should stay empty unless non-prod traffic is explicitly desired.

---

## 5. Deploy & manual configuration

### 5.1 GitHub Actions

- Add desktop analytics Variables as above.
- No PostHog secrets/vars exist in workflows today — nothing to delete in YAML; scrub PostHog from superseded docs.
- Web analytics not injected by desktop build workflows.

### 5.2 Vercel

- Inspect Production / Preview / Development.
- Set web GA/Clarity IDs on Production when ready.
- Prefer empty Preview/Development.
- No WordShield work.

### 5.3 Manual GA4 / Clarity admin

After IDs exist:

1. Create separate GA4 properties (or data streams) for web vs desktop if using distinct measurement IDs.
2. Mark key events: desktop `user_signed_up`, `onboarding_completed`, `project_created`; web `download_clicked`.
3. Confirm separate Clarity projects for web vs desktop.
4. Verify no sensitive fields appear in DebugView / recordings metadata.

---

## 6. Testing / verification

**Desktop**

- Unit: `policy.filter` — consent false drops all; each field group strips/allows; truncate clamp.
- Unit: settings defaults merge for older settings files.
- `bun run typecheck` / `bun test` under `app/`.
- Manual: empty IDs → no outbound GA4/Clarity; Decline stops both; Accept + login sets `user_id`; `truncatedMessageText` off → no `text_preview`.

**Web**

- `npm run typecheck` / `npm run build` under `web/`.
- Empty IDs → no scripts / no network to GA/Clarity.
- With IDs: page view fires; `download_clicked` once per click with expected params.

**Separation**

- Grep/build config: web never references `ANYLM_GA_*` / `ANYLM_CLARITY_*`; desktop never references `NEXT_PUBLIC_GA_*` / `NEXT_PUBLIC_CLARITY_*`.

---

## 7. File touch list (expected)

| Path | Change |
|------|--------|
| `app/scripts/env-schema.js` | GA + Clarity public keys |
| `app/.env.example` | Document keys |
| `app/src/main/env.ts` | Expose IDs |
| `app/src/main/analytics/*` | New policy, events, ga, index |
| `app/src/main/settings.ts` + domain types | Consent + field groups |
| `app/main.ts`, IPC, preload, api types | Init/shutdown + analytics IPC |
| Renderer settings HTML/JS/CSS | Privacy tab + soft-ask |
| Chat / auth / projects / updater / ollama call sites | Emit events |
| `.github/workflows/build.yml` | Inject desktop analytics env |
| `web/components/site/Analytics.tsx` | New |
| `web/lib/analytics.ts` (+ events) | New |
| `web/app/layout.tsx` + CTA/download/releases | Mount + track |
| `web/.env.example` | Document public analytics keys |
| Prior PostHog design/plan | Status → superseded |
| Web SEO design §6 | Point at this spec |

---

## Self-review checklist

- [x] No TBD/TODO placeholders in requirements
- [x] Consent vs identify vs field groups consistent with locked decisions
- [x] GA4 vs Clarity responsibilities explicit; no message text to Clarity
- [x] Web marketing-only taxonomy explicit
- [x] Env naming follows repo conventions; logical WEB_/DESKTOP_ IDs mapped
- [x] WordShield explicitly out of scope
- [x] PostHog never-shipped state documented; supersession clear
- [x] Single implementation plan is enough for this scope
