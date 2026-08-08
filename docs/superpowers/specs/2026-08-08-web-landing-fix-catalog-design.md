# Web landing fix + product-accurate catalog

**Date:** 2026-08-08  
**Status:** Approved (design)  
**Approach:** Surgical visual fix + data/copy refresh; constellation stays full-bleed with hub below hero text and a readable scrim (approach 1 + hero layering from 3)  
**Surfaces:** `web/components/home/*`, `web/app/globals.css`, typed data under `web/components/home/*.data.ts`

## Problem

1. **Hero distortion / unreadability:** The constellation hub, glow, and `AnyLM · :3227` label sit on the hero subcopy. Peripheral node labels collide with the badge/headline. `preserveAspectRatio="xMidYMid slice"` stretches the graph.
2. **ActivityStrip gauge:** “STEP 01 / Single endpoint” and the progress arc are not concentric/centered in the circular track.
3. **Low contrast:** Mist/grey secondary text on void backgrounds is hard to read in Insights chips, Live pool meta, and hero helper copy.
4. **Stale catalog:** Skills / Tools / Platform, Features, Enhance, and Comparison lag recent product work (multi-agent, project-first coding, Ollama setup, load protection, artifacts, tools toggle / model lock, activity/reasoning strip, document research quality).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Marketing site `web/` only (home sections + shared tokens) |
| Approach | Fix existing layout; expand catalog data/copy — no new spotlight section |
| Constellation | Full-bleed behind hero; hub/labels pushed **below** subcopy/CTAs; soft dark scrim under hero text |
| SVG fit | Prefer `meet` (or fixed-aspect wrapper) over distorting `slice` |
| Catalog depth | Product-accurate Option A — include built and designed capabilities, including uncommitted-but-built (e.g. setup wizard) |
| Multi-agent messaging | Phase 1 core + agent trail — not the deferred full agent catalog |
| Download empty state | Leave “No build published yet” until a real release exists |
| Out of scope | New nav routes, download/releases redesign, Electron theme port |

## Goals

1. Hero headline and subcopy fully readable; no constellation label or glow occluding type.
2. Radial graph geometrically coherent (centered hub in lower band, undistorted aspect, labels tied to nodes).
3. ActivityStrip gauge text and arc concentric and centered.
4. Secondary text contrast improved site-wide via mist token (and local overrides only if needed).
5. Capabilities / Features / Enhance / Comparison reflect current AnyLM product surface accurately.

## Non-goals

- Live telemetry or real pool metrics.
- Rewriting download/releases pages.
- Electron app visual redesign (separate spec).
- Claiming Phase 2–5 multi-agent specialists as shipped.

---

## 1. Hero readability & constellation

**Files:** `Hero.tsx`, `Constellation.tsx`, `globals.css`

1. Keep constellation `absolute inset-0` full-bleed behind content (`pointer-events-none`, `aria-hidden`).
2. Wrap hero copy in `relative z-10` with a soft radial/vertical scrim (void → transparent) so type stays sharp without a card chrome.
3. Move hub geometric center into the **lower** hero band (below subcopy and primary CTAs), approximately 70–75% of section height; reposition peripheral nodes around that center so spokes do not cross the headline.
4. Hub label (`AnyLM · :3227`): place under the graph / lower band, never over paragraph text; hide on very small viewports if cramped (existing `sm:` pattern OK).
5. Change SVG fitting so the constellation is not sliced/stretched (`xMidYMid meet` or equivalent fixed-aspect layer).
6. Node HTML labels share node percentage coords; ensure clearance from badge and `h1`.
7. Bump `--color-mist` slightly (e.g. `#9aa3b8` → ~`#b4bcd0`) for body/secondary readability.

## 2. Insights & ActivityStrip

**Files:** `Insights.tsx`, `ActivityStrip.tsx`, mist token (shared)

1. **Insights:** Keep bento structure. Rely on mist contrast for chip/body readability. Do **not** force multi-agent into the tall runtime card if it crowds; narrative belongs in Enhance + Capabilities.
2. **ActivityStrip gauge:** Single relative container with centered SVG ring + centered label stack; progress stroke concentric with track (`strokeDasharray` / radius consistent). Keep SENT / ROUTED / QUEUED chips and pills; improve meta contrast via mist.
3. Tighten accidental large vertical gaps only if caused by spacing, not missing content.

## 3. Product-accurate catalog & copy

**Files:** `capabilities.data.ts`, `features.data.ts`, `EnhanceModels.tsx`, `comparison.data.ts` (and thin copy tweaks in consuming components if needed)

### Capabilities

| Tab | Updates |
|-----|---------|
| Skills | Keep Web research, Google Calendar, Outlook, Custom. Add **Project-first coding** (scaffold/files on disk; summary-only reply). Mention research-then-write / document quality only where it maps to a skill or platform item without inventing tools. |
| Tools | Keep existing registry entries; do not invent tool names. Artifacts browsing is platform/UX, not a fake tool. |
| Platform | Keep proxy, pooling, streaming, Projects+RAG, governance, auto-updates. Add: Multi-agent orchestration (Phase 1 + trail), Load protection, Ollama setup / boot splash, Artifacts explorer + standalone document generation, Tools toggle persistence & model lock, Reasoning / activity strip, Document research quality. |

### Features grid + Enhance

- Add 1–2 Features cards for headline capabilities (multi-agent, project-first coding) if the grid stays balanced; otherwise fold into Enhance only.
- Enhance points: add multi-agent on complex turns, project-first coding, guided Ollama setup; retain tools/skills/RAG/router/connectors.

### Comparison

Add honest rows where AnyLM differs, e.g.:

- Multi-agent orchestration  
- Project-first coding / file writes  
- Load protection (RAM soft-stop)

Peer cells: yes / partial / no per public positioning; footnote tone unchanged.

### Tone

Marketing-accurate. Phase 1 multi-agent = orchestrator core + trail. Uncommitted-but-built setup wizard may be listed as a product capability.

## 4. Architecture & testing

- Stay on Next.js App Router + existing Tailwind/framer-motion patterns; no new backend.
- Data remains typed constants under `web/components/home/`.
- Manual verify: home at desktop + mobile widths — hero text clear, constellation hub below copy, gauge centered, Capabilities tabs show new items, comparison scrolls on small screens.
- Respect `prefers-reduced-motion` (existing constellation pulse behavior).

## 5. Implementation order

1. Mist token + hero scrim / z-index  
2. Constellation geometry + SVG fit + labels  
3. ActivityStrip gauge centering  
4. Capabilities / Features / Enhance / Comparison data refresh  
5. Visual pass on Insights secondary text  

---

## Spec self-review

- No unresolved placeholders.
- Decisions match user choices (Option A catalog; approach 1 + hero layering).
- Scope excludes Electron theme and download redesign.
- Multi-agent claims bounded to Phase 1.
