# Load protection

**Date:** 2026-08-08  
**Status:** Approved (design)  
**Approach:** Boundary-only system RAM checks (approach 1)  
**Surfaces:** `app/src/main/load-guard/`, `agents` settings, chat turn IPC, multi-agent orchestrator, Settings → Agents UI

## Problem

On a local machine (e.g. M4 Pro, 24GB RAM) with Ollama models and multi-agent turns (`agents.maxParallel` default 2), system memory pressure can contribute to hangs. Users want agents to cooperate under load and a setting that stops the current turn when system RAM used exceeds a configurable percentage — without killing Ollama or the app.

Existing building blocks: soft-stop via the chat `stopped` / `chat:stop` path, `resolveAgentSettings` / `maxParallel`, orchestrator wave scheduling. Nothing samples system RAM or ties pressure to stop + parallel caps today.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Kill action | Soft-stop the current turn only (same path as Stop). Ollama and the app stay up |
| Memory metric | System RAM used % (machine-wide) |
| At kill line | Drop `maxParallel` to 1 **and** soft-stop together (same threshold) |
| Throttle band | None — no earlier warn/throttle % below kill |
| Default kill % | 90, user-configurable |
| Kill % clamp | 50–99 |
| Feature flag | `agents.loadProtection.enabled` default **on** |
| Sampling | Approach 1: before turn start, before each multi-agent wave, ~2s sustained check while a turn is in flight |
| Settings UI | Settings → Agents, “Load protection” block (toggle + %) |
| Sample failure | Fail open (do not stop; do not force `maxParallel=1`) |

## Goals

1. Soft-stop an active turn when system RAM used stays over the kill % (default 90).
2. At that same kill line, force `maxParallel = 1` for remaining waves / new turns while still over the line.
3. Sample only at turn/wave boundaries plus a short in-flight sustained check — no always-on idle watchdog.
4. Expose enable + kill % under Settings → Agents.
5. Reuse existing stop/`stopped` path and agent settings merge.

## Non-goals

- Unloading or killing the Ollama process/server.
- Always-on background RAM polling while idle.
- An earlier warn/throttle band below the kill threshold.
- Disk / storage-pressure monitoring (may contribute to hangs on constrained disks; deferred).
- Changing default `agents.maxParallel` (remains 2 unless the user changes it).

---

## 1. Architecture

**Load guard (main process)** owns system RAM sampling and pressure decisions. The renderer shows settings and optional stop reason messaging; it does not measure memory.

**When it samples**

- Before a chat turn starts
- Before each multi-agent wave
- During an in-flight turn: short sustained check (~2s between samples) so a long single-agent stream is not unchecked for minutes

**When over the kill %** (default 90, configurable)

1. Soft-stop the active turn via the existing Stop path (Ollama and app stay up)
2. Force `maxParallel = 1` for that turn’s remaining waves and for new turns while still over the line

**When under the kill % again** — restore configured `maxParallel`; no separate warn band.

**Integration points:** turn entry in `ipc` chat handling, orchestrator wave scheduling, existing stop / `stopped` flag. Kill threshold lives next to agent settings.

```
chat:send / wave boundary / in-flight ~2s sample
  → load-guard: system RAM used %
      sample fail → fail open (continue)
      disabled    → continue with configured maxParallel
      under kill  → continue (configured maxParallel)
      over kill   → soft-stop turn + maxParallel = 1
```

---

## 2. Components & data flow

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `app/src/main/load-guard/system-memory.ts` | Read machine-wide used RAM % (macOS-friendly primary; injectable for tests) | OS APIs / child process as needed |
| `app/src/main/load-guard/guard.ts` | `isOverKillLimit`, `effectiveMaxParallel`, ~2s sustained helper | `system-memory`, settings kill % |
| `app/src/main/load-guard/*.test.ts` | Unit coverage with fake sampler | guard + clamp helpers |
| `app/src/main/settings.ts` + `agents/settings.ts` | Persist/merge `agents.loadProtection.{enabled,killPercent}` | existing settings read/write |
| `app/src/main/ipc.ts` | Sample before turn; in-flight sustained check; soft-stop via `stopped` | load-guard, existing stop path |
| `app/src/main/agents/orchestrator.ts` | Before each wave: sample; pass `maxParallel` 1 if over; cooperate with soft-stop | load-guard, agentCfg |
| Settings UI (Agents) | Toggle + kill % control | `settings:get` / `settings:set` |

**Settings fields**

- `agents.loadProtection.enabled` — boolean, default `true`
- `agents.loadProtection.killPercent` — number, default `90`, clamp **50–99**

**Hooks**

1. **`ipc.ts` (chat turn)** — before tools/multi-agent path: sample → if over kill, soft-stop immediately (same `stopped` path as `chat:stop`); else start turn. While turn runs, ~2s re-sample; on trip → set `stopped` / invoke existing stop.
2. **`agents/orchestrator.ts`** — before each wave: sample → pass `maxParallel: over ? 1 : agentCfg.maxParallel`; if over mid-turn, also trigger soft-stop so the turn ends rather than only serializing forever under pressure.
3. **Renderer** — persist kill % via existing `settings:set`; one-line status when a turn was stopped for memory (e.g. “Stopped: system memory over N%”), reusing stop/governance messaging if cheap.

**Data flow:** settings → `resolveAgentSettings` → turn / `runOrchestratedTurn` → load-guard sample → stop flag and/or `maxParallel=1` → existing finish/stop UI.

---

## 3. Error handling, edge cases & testing

**Sample failures**  
If system RAM cannot be read (platform API error, parse failure), **fail open**: do not soft-stop, do not force `maxParallel=1`. Log once per turn (or rate-limited). Never invent a “100%” reading.

**Disabled guard**  
`agents.loadProtection.enabled === false` → no sampling at boundaries / in-flight; normal `maxParallel` and Stop-only behavior.

**Kill % clamp**  
On read/write: clamp to **50–99** (default **90**). Invalid/missing → default 90. UI control uses the same range.

**Soft-stop messaging**  
Reuse the existing stop path so the turn ends cleanly. Surface a distinct reason once, e.g. “Stopped: system memory over N%”. User can send again after memory drops.

**Edge cases**

- Over limit at turn start → soft-stop before model work (no empty multi-agent plan).
- Over limit mid-wave → set `stopped` and skip further waves (same as Stop); do not require aborting already-started step work beyond existing stop semantics.
- Memory recovers mid-session → next turn/wave uses configured `maxParallel` again.
- Single-agent turns → only turn-start + ~2s in-flight check (no wave hook).

**Testing**

- Unit: % math / clamp; `effectiveMaxParallel`; sustained helper (two samples over limit → trip; one spike then under → no trip); fail-open on mock sample error; disabled → always allow.
- Unit/integration-light: orchestrator gets `maxParallel=1` when guard says over; ipc stop path invoked when over (mock guard).
- No flaky live system-RAM tests in CI — inject a fake sampler.

---

## Out of scope (deferred)

- Unload Ollama / kill external model processes on pressure.
- Always-on idle watchdog polling.
- Warn band below kill (e.g. throttle at kill−10%).
- Disk / free-space pressure as a trip signal.
