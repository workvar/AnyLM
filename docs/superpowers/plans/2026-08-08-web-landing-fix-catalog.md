# Web Landing Fix + Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hero constellation overlap/distortion and ActivityStrip gauge centering, bump mist contrast, and refresh homepage catalog/copy so Skills/Tools/Platform, Features, Enhance, and Comparison match current AnyLM product work.

**Architecture:** Surgical edits in existing `web/` home components. Shared mist token in `globals.css`; hero gets z-index + scrim; constellation geometry moves hub to the lower band with `meet` aspect; catalog stays typed constants in `*.data.ts` consumed by existing section components.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, framer-motion (existing), TypeScript. No new dependencies. Verification: `npm run typecheck` in `web/` + manual visual check (no Jest/Vitest in this package).

**Spec:** `docs/superpowers/specs/2026-08-08-web-landing-fix-catalog-design.md`

## Global Constraints

- Product name remains **AnyLM**
- Marketing site `web/` only — do not change Electron `app/`
- Constellation stays full-bleed behind hero; hub/labels below subcopy; soft scrim under text
- Multi-agent copy = Phase 1 core + trail only (not Phase 2–5 specialists)
- Do not invent tool names; artifacts are platform/UX
- Leave download “No build published yet” empty state alone
- Illustrative metrics only (not live telemetry)
- Respect `prefers-reduced-motion`
- Do not commit unless the user asks

## File map

| File | Responsibility |
| --- | --- |
| `web/app/globals.css` | Bump `--color-mist`; optional `.hero-scrim` utility |
| `web/components/home/Hero.tsx` | z-10 copy stack + scrim; constellation remains backdrop |
| `web/components/home/Constellation.tsx` | Lower hub geometry, `meet` fit, label clearance |
| `web/components/home/ActivityStrip.tsx` | Concentric centered gauge |
| `web/components/home/capabilities.data.ts` | Skills / Tools / Platform catalog |
| `web/components/home/features.data.ts` | Features grid cards |
| `web/components/home/EnhanceModels.tsx` | Enhance local models points |
| `web/components/home/comparison.data.ts` | Comparison matrix rows |
| `web/components/home/Insights.tsx` | No structural change; inherits mist (touch only if a local hard-coded grey remains) |

---

### Task 1: Mist token + hero scrim

**Files:**
- Modify: `web/app/globals.css`
- Modify: `web/components/home/Hero.tsx`
- Test: `cd web && npm run typecheck`

**Interfaces:**
- Consumes: existing `--color-mist`, `.nebula`, hero section structure
- Produces: `--color-mist: #b4bcd0`; hero copy wrapped in `relative z-10` with scrim so Constellation (Task 2) can sit behind without occluding type

- [ ] **Step 1: Bump mist in `globals.css`**

Change the theme token:

```css
--color-mist: #b4bcd0;
```

Optionally add a reusable scrim helper (preferred over one-off inline styles):

```css
.hero-scrim {
  background:
    radial-gradient(ellipse 70% 55% at 50% 42%, rgba(3, 4, 5, 0.88), rgba(3, 4, 5, 0.55) 45%, transparent 72%);
}
```

- [ ] **Step 2: Wrap hero copy with scrim + z-index in `Hero.tsx`**

Keep `<Constellation />` as the first child of the section (behind). Replace the copy wrapper so it reads roughly:

```tsx
<section className="relative min-h-[92dvh] overflow-hidden px-6 pb-16 pt-28 text-center sm:pt-36">
  <Constellation />

  <div className="relative z-10 mx-auto max-w-3xl">
    <div className="hero-scrim pointer-events-none absolute inset-[-3rem] -z-10 rounded-[3rem]" aria-hidden />
    {/* existing badge, h1, subcopy, CTAs unchanged */}
  </div>

  <div className="relative z-10 mx-auto mt-20 flex max-w-4xl ...">
    {/* Works with row */}
  </div>
</section>
```

Do not change headline/CTA copy or `DownloadButton` behavior.

- [ ] **Step 3: Typecheck**

Run: `cd web && npm run typecheck`  
Expected: PASS (no new errors)

- [ ] **Step 4: Commit only if the user asked**

```bash
git add web/app/globals.css web/components/home/Hero.tsx
git commit -m "$(cat <<'EOF'
fix(web): raise mist contrast and scrim hero copy

EOF
)"
```

---

### Task 2: Constellation geometry + SVG fit

**Files:**
- Modify: `web/components/home/Constellation.tsx`
- Test: `cd web && npm run typecheck` + visual check at `/`

**Interfaces:**
- Consumes: Hero section with `z-10` copy + scrim from Task 1
- Produces: Hub at lower band (~72% vertical in viewBox/section space); nodes around hub; `preserveAspectRatio="xMidYMid meet"`; hub label not over subcopy

- [ ] **Step 1: Reposition nodes and hub**

Replace the node/hub constants so the hub sits in the lower band and spokes clear the headline. Concrete values to use (tune ±2% if needed after visual check):

```tsx
const NODES = [
  { id: "a", x: 18, y: 58, label: "llama3.2", sub: "Ollama" },
  { id: "b", x: 28, y: 86, label: "nomic-embed", sub: "RAG" },
  { id: "c", x: 82, y: 56, label: "Cursor", sub: "Editor" },
  { id: "d", x: 72, y: 88, label: "Scripts", sub: "OpenAI SDK" },
  { id: "e", x: 50, y: 48, label: "Notes", sub: "App" },
];

const CX = 50;
const CY = 72;
```

- [ ] **Step 2: Fix SVG aspect + glow placement**

In the SVG element:

- Set `preserveAspectRatio="xMidYMid meet"` (not `slice`).
- Keep lines from each node to `(CX, CY)`.
- Keep hub glow circle at `(CX, CY)`.
- Soften or reposition the large blurred slime orb so it sits near the lower hub (e.g. `top-[58%]` or percentage tied to hub), not behind the subcopy.

- [ ] **Step 3: Fix HTML labels**

- Node labels: keep `left: ${n.x}%`, `top: ${n.y}%`, `transform: translate(-50%, -140%)`. With the new coords they should sit in the lower half, clear of `h1`.
- Hub label: use `top` matching the hub band (e.g. `top-[72%]`), `left-1/2 -translate-x-1/2`, still `hidden sm:block`. Do **not** use a `top` that lands on the paragraph.

Example hub label:

```tsx
<div className="absolute left-1/2 top-[72%] hidden -translate-x-1/2 translate-y-6 rounded-full border border-[var(--color-slime)]/35 bg-black/50 px-3 py-1.5 text-xs font-medium text-[var(--color-slime)] backdrop-blur sm:block">
  AnyLM · :3227
</div>
```

(`translate-y-6` pushes the pill slightly below the hub dot so it does not cover CTAs.)

- [ ] **Step 4: Typecheck + visual**

Run: `cd web && npm run typecheck`  
Expected: PASS  

Manual: `cd web && npm run dev` → open `/` at ~1280px and ~390px widths.  
Confirm: headline + subcopy readable; no green hub through paragraph; no “Notes App” on the badge; graph not stretched.

- [ ] **Step 5: Commit only if the user asked**

```bash
git add web/components/home/Constellation.tsx
git commit -m "$(cat <<'EOF'
fix(web): align constellation hub below hero copy

EOF
)"
```

---

### Task 3: ActivityStrip gauge centering

**Files:**
- Modify: `web/components/home/ActivityStrip.tsx`
- Test: `cd web && npm run typecheck` + visual check of Live pool section

**Interfaces:**
- Consumes: mist token from Task 1
- Produces: concentric gauge with centered “STEP 01 / Single endpoint” label

- [ ] **Step 1: Replace gauge markup with a single centered stack**

Replace the gauge block (the `relative grid h-48 w-48 ...` div) with:

```tsx
<div className="relative h-48 w-48">
  <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full" aria-hidden>
    <circle
      cx="60"
      cy="60"
      r="48"
      fill="none"
      stroke="rgba(255,255,255,0.08)"
      strokeWidth="8"
    />
    <circle
      cx="60"
      cy="60"
      r="48"
      fill="none"
      stroke="#7df9a6"
      strokeWidth="8"
      strokeLinecap="round"
      strokeDasharray="226 301"
      transform="rotate(-90 60 60)"
    />
  </svg>
  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
    <p className="text-[10px] uppercase tracking-wide text-[var(--color-mist)]">Step 01</p>
    <p className="mt-1 text-lg font-semibold">Single endpoint</p>
  </div>
</div>
```

Notes:

- SVG fills the full `h-48 w-48` box (`inset-0`), not `inset-3`, so track and arc share the same center as the text overlay.
- Circumference ≈ `2 * π * 48 ≈ 301`; `226 301` ≈ 75% progress (matches prior intent).
- Keep SENT / ROUTED / QUEUED chips and pills; no content changes required (mist bump handles contrast).

- [ ] **Step 2: Typecheck + visual**

Run: `cd web && npm run typecheck`  
Expected: PASS  

Manual: Live pool gauge — label dead-center; green arc concentric with grey track.

- [ ] **Step 3: Commit only if the user asked**

```bash
git add web/components/home/ActivityStrip.tsx
git commit -m "$(cat <<'EOF'
fix(web): center live-pool endpoint gauge

EOF
)"
```

---

### Task 4: Capabilities + Features + Enhance catalog

**Files:**
- Modify: `web/components/home/capabilities.data.ts`
- Modify: `web/components/home/features.data.ts`
- Modify: `web/components/home/EnhanceModels.tsx`
- Test: `cd web && npm run typecheck`

**Interfaces:**
- Consumes: existing `CapabilityItem`, `CapabilityTab`, `Feature`, `POINTS` shapes
- Produces: expanded SKILLS / PLATFORM / FEATURES / Enhance POINTS; Tools unchanged except no invented names

- [ ] **Step 1: Extend `SKILLS` and `PLATFORM` in `capabilities.data.ts`**

Keep existing Web research, Google Calendar, Outlook, Custom skills. Append:

```ts
{
  name: "Project-first coding",
  description:
    "On coding turns, scaffold and write files in a working folder, research docs when online, and reply with a short summary — not a full source dump.",
  group: "Built-in",
},
```

Keep all existing `TOOLS` entries unchanged.

Append to `PLATFORM` (after existing items):

```ts
{
  name: "Multi-agent orchestration",
  description:
    "On complex turns, plan and run specialized Phase 1 roles in parallel (within maxParallel), then synthesize one reply with an expandable agent trail.",
},
{
  name: "Load protection",
  description:
    "Soft-stop the active turn and cap parallel agents when system RAM used stays over a configurable threshold (default 90%).",
},
{
  name: "Ollama setup + boot splash",
  description:
    "Guided install/start when Ollama is missing or stopped, plus a splash so login never flashes before the real screen.",
},
{
  name: "Artifacts explorer",
  description:
    "Browse and open generated documents across standalone and project folders; generate docs without requiring a project.",
},
{
  name: "Tools toggle + model lock",
  description:
    "Labeled Tools control with project-wide persistence; locked model picker after the first message with a clear explanation.",
},
{
  name: "Activity + reasoning strip",
  description:
    "Live thought / tool / reasoning status for the current turn; only the active phase stays live.",
},
{
  name: "Document research quality",
  description:
    "Research-then-write guidance and thin-content rejection so generated PDFs/DOCX/MD stay substantive.",
},
```

- [ ] **Step 2: Extend `FEATURES` in `features.data.ts`**

Keep the existing six cards. Append two headline cards:

```ts
{
  glyph: "◈",
  title: "Multi-agent when it matters",
  body: "Simple chats stay single-agent and fast. Complex turns plan, route, and run parallel Phase 1 roles, then return one synthesized answer with an agent trail.",
},
{
  glyph: "⌘",
  title: "Project-first coding",
  body: "Coding requests create or update files in a real folder — CLI scaffolds when available — and finish with a file/command summary instead of pasting the whole program into chat.",
},
```

- [ ] **Step 3: Extend Enhance points in `EnhanceModels.tsx`**

Keep existing five `POINTS`. Append:

```ts
{
  title: "Multi-agent on complex turns",
  body: "Heuristics detect hard requests. An orchestrator plans, routes independent work in parallel, and synthesizes one reply — with a collapsed agent trail you can expand.",
},
{
  title: "Project-first coding",
  body: "Scaffold with official CLIs when they exist, write app code with file tools, look up current docs online when possible, and keep the chat bubble to a short summary.",
},
{
  title: "Guided Ollama setup",
  body: "If Ollama is missing or stopped, AnyLM offers Install or Start — plus a boot splash so you never flash login before the dashboard.",
},
```

- [ ] **Step 4: Typecheck**

Run: `cd web && npm run typecheck`  
Expected: PASS  

Manual: `/#capabilities` — Skills and Platform tabs show new rows; `/#features` and `/#enhance` show new cards.

- [ ] **Step 5: Commit only if the user asked**

```bash
git add web/components/home/capabilities.data.ts web/components/home/features.data.ts web/components/home/EnhanceModels.tsx
git commit -m "$(cat <<'EOF'
feat(web): refresh homepage catalog for current product surface

EOF
)"
```

---

### Task 5: Comparison rows + Insights visual pass

**Files:**
- Modify: `web/components/home/comparison.data.ts`
- Modify: `web/components/home/Insights.tsx` only if a hard-coded low-contrast class remains after mist bump (e.g. `text-white/50` on body — leave decorative `text-white/80` chips alone if readable)
- Test: `cd web && npm run typecheck` + visual `/#compare` and `/#insights`

**Interfaces:**
- Consumes: existing `ComparisonRow` / `Cell` types
- Produces: three new comparison axes with honest peer cells

- [ ] **Step 1: Append comparison rows**

Add to `COMPARISON_ROWS`:

```ts
{
  axis: "Multi-agent orchestration",
  anylm: "yes",
  ollama: "no",
  lmStudio: "no",
  jan: "no",
  gpt4all: "no",
},
{
  axis: "Project-first coding / file writes",
  anylm: "yes",
  ollama: "no",
  lmStudio: "partial",
  jan: "partial",
  gpt4all: "no",
},
{
  axis: "Load protection (RAM soft-stop)",
  anylm: "yes",
  ollama: "no",
  lmStudio: "no",
  jan: "no",
  gpt4all: "no",
},
```

Do not change existing rows or column headers. Keep Comparison footnote tone as-is in `Comparison.tsx`.

- [ ] **Step 2: Insights pass**

Open `/#insights`. If chip/body text is readable after mist bump, leave `Insights.tsx` unchanged. If any body still uses an overly dim local class (e.g. `text-white/40`), bump that class to `text-white/70` or `text-[var(--color-mist)]`. Do **not** add multi-agent into the tall runtime card.

- [ ] **Step 3: Full verification**

Run: `cd web && npm run typecheck`  
Expected: PASS  

Optional: `cd web && npm run lint` if configured.

Manual checklist:

| Check | Expected |
| --- | --- |
| Hero headline + subcopy | Fully readable; no hub glow through text |
| Constellation | Hub in lower band; labels clear of h1; not stretched |
| ActivityStrip gauge | Label + arc centered/concentric |
| Capabilities Skills | Includes Project-first coding |
| Capabilities Platform | Includes multi-agent, load protection, Ollama setup, artifacts, tools toggle, activity strip, doc quality |
| Features / Enhance | New cards/points present |
| Compare | Three new rows; horizontal scroll still works on small screens |

- [ ] **Step 4: Commit only if the user asked**

```bash
git add web/components/home/comparison.data.ts web/components/home/Insights.tsx
git commit -m "$(cat <<'EOF'
feat(web): extend comparison matrix for agent and coding axes

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Mist bump + hero scrim / z-index | Task 1 |
| Hub below subcopy; meet fit; labels clear | Task 2 |
| ActivityStrip concentric gauge | Task 3 |
| Capabilities / Features / Enhance refresh | Task 4 |
| Comparison rows + Insights contrast | Task 5 |
| No Electron / download redesign / invented tools | Global constraints |
| Phase 1 multi-agent only | Task 4 copy |

## Placeholder scan

No TBD / “implement later” / “similar to Task N” steps. Concrete coords, CSS, and data objects included.
