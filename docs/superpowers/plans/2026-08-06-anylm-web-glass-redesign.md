# AnyLM Web Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the full `web/` marketing site to the approved glass/nebula/constellation look and add comparison, enhance-local-models, and skills/tools/features catalog sections.

**Architecture:** Evolve Tailwind tokens + shared glass utilities; rebuild Nav/Footer/Hero; add homepage sections as focused components with typed data files; restyle download/releases; remove monster scroll from the home path.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, framer-motion, `next/font` (display + sans). CSS/SVG for charts — no new chart library.

**Spec:** `docs/superpowers/specs/2026-08-06-anylm-web-glass-redesign-design.md`

## Global Constraints

- Product name remains **AnyLM**
- Keep GitHub Releases wiring unchanged
- Illustrative metrics only (not live telemetry)
- Respect `prefers-reduced-motion`
- No purple theme; mint/teal on near-black
- Prefer SVG icons over emoji
- Do not commit unless the user asks

## File map

| File | Role |
| --- | --- |
| `web/app/globals.css` | Tokens, glass utilities, nebula helpers, motion |
| `web/app/layout.tsx` | Fonts, body classes |
| `web/components/site/Nav.tsx` | Pill glass nav |
| `web/components/site/Footer.tsx` | Quiet glass footer |
| `web/components/home/Hero.tsx` | Constellation hero |
| `web/components/home/Constellation.tsx` | SVG network backdrop |
| `web/components/home/Insights.tsx` | Bento metrics |
| `web/components/home/ActivityStrip.tsx` | Routed chips + gauge |
| `web/components/home/Comparison.tsx` | Peer comparison table |
| `web/components/home/EnhanceModels.tsx` | How AnyLM enhances local models |
| `web/components/home/Capabilities.tsx` | Tabbed skills/tools/features |
| `web/components/home/capabilities.data.ts` | Catalog data |
| `web/components/home/comparison.data.ts` | Comparison matrix |
| `web/components/home/Features.tsx` / `CodeSample.tsx` | Glass restyle |
| `web/app/page.tsx` | Compose new sections; drop MonsterScroll |
| `web/app/download/page.tsx`, `releases/page.tsx`, download/release components | Glass restyle |
| Monster components | Delete if unused |

---

### Task 1: Design system + chrome

- [x] Update `globals.css` tokens and `.glass` / `.nebula` utilities
- [x] Wire display + body fonts in `layout.tsx`
- [x] Rebuild pill `Nav` and quiet `Footer`

### Task 2: Hero stack

- [x] Add `Constellation.tsx`
- [x] Rebuild `Hero` with dual CTAs + works-with row
- [x] Add `Insights` + `ActivityStrip`

### Task 3: Content sections

- [x] Add comparison + enhance + capabilities (with data files)
- [x] Restyle `Features` + `CodeSample`
- [x] Wire all sections in `page.tsx`; remove MonsterScroll

### Task 4: Download / releases + cleanup

- [x] Restyle download + releases pages/components
- [x] Remove unused monster files
- [x] Run `npm run typecheck` (and lint if available) in `web/`

### Task 5: Verify

- [x] Confirm homepage anchors (`#insights`, `#compare`, `#enhance`, `#capabilities`, `#features`)
- [x] Confirm download/releases still typecheck against existing release types
