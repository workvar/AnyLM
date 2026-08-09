# Electron PostHog analytics

**Date:** 2026-08-09  
**Status:** Approved (design)  
**Approach:** Main-process `posthog-node` client (Approach 1)  
**Surfaces:** `app/` Electron desktop only (`main`, preload, renderer settings). Not `web/`.

## Problem

The desktop app has no product or reliability analytics. We need PostHog in the Electron app to understand usage and failures without treating the machine as a web page (no website GA/Clarity/PostHog work here). Users must control what leaves the device, including chat/message-related telemetry.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Electron `app/` only; no website PostHog |
| SDK | `posthog-node` in **main**; renderer via IPC only |
| Purpose | Product usage **and** reliability |
| Consent | Soft-ask: capture with defaults until user Declines; Accept / Decline / Settings |
| Identity | Anonymous until `analyticsConsent === true` and signed in → `identify(firebaseUid)` only (no email) |
| Chat analytics | Events for chats/messages; payload controlled by field-group toggles |
| Default payload (first install) | Level **B**: counts + titles (+ model/token metadata on) |
| Truncated text | Available as opt-in field group (level C); **off** by default; N=200 (clamped 50–500) |
| Settings UI | New Privacy/Analytics settings tab; master enable + **independent field-group toggles** |
| Autocapture / session replay | Never |
| Hard never-send | Full message bodies beyond truncation; tool args/outputs; absolute file paths; emails; API keys |

## Goals

1. Capture product and reliability events when a PostHog project key is configured.
2. Soft-ask on first meaningful home after setup; defaults match counts + titles (B).
3. Settings tab lets users turn analytics off and configure each field group independently.
4. Chat/message analytics (`chat_created`, `message_sent` / `message_received`, completion/failure) respect those toggles.
5. Identify with Firebase UID only after explicit Accept (`consent === true`).
6. Empty PostHog key → full no-op (local/dev safe).

## Non-goals

- PostHog (or other analytics) on the marketing site.
- Session replay, autocapture, heatmaps.
- Creating the PostHog project / committing a real production key into git.
- Sending full chat transcripts or tool payloads.
- Cookie banners / GDPR legal copy beyond clear in-app wording.

---

## 1. Architecture

```
Renderer (settings, soft-ask, UI events)
    │  IPC: get/set analytics settings, capture(uiEvent)
    ▼
Main analytics module
    ├── policy.filter(draft, settings)   // pure; strips/drops
    ├── client (posthog-node)            // no-op if no key / opted out
    └── callers: main lifecycle, ipc chat, updater, ollama-setup, auth
```

- Init after `app.whenReady` when key present; `shutdown()` on quit (short timeout).
- Analytics failures never throw into product paths; optional local log only.
- Distinct ID: PostHog-managed anonymous id until identify; `reset()` on sign-out when previously identified.

---

## 2. Configuration

### 2.1 Env (public bake path)

Add to `app/scripts/env-schema.js` `PUBLIC_KEYS` and `app/.env.example`:

| Key | Required | Notes |
|-----|----------|--------|
| `ANYLM_POSTHOG_KEY` | no | Empty → analytics disabled |
| `ANYLM_POSTHOG_HOST` | no | Default `https://us.i.posthog.com` |

Same rules as other public identifiers: safe to ship in the asar; not a server secret.

### 2.2 Settings (`AppSettings`)

```ts
analyticsConsent: null | boolean; // null = soft-ask pending; false = off; true = on + may identify

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

**Consent semantics**

| `analyticsConsent` | Capture? | Identify UID? |
|--------------------|----------|---------------|
| `null` | Yes, with current field groups (defaults = B) | No |
| `false` | No | No |
| `true` | Yes, with field groups | Yes when signed in |

Master Settings toggle: off → `false`; on → `true` (does not re-show soft-ask). Soft-ask Accept → `true`; Decline → `false`.

---

## 3. Policy (what gets synced)

`policy.filter(eventName, props, settings)`:

1. If no key or `analyticsConsent === false` → drop.
2. Map event to a category (`productUsage` | `reliability` | `chatEvents`). If that group is off → drop.
3. Strip props:
   - `title` / project title unless `titles`
   - `model`, token fields unless `modelAndTokens`
   - `text_preview` unless `truncatedMessageText`; else slice to `truncateChars`
4. Never pass tool args/outputs, file paths, emails, or untruncated full bodies (not exposed as toggles).

---

## 4. Event catalog

### 4.1 Product usage (`productUsage`)

- `app_opened`, `app_quit`
- `setup_wizard_step`, `setup_wizard_completed`
- `analytics_consent_set` `{ value: true | false }`
- `feature_used` `{ feature: string }` — coarse names only (`project_created`, `tools_toggled`, `skill_enabled`, …)

### 4.2 Reliability (`reliability`)

- `updater_check` / `updater_download` / `updater_install` / `updater_error` (code/message sanitized)
- `ollama_setup_*` (state transitions / failures)
- `proxy_error` `{ code }`
- `chat_failed` may dual-gate: requires `chatEvents` and attaches error code when `reliability` is on

### 4.3 Chats & messages (`chatEvents`)

- `chat_created` — optional `title` if `titles`
- `message_sent` / `message_received` — `role`; optional `model`, `prompt_tokens`, `completion_tokens` if `modelAndTokens`; optional `text_preview` if `truncatedMessageText`
- `chat_completed` — coarse duration bucket; optional model/tokens per toggles
- `chat_failed` — error code when allowed

Instrument at existing chat IPC / completion boundaries in main (not by scraping the DOM).

---

## 5. UI

### 5.1 Soft-ask

After first-run setup wizard completes (or on first home if wizard already marked done and consent still `null`): modal or banner —

- Short copy: usage analytics help improve AnyLM; configurable in Settings.
- **Accept** / **Decline**
- Secondary **Configure…** → Privacy settings tab (consent stays `null` until Accept/Decline or master toggle)

### 5.2 Settings hub tab

New nav item **Privacy** (label may be **Analytics** if Privacy is overloaded later) beside General / Models / …

- Master: Share usage analytics
- Field groups as independent checkboxes matching `analytics.*` booleans
- Truncate length control visible only when `truncatedMessageText` is on
- Brief note: message bodies are never sent in full; truncated previews only when enabled

Reuse existing settings panel patterns (`settings-nav`, `settings-panel-*`).

---

## 6. Modules & file touch list (expected)

| Path | Change |
|------|--------|
| `app/package.json` | add `posthog-node` |
| `app/scripts/env-schema.js` | PostHog public keys |
| `app/.env.example` | document keys |
| `app/src/main/env.ts` | expose key/host |
| `app/src/main/analytics/client.ts` | new |
| `app/src/main/analytics/policy.ts` | new (+ unit tests) |
| `app/src/main/analytics/events.ts` | new |
| `app/src/main/settings.ts` + `domain.d.ts` | consent + analytics defaults |
| `app/main.ts` | init / shutdown |
| `app/src/main/ipc.ts` + `preload.ts` + `api.d.ts` | analytics IPC |
| `app/src/renderer/index.html` + settings JS/CSS | Privacy tab + soft-ask |
| Chat / auth / updater / ollama-setup call sites | emit events |

---

## 7. Testing / verification

- Unit: policy — each field group strips/allows; consent false drops all; truncate clamp
- Unit: settings merge defaults for older `llmeter-settings.json` files
- Manual: empty key → no outbound PostHog; with key → Accept/Decline/Settings changes behavior
- Manual: with `truncatedMessageText` off, no `text_preview` in captured props; with on, length ≤ `truncateChars`
- `bun run typecheck` / `bun test` under `app/`

---

## Self-review checklist

- [x] No TBD/TODO placeholders in requirements
- [x] Consent vs identify vs field groups consistent
- [x] Default B (titles on, truncated text off) explicit
- [x] Website out of scope
- [x] Single implementation plan is enough
