# Document Research + Content Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop stub PDFs by requiring research-then-write prompts, rejecting thin markdown before file write, and polishing PDF CSS.

**Architecture:** Pure `assessDocumentContent` gates `documents.generate` for pdf/docx/md. Document-intent `promptBlock` and the `generate_document` tool description push `web_search` → `http_fetch` → dense markdown. PDF look is CSS-only in `pdf.ts`. No new agent pipeline.

**Tech Stack:** Electron main TypeScript, Bun tests (`bun:test`), existing documents + tools registries.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-document-research-quality-design.md`
- Guard formats: `pdf`, `docx`, `md` only; skip `pptx`, `xlsx`
- Thin reject before `dest.reserve` / write / `onFile`
- Research order in prompts: `web_search` → `http_fetch` → `generate_document`
- Offline soft-fail: still require dense content
- PDF: CSS-only; no new PDF libraries
- No forced document-research pipeline; no auto-enable Web research skill / Tools toggle
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged

## File map

| File | Responsibility |
|------|----------------|
| `app/src/main/documents/content-quality.ts` | Pure thin-content assess + reject error message |
| `app/src/main/documents/content-quality.test.ts` | Unit tests (skeleton vs filled guide) |
| `app/src/main/documents/index.ts` | Call assess before write for guarded formats |
| `app/src/main/documents/intent.ts` | Research-then-write + density in `promptBlock` |
| `app/src/main/documents/intent.test.ts` | Assert research + density language |
| `app/src/main/tools/registry.ts` | Stronger `generate_document` description |
| `app/src/main/documents/pdf.ts` | Polished print CSS |

Paths below are relative to `app/` unless noted.

---

### Task 1: Thin-content assess helper

**Files:**
- Create: `src/main/documents/content-quality.ts`
- Create: `src/main/documents/content-quality.test.ts`

**Interfaces:**
- Produces:
  - `assessDocumentContent(markdown: string): { ok: true } | { ok: false; reason: string }`
  - `THIN_CONTENT_ERROR: string` — model-facing retry instructions (include `web_search` / `http_fetch` / `generate_document`)
- Thresholds (lock in code + tests):
  - Body char budget: non-heading, non-whitespace characters must be ≥ `400`
  - Empty sections: ≥ `2` headings whose following block (until next heading or EOF) has no non-blank non-heading line
  - Step stubs: if ≥ `3` list/numbered lines match `/^\s*(?:[-*+]|\d+\.)\s+Step\s+\d+/i` (or similar short title-only steps) **and** body char budget &lt; `800`, reject

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/documents/content-quality.test.ts
import { describe, expect, test } from "bun:test";
import { assessDocumentContent, THIN_CONTENT_ERROR } from "./content-quality";

const METASPLOIT_SKELETON = `# Introduction

# Installing Metasploit
1. Step 1: Download and install Metasploit
2. Step 2: Configure Metasploit settings

# Using Metasploit
## Scanning targets
1. Step 1: Choose a scanning technique
2. Step 2: Run the scan

# Exploiting vulnerabilities
## Finding exploitable vulnerabilities
1. Step 1: Use the search feature to find exploits
2. Step 2: Select an exploit and configure settings
`;

const SOLID_GUIDE = `# Introduction

Metasploit is an open-source penetration testing framework used to discover,
validate, and demonstrate security weaknesses in a controlled lab. This guide
walks through install, scanning, and exploiting a vulnerable target ethically.

# Installing Metasploit

On Kali Linux, Metasploit Framework is often preinstalled. Elsewhere, install
via the official Rapid7 installer or your package manager, then verify with:

\`\`\`
msfconsole -v
\`\`\`

After install, start the console and wait until the prompt is ready. Update
modules periodically so search results stay current.

# Using Metasploit

## Scanning targets

Choose a technique based on scope. For a single host on a lab network:

\`\`\`
db_nmap -sV 192.168.56.101
\`\`\`

Review open ports and service versions. Prefer non-destructive scans first.

# Exploiting vulnerabilities

## Finding exploitable vulnerabilities

Search the module database for the service and version you found, for example:

\`\`\`
search type:exploit platform:linux name:apache
\`\`\`

Select a module with \`use\`, set \`RHOSTS\` / \`LHOST\`, choose a payload, then
run \`check\` before \`exploit\` in authorized labs only.
`;

describe("assessDocumentContent", () => {
  test("rejects Metasploit-style skeleton outline", () => {
    const r = assessDocumentContent(METASPLOIT_SKELETON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(10);
  });

  test("accepts multi-paragraph guide with commands", () => {
    expect(assessDocumentContent(SOLID_GUIDE)).toEqual({ ok: true });
  });

  test("rejects short blurb", () => {
    const r = assessDocumentContent("# Hi\n\nToo short.");
    expect(r.ok).toBe(false);
  });

  test("rejects two empty headings", () => {
    const r = assessDocumentContent("# A\n\n# B\n\n# C\n\nSome filler text that is still mostly empty sections above.");
    expect(r.ok).toBe(false);
  });

  test("THIN_CONTENT_ERROR mentions retry and research tools", () => {
    expect(THIN_CONTENT_ERROR).toMatch(/generate_document/);
    expect(THIN_CONTENT_ERROR).toMatch(/web_search/);
    expect(THIN_CONTENT_ERROR).toMatch(/http_fetch/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && bun test src/main/documents/content-quality.test.ts`

Expected: FAIL (module missing or exports missing)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/main/documents/content-quality.ts
const MIN_BODY_CHARS = 400;
const STEP_STUB_BODY_CHARS = 800;

export const THIN_CONTENT_ERROR =
  "content too thin — each heading needs real paragraphs/details; " +
  "research with web_search/http_fetch if needed, then call generate_document " +
  "again with full markdown (no empty sections or step titles alone).";

function isHeading(line: string): boolean {
  return /^#{1,6}\s+\S/.test(line);
}

function isStepStubLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+\.)\s+Step\s+\d+\s*:/i.test(line);
}

function bodyCharCount(markdown: string): number {
  let n = 0;
  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (isHeading(line)) continue;
    n += line.replace(/\s+/g, "").length;
  }
  return n;
}

function emptyHeadingCount(markdown: string): number {
  const lines = String(markdown || "").split(/\r?\n/);
  let empty = 0;
  let i = 0;
  while (i < lines.length) {
    if (!isHeading(lines[i])) {
      i++;
      continue;
    }
    i++;
    let hasBody = false;
    while (i < lines.length && !isHeading(lines[i])) {
      if (lines[i].trim()) hasBody = true;
      i++;
    }
    if (!hasBody) empty++;
  }
  return empty;
}

function stepStubCount(markdown: string): number {
  let n = 0;
  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (isStepStubLine(line)) n++;
  }
  return n;
}

export function assessDocumentContent(
  markdown: string
): { ok: true } | { ok: false; reason: string } {
  const body = bodyCharCount(markdown);
  if (body < MIN_BODY_CHARS) {
    return { ok: false, reason: `body too short (${body} chars; need ≥${MIN_BODY_CHARS})` };
  }
  const empty = emptyHeadingCount(markdown);
  if (empty >= 2) {
    return { ok: false, reason: `${empty} headings have no body content` };
  }
  const stubs = stepStubCount(markdown);
  if (stubs >= 3 && body < STEP_STUB_BODY_CHARS) {
    return { ok: false, reason: "too many step titles without explanatory prose" };
  }
  return { ok: true };
}
```

Tune logic if a test fails for the wrong reason (e.g. empty-heading test may need more empty headings and less body — adjust the fixture so empty headings ≥ 2 and the failure is clearly that rule, or keep body ≥ 400 while still having ≥ 2 empty headings). Prefer adjusting fixtures/thresholds so Metasploit skeleton fails and `SOLID_GUIDE` passes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/documents/content-quality.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/documents/content-quality.ts app/src/main/documents/content-quality.test.ts
git commit -m "feat(documents): assess thin markdown before generate"
```

---

### Task 2: Wire guard into `documents.generate`

**Files:**
- Modify: `src/main/documents/index.ts`
- Create: `src/main/documents/index.test.ts` (optional but preferred — pure throw path)

**Interfaces:**
- Consumes: `assessDocumentContent`, `THIN_CONTENT_ERROR` from `./content-quality`
- Behavior: if `fmt` is `pdf` | `docx` | `md` and assess is not ok, `throw new Error(THIN_CONTENT_ERROR)` **before** `dest.reserve`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/documents/index.test.ts
import { describe, expect, test } from "bun:test";
import { generate } from "./index";
import { THIN_CONTENT_ERROR } from "./content-quality";

describe("generate thin guard", () => {
  test("rejects thin pdf content without writing", async () => {
    await expect(
      generate(null, {
        format: "pdf",
        title: "Metasploit Guide",
        content: "# Introduction\n\n# Installing\n1. Step 1: Download\n2. Step 2: Configure\n",
      })
    ).rejects.toThrow(THIN_CONTENT_ERROR);
  });

  test("skips thin guard for pptx", async () => {
    // pptx still needs a writable dest; if generate hits Electron/pptx deps in unit tests,
    // instead unit-test only that assess is not imported for pptx by extracting a
    // shouldAssessContent(fmt) helper — preferred if full generate is heavy:
  });
});
```

If full `generate(null, …)` is hard in unit tests (Electron `BrowserWindow` / dest paths), add and test a small exported helper instead:

```typescript
// in content-quality.ts or index.ts
export function shouldAssessDocumentContent(format: string): boolean {
  return format === "pdf" || format === "docx" || format === "md";
}
```

Then keep the generate wiring simple and cover throw with a focused test that mocks `dest` **or** only tests `shouldAssessDocumentContent` + that `index.ts` calls assess when that returns true (manual review OK if mocking is painful). Prefer: throw path tested by exporting `assertDocumentContentOrThrow(fmt, text)` used by `generate`:

```typescript
export function assertDocumentContentOrThrow(format: string, content: string): void {
  if (!shouldAssessDocumentContent(format)) return;
  const r = assessDocumentContent(content);
  if (!r.ok) throw new Error(THIN_CONTENT_ERROR);
}
```

Test `assertDocumentContentOrThrow` in `content-quality.test.ts` or `index.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/documents/index.test.ts src/main/documents/content-quality.test.ts`

Expected: FAIL until wired

- [ ] **Step 3: Wire `index.ts`**

```typescript
import { assertDocumentContentOrThrow } from "./content-quality";
// or inline assess + shouldAssess

async function generate(...) {
  const fmt = ...;
  if (!FORMATS.has(fmt)) throw ...;
  const text = String(content || "");
  assertDocumentContentOrThrow(fmt, text); // BEFORE dest.reserve
  const fp = dest.reserve(...);
  // unchanged write path
}
```

Confirm existing `exec.ts` already returns `Error: ${e.message}` so the model sees `THIN_CONTENT_ERROR`.

- [ ] **Step 4: Run tests**

Run: `cd app && bun test src/main/documents/`

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/documents/index.ts app/src/main/documents/index.test.ts app/src/main/documents/content-quality.ts
git commit -m "feat(documents): reject thin content before writing files"
```

---

### Task 3: Research-then-write intent prompt

**Files:**
- Modify: `src/main/documents/intent.ts`
- Modify: `src/main/documents/intent.test.ts`

**Interfaces:**
- Produces: updated `promptBlock(format: string): string` (same signature)

- [ ] **Step 1: Extend failing tests**

```typescript
// append to intent.test.ts
test("prompt requires research then dense generate_document content", () => {
  const block = promptBlock("pdf");
  expect(block).toContain("web_search");
  expect(block).toContain("http_fetch");
  expect(block).toContain("generate_document");
  expect(block.toLowerCase()).toMatch(/paragraph|dense|complete|substantive|empty/);
  expect(block.toLowerCase()).toMatch(/declin|denied|fail|error/);
});
```

Keep the existing decline/deny test.

- [ ] **Step 2: Run to verify fail**

Run: `cd app && bun test src/main/documents/intent.test.ts`

Expected: FAIL on new assertions

- [ ] **Step 3: Update `promptBlock`**

Replace the body so it still covers format-specific xlsx/pptx hints and decline/deny rules, and adds research + density. Example shape:

```typescript
function promptBlock(format: string): string {
  return (
    `The user is asking for a ${format.toUpperCase()} file. ` +
    `When the topic needs current or researched facts, call web_search, then http_fetch on 1–2 solid URLs, ` +
    `then call generate_document with format "${format}", a short title, and full markdown content. ` +
    `Every heading must have real paragraphs or detailed steps (commands/examples where relevant) — ` +
    `no empty sections and no outline of step titles alone. ` +
    `If search or fetch fails, say so briefly and still write dense content from your best knowledge. ` +
    `Write the complete content in the tool call — do not repeat it in your reply. ` +
    (format === "xlsx"
      ? "For xlsx, format the content as a markdown table with a header row. "
      : format === "pptx"
      ? "For pptx, start each slide with a '#' or '##' heading. "
      : "") +
    "Only tell the user the file is ready if the tool result confirms it was created. " +
    "If the tool says the user declined, denied, or returned an error, say so clearly " +
    "and do not claim the file exists."
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd app && bun test src/main/documents/intent.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/documents/intent.ts app/src/main/documents/intent.test.ts
git commit -m "feat(documents): require research-then-write in intent prompt"
```

---

### Task 4: Strengthen `generate_document` tool description

**Files:**
- Modify: `src/main/tools/registry.ts` (`generate_document` builtin description)

- [ ] **Step 1: Update description string**

Keep existing “ONLY call when user explicitly asks…” rules. Append research + density, e.g.:

```typescript
description:
  "Create a document file (pdf, docx, pptx, or md) in the current project's folder. " +
  "ONLY call this when the user's latest message explicitly asks for a document, PDF, Word file, " +
  "presentation, or similar file. NEVER call it unprompted or as a side effect of answering. " +
  "When the user asked you to research or use current online info, call web_search and http_fetch " +
  "before this tool. Content is markdown with substantive sections (paragraphs under headings — " +
  "not an empty outline); for pptx each '#' or '##' heading starts a new slide.",
```

- [ ] **Step 2: Smoke-check registry still loads**

Run: `cd app && bun test src/main/documents/`

Optional: if a tools registry test exists that snapshots descriptions, update it. Otherwise no new test required for copy-only change.

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add app/src/main/tools/registry.ts
git commit -m "feat(tools): document research and density in generate_document"
```

---

### Task 5: PDF CSS polish

**Files:**
- Modify: `src/main/documents/pdf.ts`

- [ ] **Step 1: Replace stylesheet inside `document()`**

Use CSS that stays professional (no marketing template). Concrete target:

```typescript
function document(title: unknown, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body {
      font: 14px/1.65 -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #1a1a1a;
      margin: 56px 64px;
      max-width: 720px;
    }
    h1 { font-size: 22px; font-weight: 700; margin: 1.6em 0 0.5em; line-height: 1.25; }
    h2 { font-size: 17px; font-weight: 650; margin: 1.4em 0 0.45em; line-height: 1.3; }
    h3 { font-size: 14px; font-weight: 650; margin: 1.2em 0 0.4em; line-height: 1.35; }
    p { margin: 0.55em 0; }
    ul, ol { margin: 0.5em 0 0.5em 1.25em; padding: 0; }
    li { margin: 0.25em 0; }
    pre {
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      padding: 12px 14px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 0.75em 0;
    }
    code { font: 12.5px/1.5 ui-monospace, Menlo, monospace; }
    pre code { font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    .doc-title { font-size: 26px; font-weight: 750; margin: 0 0 6px; line-height: 1.2; }
    .doc-meta { color: #6b7280; font-size: 11.5px; margin-bottom: 28px; letter-spacing: 0.01em; }
  </style></head><body>
    <div class="doc-title">${escapeHtml(title || "Document")}</div>
    <div class="doc-meta">AnyLM · ${new Date().toLocaleString()}</div>
    ${bodyHtml}
  </body></html>`;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && bun run typecheck`

Expected: PASS (or no new errors in documents)

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add app/src/main/documents/pdf.ts
git commit -m "style(documents): polish PDF typography and code blocks"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Run document-related unit tests**

Run: `cd app && bun test src/main/documents/`

Expected: all PASS

- [ ] **Step 2: Manual smoke (optional if Electron available)**

1. Tools on → ask for a researched how-to PDF (e.g. Metasploit guide).
2. Confirm activity shows search/fetch before generate when the model cooperates.
3. If the model submits a skeleton, tool result is thin-content error and no file card.
4. After a dense retry, PDF opens with clearer headings/code styling.

- [ ] **Step 3: Spec coverage self-check**

| Spec requirement | Task |
|------------------|------|
| Research order in intent prompt | Task 3 |
| Dense content instructions | Task 3 |
| Tool description research + density | Task 4 |
| `assessDocumentContent` + thresholds | Task 1 |
| Guard pdf/docx/md before write | Task 2 |
| Skip pptx/xlsx | Task 2 |
| `THIN_CONTENT_ERROR` retry copy | Task 1–2 |
| PDF CSS polish | Task 5 |
| Unit tests skeleton vs solid | Task 1 |

---

## Spec coverage (self-review)

- Research prompts: Task 3–4  
- Thin guard + formats: Task 1–2  
- PDF polish: Task 5  
- Tests: Task 1–2–3–6  
- Non-goals respected: no pipeline, no skill auto-enable, no DOCX redesign  

## Placeholder scan

No TBD/TODO; thresholds and error string specified in Task 1.
