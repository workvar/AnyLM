# Document research + content quality

**Date:** 2026-08-08  
**Status:** Approved (design)  
**Approach:** Prompt guidance + execute-time thin-content reject + PDF CSS polish (approach 1)  
**Surfaces:** `app/src/main/documents/` (intent, new content-quality helper, generate entry, pdf), `app/src/main/tools/registry.ts` (`generate_document` description), existing tool exec / agent loop (no loop changes)

## Problem

When users ask small local models (e.g. Llama with tools) to “search online and create a how-to PDF,” AnyLM often produces a stub: empty headings, bare “Step N” lines, no commands or body text. The PDF renderer faithfully prints that markdown. Causes:

1. Document-intent prompt pushes `generate_document` immediately without requiring research → synthesis.
2. `web_search` snippets alone are not enough; models skip `http_fetch` and invent outlines.
3. No gate rejects thin `content` before writing a file.
4. PDF CSS is intentionally minimal, so even mediocre content looks bare.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Scope | Prompt + tool copy, thin-content guard, PDF CSS only |
| Architecture | No new multi-step pipeline (not project-coding-style) |
| Research order | `web_search` → `http_fetch` (1–2 pages) → `generate_document` |
| Offline | Soft-fail: admit search failed; still write dense content from knowledge |
| Thin guard | Pure assess helper; throw before write; error string back to model for retry |
| Formats guarded | `pdf`, `docx`, `md` |
| Formats skipped | `pptx` (short slides), `xlsx` (tables) |
| Confirm UX | Unchanged: risky confirm still runs; thin reject happens after allow, before file write |
| PDF polish | CSS-only in `pdf.ts`; no new dependencies or marketing templates |

## Goals

1. Document-intent system prompt requires research-then-write and dense markdown (no empty sections).
2. `generate_document` tool description reinforces the same expectations.
3. Thin markdown never becomes a project file; model gets an actionable error and can retry in the same agent loop.
4. Generated PDFs look clearer (hierarchy, spacing, code blocks) without changing the markdown pipeline.

## Non-goals

- Forced document-research pipeline in main (separate from chat agent loop).
- Auto-enabling the Web research skill or Tools toggle.
- Post-write model rewrite / second-pass thickening.
- Redesigning DOCX / PPTX / XLSX renderers.
- Guaranteeing perfect guides on every model size (guard + prompts reduce stubs; capability still varies).

---

## 1. Research + write prompts

### Intent `promptBlock(format)`

When document intent is detected, the system block must instruct the model to:

1. Call `web_search` for the topic (when online/current facts matter).
2. Call `http_fetch` on 1–2 solid result URLs.
3. Only then call `generate_document` with `format`, a short `title`, and **complete** markdown `content`.
4. Put real body under every heading (paragraphs; concrete steps/commands where relevant). Do not emit empty sections or step titles alone.
5. If search/fetch fails or is offline: say so briefly in content or reply as appropriate, and still write dense content from best knowledge.
6. Keep existing rules: do not paste the full document in the chat reply; only claim the file exists if the tool result confirms creation; surface decline/deny/errors clearly.

### Tool registry

Extend `generate_document` description to state:

- Prefer research (`web_search` / `http_fetch`) before generating when the user asked for researched or current material.
- `content` must be full markdown with substantive sections (not an outline of empty headings).

---

## 2. Thin-content guard

### Module

Add `app/src/main/documents/content-quality.ts` exporting something like:

- `assessDocumentContent(markdown: string): { ok: true } | { ok: false; reason: string }`

Used by `documents.generate` **before** reserving/writing the file when format is `pdf` | `docx` | `md`.

### Thin criteria (any → reject)

1. **Too short:** fewer than ~400 characters of non-whitespace body after stripping markdown heading markers (`#` lines counted separately / excluded from body budget as appropriate).
2. **Empty sections:** two or more headings that are followed only by blank lines or another heading (no paragraph/list/code body).
3. **Step stubs:** body is mostly numbered/bulleted lines that look like titles only (e.g. `Step 1: …` with no explanatory sentences elsewhere), with insufficient prose overall.

Exact thresholds live in the helper and are covered by unit tests (including a Metasploit-style skeleton = thin; a multi-paragraph guide with commands = ok).

### Execution behavior

- On reject: throw / return error **before** `dest.reserve` write and **before** `onFile`.
- Tool result string (via existing `Error: …` path in exec) must tell the model to expand content and re-call `generate_document`, mentioning research tools when useful.
- User confirmation for the risky tool still happens first; a thin payload after Allow does not create a file.

---

## 3. PDF polish

Update the inline stylesheet in `pdf.ts` `document()`:

- Stronger H1/H2/H3 size/weight and vertical rhythm.
- Comfortable body line-height; keep generous page margins.
- Clearer `pre` / `code` backgrounds and padding.
- Slightly clearer `.doc-meta` without turning the page into a designed marketing template.

Still markdown → `mdToHtml` → Chromium `printToPDF`. No new PDF libraries.

---

## 4. Tests

| Area | Coverage |
|------|----------|
| `content-quality` | Skeleton outline = thin; filled guide = ok; edge cases for headings-only and short blurbs |
| `intent` | Prompt mentions search/fetch (or research order) and dense/complete content; keep decline/deny assertions |
| Optional | `generate` rejects thin content without writing (if easy to unit-test with mocked dest) |

---

## 5. Error handling

| Case | Behavior |
|------|----------|
| Thin content | No file; model-facing error with retry instructions |
| Search/fetch failure | Model continues with knowledge; content still must pass thin guard |
| User denies confirm | Unchanged existing path |
| Unsupported format | Unchanged |

---

## 6. Out of scope follow-ups

- Soft auto-nudge Web research skill when document + “search online” co-occur.
- Shared visual theme across DOCX/PDF.
- Content scoring beyond the heuristic guard (LLM-as-judge).

## Success criteria

1. Document-intent prompt and tool description encode research-then-write + density.
2. Metasploit-style empty outline fails `assessDocumentContent` and never writes a PDF.
3. A substantial markdown guide still generates successfully.
4. PDF CSS changes are visible in hierarchy/code blocks without new dependencies.
5. Unit tests cover assess + updated intent expectations.
