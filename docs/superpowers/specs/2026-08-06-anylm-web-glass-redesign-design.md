# AnyLM web — glass / constellation redesign

**Date:** 2026-08-06  
**Status:** Approved — implementing  
**Scope:** Full marketing site under `web/` (`/`, `/download`, `/releases`)

## Goal

Restyle the AnyLM marketing and download site to match the provided dark glassmorphism / nebula / constellation reference aesthetic, while expanding homepage content with product-accurate sections: insights, comparison vs peer desktop apps, how AnyLM enhances local models, and a full skills / tools / features catalog. Download and releases remain functional against GitHub Releases data.

## Decisions (approved)

| Decision | Choice |
| --- | --- |
| Scope | Full site (home + download + releases) |
| Monster scroll | Remove from homepage path; replace with constellation / network visuals |
| Content depth | Expand homepage with new AnyLM-native sections; download/releases stay functional |
| Visual approach | Faithful glass clone (pill nav, nebula, bento insights, glass cards) |
| Product name | Keep **AnyLM** |

## Visual system

- **Palette:** Near-black void (`--color-void` / soft variants), mint/teal accent (`--color-slime`), mist text. Soft radial nebula glows (green/gray, low opacity). No purple theme.
- **Surfaces:** Frosted glass — `backdrop-filter: blur`, semi-transparent fills, 1px low-opacity white borders, large corner radii.
- **Typography:** Expressive display face for hero / major section titles via `next/font`; keep a clean sans for body/UI. Avoid default “Inter-only” feel for headlines.
- **Motion:** Subtle nebula drift, constellation node pulses, hover lifts on glass cards; respect `prefers-reduced-motion` (static constellation, no decorative loops).
- **Primitives:** Shared glass card, pill button (ghost + solid), pill nav, section eyebrow/badge. Prefer SVG icons over emoji glyphs.

## Architecture

- Stay on **Next.js 15 App Router + Tailwind v4 + framer-motion**.
- No new backend. Releases still from GitHub API (`lib/github.ts`, 5‑minute revalidate).
- Charts / gauges: CSS + SVG (no Recharts/Chart.js unless a later pass needs it).
- Illustrative insight metrics are **marketing**, not live telemetry — label or tone accordingly.
- Remove homepage dependency on `MonsterScroll` / monster components; delete unused monster files if nothing else imports them.

### Shared chrome

- **Nav:** Floating centered pill (glass). Logo · Features · Capabilities · Compare · Download · Releases · GitHub · primary CTA **Download**.
- **Footer:** Quiet — Download, Releases, Source, copyright, GitHub icon treatment.

## Homepage structure

1. **Hero**
   - Badge: local-first / nothing leaves your machine.
   - Headline: **One endpoint for every local model.** (secondary line optional: “Zero duplication.”)
   - Subcopy: router pools installed models behind one OpenAI-compatible endpoint.
   - CTAs: **Download** (primary solid) · **Discover more** → `#insights` (ghost).
   - Backdrop: nebula + SVG constellation; labeled nodes (e.g. Ollama models, editor, scripts → center `AnyLM :3227`).
   - Trust / “Works with” row: OpenAI SDK, Ollama, common editors — not fake DeFi partner logos.

2. **Insights bento** (`#insights`)
   - Glass widgets: resident runtime, zero cloud round-trips (positioning), model-pool bar viz, projects + RAG card, governance peek.
   - Numbers are illustrative.

3. **Pool / activity strip**
   - Floating routed-request chips + circular gauge (“single endpoint”) + feature pills (Local-only, OpenAI-compatible, Signed builds, Policy-ready).

4. **Comparison** (`#compare`)
   - Peers: **LM Studio**, **Ollama**, **Jan**, **GPT4All**.
   - Axes: Desktop app · OpenAI-compatible API · Model pooling / shared resident runtime · Projects + local RAG · Org governance / usage · Background always-on router · Works with models already installed.
   - Tone: honest; AnyLM often *alongside* Ollama. Highlight AnyLM column. Footnote: public product positioning; features change.
   - Responsive: horizontal scroll with sticky first column on small screens.

5. **Enhance local models** (`#enhance`)
   - Narrative + proof points:
     - Tool calling on local Ollama models
     - Skills = instructions + tool bundles
     - Project RAG (chunk / embed / retrieve)
     - Shared `:3227` router — one resident runtime for apps/scripts
     - Optional connectors so the model can act (calendar/mail), with confirm on risky actions

6. **Skills, tools & features catalog** (`#capabilities`)
   - Tabbed or filterable glass panels:
     - **Skills:** Web research; Google Calendar; Outlook; custom skills
     - **Tools:**  
       - Filesystem: `read_file`, `list_directory`, `write_file`, `create_directory`, `move_path`, `copy_path`, `delete_path`, `find_files`  
       - Web: `web_search`, `http_fetch`  
       - System: `get_time`, `open_app_or_url`, `run_shell`  
       - UX: `ask_user`  
       - Docs: `generate_document` (pdf / docx / pptx / md)  
       - Connectors: `gcal_list_events`, `gcal_create_event`, `outlook_list_events`, `outlook_create_event`, `outlook_list_mail`, `outlook_send_mail`
     - **Platform:** local proxy, model pooling, streaming chat, projects/RAG, governance, auto-updates, signed CI builds
   - Data lives in typed constants under `web/components/home/` (e.g. `capabilities.data.ts`) so copy stays easy to update.

7. **Features grid**
   - Existing six platform highlights, restyled as glass cards with SVG glyphs.

8. **Code sample**
   - Existing OpenAI drop-in snippet (`localhost:3227/v1`), glass panel.

9. **Footer**

## Download (`/download`)

- Glass page header: version, date, signed-build note, prerelease badge.
- Platform cards as frosted panels; accent the detected OS.
- Release notes in glass block; keep links to `/releases` and GitHub.
- Light nebula wash only; **no** fake metrics — assets remain real.

## Releases (`/releases`)

- Same intro meaning; glass `ReleaseCard` rows (version, date, latest pill, assets, notes).
- Empty state: dashed glass + tag guidance.

## Out of scope

- Live telemetry / real usage charts
- Renaming product away from AnyLM
- Auth-backend or Electron app UI changes
- Adding chart libraries unless SVG/CSS proves insufficient
- Fabricating competitor claims beyond the agreed comparison axes

## Accessibility & quality

- Contrast ≥ 4.5:1 for body text on glass
- Visible focus rings on interactive elements
- `prefers-reduced-motion` disables decorative loops
- Keyboard-reachable tabs in the capabilities catalog
- Mobile: no horizontal page scroll except intentional comparison table

## Success criteria

- First viewport reads as the reference aesthetic (pill nav, nebula, constellation, dual CTAs) with AnyLM branding and content.
- Homepage includes comparison, enhance-local-models, and full skills/tools/features catalog grounded in `app/src/main/skills` and `app/src/main/tools`.
- `/download` and `/releases` still resolve GitHub assets correctly.
- Lint + typecheck pass for `web/`.

## Implementation notes (for planning)

- Evolve `globals.css` tokens; add glass utility classes.
- Rebuild `Nav`, `Footer`, `Hero`; add `Insights`, `ActivityStrip`, `Comparison`, `EnhanceModels`, `Capabilities`.
- Restyle `Features`, `CodeSample`, download/release components.
- Drop `MonsterScroll` from `app/page.tsx`; clean up dead monster imports.
- Prefer CSS/SVG over new dependencies.
