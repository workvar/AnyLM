# Boot splash + Ollama setup gate

**Date:** 2026-08-08  
**Status:** Approved (design)  
**Approach:** Launch-flow module + soft Ollama gate (approach 1)  
**Surfaces:** boot splash in renderer HTML/CSS/auth bootstrap; `app/src/main/ollama.ts` (or sibling) detect/start; settings flag; modal + banner UI; IPC

## Problem

1. **Auth flash:** On launch, `#auth-screen` is the first paint. Users with a valid session briefly see the login screen, then jump to the dashboard. That feels broken.
2. **Ollama missing/stopped:** Local chat depends on Ollama. Today the status row shows “Ollama offline,” but there is no guided setup: install if missing, start if installed but not running, or dismiss permanently.

Existing building blocks: `ollama.status()` HTTP check, `embedInstallDeclined` / first-run modal patterns, `shell.openExternal`, auth gate in `auth.ts` + `app.ts` init.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Splash | Full-viewport logo animation; only first paint; hide auth + app until boot done |
| Splash wait | Auth check **and** minimum ~1s animation (whichever finishes last) |
| Splash scope | Does **not** wait on Ollama, projects, or Chroma |
| Ollama states | `running` \| `installed` \| `missing` |
| Not installed | Modal copy about install + **Install Ollama** → `https://ollama.com/download` |
| Installed, not running | Modal copy about not running + **Start Ollama** (background) |
| Later | Persist `ollamaSetupDeclined: true`; never show modal or banner again |
| Close without Later | Hide modal; show quiet top banner this session; next launch show modal again |
| UI pattern | Modal first; banner only after dismiss without Later (approach C) |
| Platforms | Windows, macOS, Linux (Debian/Ubuntu + Arch paths) |
| API-key skip | Deferred — no OpenAI/Claude key store yet; do not gate on keys in this work |
| Prompt queue | Sequential with first-run / embed prompts (do not stack overlays) |

## Goals

1. No flash of login ↔ dashboard: splash → correct screen only.
2. Detect Ollama as running, installed-but-stopped, or missing on Win/macOS/Linux.
3. Offer Install (browser) or Start (background process), plus permanent Later.
4. Dismiss without Later → session banner; modal returns next launch until Later or Ollama is up.
5. Reuse existing settings persistence and modal/status patterns.

## Non-goals

- Skipping the gate when cloud provider API keys exist (deferred).
- Auto-installing Ollama via package managers / silent installers.
- Replacing the existing status-dot “Ollama offline” row (it stays; this is additive).
- Waiting on project list or Chroma before leaving the splash.
- Settings UI to reset `ollamaSetupDeclined` (can add later).

---

## 1. Architecture

**Boot splash (renderer)** owns first paint and the auth timing gate. Main process is unchanged for auth itself (`authMe`).

**Ollama setup (main + renderer)** owns detect / start / open download. Renderer owns modal + banner and settings writes for decline.

```
app load
  → show #boot-splash only
  → parallel: authMe() + min ~1s timer
  → hide splash
      no session → #auth-screen
      session    → #app + startApp + launch flows
                    → queue: first-run? → embed? → ollama setup?
```

```
ollama setup (post-auth, if not declined)
  → main: detect() → running | installed | missing
      running  → no UI
      installed → modal (Start / Later); dismiss → banner
      missing  → modal (Install / Later); dismiss → banner
  → Start → spawn platform process → poll status → hide UI or show error
  → Install → openExternal(download URL)
  → Later → settings.ollamaSetupDeclined = true; hide modal + banner
```

---

## 2. Components & data flow

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `#boot-splash` + CSS | Logo animation, first paint | `index.html`, `styles.css` |
| `auth.ts` / `app.ts` init | Hide auth+app initially; reveal after splash+auth | `window.api.authMe` |
| `ollama` detect/start (main) | Reachability, binary/app presence, start process | `fetch`, `fs`, `child_process`, `shell` |
| IPC | `ollama:status` enriched (or sibling), `ollama:start`, open download if needed | preload + `api.d.ts` |
| Settings | `ollamaSetupDeclined: null \| true` | `settings.ts` defaults |
| `ollama-setup` (renderer) | Modal + banner, launch flow, queue with embed/first-run | settings, IPC |
| Status row | Unchanged green/red after refresh | existing `refreshStatus` |

### Detection details

1. **Running:** existing HTTP `GET {host}/api/tags` succeeds.
2. **Installed** (if not running): `ollama` on `PATH`, then fallbacks:
   - **macOS:** `/usr/local/bin/ollama`, `/opt/homebrew/bin/ollama`, `/Applications/Ollama.app`
   - **Windows:** `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`, Program Files `Ollama\ollama.exe`
   - **Linux:** `/usr/bin/ollama`, `/usr/local/bin/ollama` (covers Debian/Ubuntu and Arch installs)
3. Else **missing**.

### Start details

- **macOS:** `open -a Ollama` if app present; else detached `ollama serve`.
- **Windows:** detached launch of `Ollama.exe` / `ollama.exe` (no console window).
- **Linux:** detached `ollama serve` (systemd user unit is optional nice-to-have, not required for v1).
- After start: poll status for a short window; success closes UI; failure shows one-line error on modal/banner.

### Install

Always `shell.openExternal("https://ollama.com/download")`.

---

## 3. UI copy (locked intent)

**Missing**

- Title: Ollama is not installed  
- Body: Ollama is required to run models locally.  
- Primary: Install Ollama  
- Secondary: I’ll do it later  

**Installed, not running**

- Title: Ollama isn’t running  
- Body: Ollama is installed but not running. Start it to use local models.  
- Primary: Start Ollama  
- Secondary: I’ll do it later  

**Banner:** Same actions, compact one-line message matching the state. No separate dismiss control — banner stays until **Later** or Ollama becomes reachable.

---

## 4. Error handling

| Case | Behavior |
|------|----------|
| Detect fails oddly | Treat as `missing` if no binary; else `installed` if binary found but HTTP fails |
| Start spawn fails | Keep modal/banner; show short error string |
| Start succeeds but slow | Keep UI until poll succeeds or timeout (~15–30s), then error |
| Download open fails | Show short error; user can retry Install |
| Declined user later installs Ollama | No prompt (declined sticks); status row still reflects reality |

---

## 5. Testing

- Unit: path detection helpers per platform (mock `fs` / `PATH`); status mapping `running` / `installed` / `missing`.
- Unit: decline flag suppresses launch UI; dismiss without decline does not set flag.
- Manual: cold launch logged-out → splash → login; logged-in → splash → dashboard (no login flash).
- Manual: Ollama quit → modal Start works on each OS; missing → Install opens browser; Later persists across relaunch; dismiss → banner this session, modal next launch.
- Manual: first-run / embed open → Ollama modal waits until they close.

---

## 6. File touch list (expected)

| Area | Files (approx.) |
|------|-----------------|
| Splash markup/CSS | `app/src/renderer/index.html`, `styles.css` |
| Boot / auth reveal | `app/src/renderer/js/auth.ts`, `app.ts` |
| Ollama detect/start | `app/src/main/ollama.ts` (+ tests), maybe `ollama-setup.ts` if split |
| IPC / preload / types | `ipc.ts`, `preload.ts`, `api.d.ts`, settings types |
| Settings default | `app/src/main/settings.ts` |
| Renderer gate UI | new `ollama-setup.ts` (or similar), HTML modal + banner |
| Launch queue | `app.ts` / updates / embedmodel coordination |

---

## 7. Out of scope follow-ups

- Skip Ollama gate when any cloud provider API key is configured.
- Settings control to re-enable the Ollama setup prompts after Later.
- Native package-manager install flows (brew, winget, apt, pacman).
