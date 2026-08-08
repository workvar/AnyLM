# Project-First Coding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On coding/scaffolding turns with tools on, auto-ensure a working folder, look up current docs (offline soft-fail), prefer CLI scaffolds + file tools, show activity status while working, and finish with a file/command summary — never a full source dump in chat.

**Architecture:** Pure helpers under `app/src/main/project-coding/` (intent, slug/workspace ensure, docs lookup, prompt, summary/fence-strip). `ipc.ts` gates the single-agent tool loop: when project-coding is active, inject prompts/docs, suppress `chat:chunk` content until the loop ends, collect tool outcomes, and replace the final assistant text with a summary. Reuses existing tools, confirms, and `chat:activity`.

**Tech Stack:** Electron main/renderer TypeScript, Ollama chat/tool loop in `ipc.ts`, Bun tests (`bun:test`), existing `workspace`, `tools/web-search`, `tools/exec`, activity channel.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-project-first-coding-design.md`
- Activate only when coding-intent heuristics match **and** `useTools` is true; ambiguous/non-coding stays on the normal path
- No working folder → auto-create under `~/AnyLM-Projects/<slug>/` (slug max 48 chars) and `workspace.set`
- Docs: always attempt `web_search`; soft-fail offline with a summary note
- Prefer official CLIs via `run_shell`, then `write_file` / `create_directory`
- Final reply: summary only; strip fenced code blocks **>20 lines or >500 characters**
- No RAM-kill / load-protection work in this plan
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Prefer pure, testable modules; keep `ipc.ts` wiring thin

## File map

| File | Responsibility |
|------|----------------|
| `app/src/main/project-coding/intent.ts` | Heuristics: is this turn project-coding? |
| `app/src/main/project-coding/intent.test.ts` | Intent positive/negative/ambiguous cases |
| `app/src/main/project-coding/slug.ts` | Sanitize project folder slug from user text |
| `app/src/main/project-coding/slug.test.ts` | Slug sanitization + length |
| `app/src/main/project-coding/ensure.ts` | Pure auto-create path + ensureWorkspaceForCoding |
| `app/src/main/project-coding/ensure.test.ts` | Ensure/collision tests with injectable fs |
| `app/src/main/project-coding/summary.ts` | Build summary from tool outcomes; strip large fences |
| `app/src/main/project-coding/summary.test.ts` | Summary + fence-strip tests |
| `app/src/main/project-coding/prompt.ts` | Project-first system prompt block |
| `app/src/main/project-coding/prompt.test.ts` | Assert prompt rules |
| `app/src/main/project-coding/docs.ts` | Explicit docs lookup via web_search; offline soft-fail |
| `app/src/main/project-coding/docs.test.ts` | Docs helper with mocked search |
| `app/src/main/workspace.ts` | Thin `ensureAutoProject` wrapping ensure helper |
| `app/src/main/ipc.ts` | Gate + project-coding path wiring in `chat:start` |
| `app/preload.ts` + `api.d.ts` | `onWorkspaceChanged` event |
| `app/src/renderer/js/workspace.ts` | Refresh chip when workspace auto-created |

Paths below for `app/` sources are relative to `app/` unless noted.

---

### Task 1: Coding intent heuristics

**Files:**
- Create: `src/main/project-coding/intent.ts`
- Create: `src/main/project-coding/intent.test.ts`

**Interfaces:**
- Produces: `isProjectCodingIntent(text: string): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/project-coding/intent.test.ts
import { describe, expect, test } from "bun:test";
import { isProjectCodingIntent } from "./intent";

describe("isProjectCodingIntent", () => {
  test("create react app", () => {
    expect(isProjectCodingIntent("Create a React student list app in a new project")).toBe(true);
  });
  test("scaffold vite", () => {
    expect(isProjectCodingIntent("Scaffold a Vite TypeScript project")).toBe(true);
  });
  test("write component into project", () => {
    expect(isProjectCodingIntent("Write a LoginForm component into the project")).toBe(true);
  });
  test("pure Q&A stays false", () => {
    expect(isProjectCodingIntent("What is the difference between let and const?")).toBe(false);
  });
  test("explain how without creating files", () => {
    expect(isProjectCodingIntent("Explain how React hooks work")).toBe(false);
  });
  test("show example snippet without project ask", () => {
    expect(isProjectCodingIntent("Show me a small example snippet of a for loop")).toBe(false);
  });
  test("empty", () => {
    expect(isProjectCodingIntent("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && bun test src/main/project-coding/intent.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Minimal implementation**

```typescript
// src/main/project-coding/intent.ts
const NOT =
  /\b(what is|what's|how (do|does|can) (i|you)|explain|difference between|why (is|are|do)|tell me about)\b/i;

const SNIPPET_ONLY =
  /\b(show me (a |an )?(small |quick )?(example|snippet)|example snippet|code example)\b/i;

const CREATE =
  /\b(create|scaffold|init|initialize|set up|setup|bootstrap|generate|build)\b/i;

const PROJECT_NOUN =
  /\b(project|app|application|repo|repository|codebase|folder|directory|workspace)\b/i;

const WRITE_CODE =
  /\b(write|add|implement|create|edit|update|fix)\b[\s\S]{0,40}\b(file|component|module|class|function|page|route|endpoint|script|test)\b/i;

const LANG_APP =
  /\b(react|vue|svelte|next\.?js|nuxt|angular|vite|node|express|django|flask|fastapi|rails|laravel|spring|cargo|rust|go|golang|python|typescript|javascript|java|kotlin|swift)\b/i;

export function isProjectCodingIntent(text: string): boolean {
  const s = String(text || "").trim();
  if (!s) return false;
  if (NOT.test(s) && !CREATE.test(s) && !WRITE_CODE.test(s)) return false;
  if (SNIPPET_ONLY.test(s) && !PROJECT_NOUN.test(s) && !WRITE_CODE.test(s)) return false;
  if (CREATE.test(s) && (PROJECT_NOUN.test(s) || LANG_APP.test(s))) return true;
  if (WRITE_CODE.test(s)) return true;
  if (/\b(in the project|working folder|working directory)\b/i.test(s) && LANG_APP.test(s)) return true;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/project-coding/intent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/project-coding/intent.ts app/src/main/project-coding/intent.test.ts
git commit -m "feat: add project-coding intent heuristics"
```

---

### Task 2: Slug + workspace auto-create

**Files:**
- Create: `src/main/project-coding/slug.ts`
- Create: `src/main/project-coding/slug.test.ts`
- Modify: `src/main/workspace.ts`
- Create: `src/main/workspace.test.ts`

**Interfaces:**
- Consumes: existing `workspace.get` / `workspace.set`
- Produces:
  - `slugFromText(text: string): string` — lowercase alphanumeric+hyphens, max 48, fallback `"project"`
  - `ensureAutoProject(text: string): { root: string; created: boolean }` on workspace module (or thin wrapper in `project-coding/ensure.ts` that calls workspace)

- [ ] **Step 1: Write failing slug tests**

```typescript
// src/main/project-coding/slug.test.ts
import { describe, expect, test } from "bun:test";
import { slugFromText } from "./slug";

describe("slugFromText", () => {
  test("basic words", () => {
    expect(slugFromText("Create a React Student List app")).toBe("create-a-react-student-list-app");
  });
  test("strips junk and collapses hyphens", () => {
    expect(slugFromText("Hello!!! My_App@@@")).toBe("hello-my-app");
  });
  test("truncates to 48", () => {
    const s = slugFromText("a".repeat(80));
    expect(s.length).toBeLessThanOrEqual(48);
  });
  test("empty falls back", () => {
    expect(slugFromText("???")).toBe("project");
  });
});
```

- [ ] **Step 2: Implement slug**

```typescript
// src/main/project-coding/slug.ts
const MAX = 48;

export function slugFromText(text: string): string {
  let s = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX)
    .replace(/-+$/g, "");
  return s || "project";
}
```

- [ ] **Step 3: Write failing ensure tests (pure helper)**

```typescript
// src/main/project-coding/ensure.test.ts
import { describe, expect, test } from "bun:test";
import { ensureWorkspaceForCoding, resolveAutoProjectPath } from "./ensure";

describe("resolveAutoProjectPath", () => {
  test("uses slug when free", () => {
    expect(resolveAutoProjectPath("/home/u", "my-app", () => false)).toBe(
      "/home/u/AnyLM-Projects/my-app"
    );
  });
  test("suffixes on collision", () => {
    const exists = (p: string) => p.endsWith("/my-app");
    expect(resolveAutoProjectPath("/home/u", "my-app", exists)).toBe(
      "/home/u/AnyLM-Projects/my-app-2"
    );
  });
});

describe("ensureWorkspaceForCoding", () => {
  test("returns existing without create", () => {
    const mkdirCalls: string[] = [];
    const r = ensureWorkspaceForCoding({
      get: () => "/existing",
      set: (root) => root,
      home: "/home/u",
      mkdir: (p) => mkdirCalls.push(p),
      exists: () => false,
      text: "Create a React app",
    });
    expect(r).toEqual({ root: "/existing", created: false });
    expect(mkdirCalls).toEqual([]);
  });
  test("creates under AnyLM-Projects when unset", () => {
    let current: string | null = null;
    const mkdirCalls: string[] = [];
    const r = ensureWorkspaceForCoding({
      get: () => current,
      set: (root) => {
        current = root;
        return root;
      },
      home: "/home/u",
      mkdir: (p) => mkdirCalls.push(p),
      exists: () => false,
      text: "Create a React Student List app",
    });
    expect(r.created).toBe(true);
    expect(r.root).toBe("/home/u/AnyLM-Projects/create-a-react-student-list-app");
    expect(mkdirCalls).toContain("/home/u/AnyLM-Projects");
    expect(mkdirCalls).toContain(r.root);
    expect(current).toBe(r.root);
  });
});
```

- [ ] **Step 4: Implement ensure.ts**

```typescript
// src/main/project-coding/ensure.ts
import * as path from "path";
import { slugFromText } from "./slug";

export function resolveAutoProjectPath(
  home: string,
  slug: string,
  exists: (p: string) => boolean
): string {
  const base = path.join(home, "AnyLM-Projects");
  const primary = path.join(base, slug);
  if (!exists(primary)) return primary;
  for (let i = 2; i < 1000; i++) {
    const candidate = path.join(base, `${slug}-${i}`);
    if (!exists(candidate)) return candidate;
  }
  return path.join(base, `${slug}-${Date.now()}`);
}

export function ensureWorkspaceForCoding(deps: {
  get: () => string | null;
  set: (root: string) => string;
  home: string;
  mkdir: (p: string) => void;
  exists: (p: string) => boolean;
  text: string;
}): { root: string; created: boolean } {
  const existing = deps.get();
  if (existing) return { root: existing, created: false };
  const base = path.join(deps.home, "AnyLM-Projects");
  deps.mkdir(base);
  const dir = resolveAutoProjectPath(deps.home, slugFromText(deps.text), deps.exists);
  deps.mkdir(dir);
  deps.set(dir);
  return { root: dir, created: true };
}
```

- [ ] **Step 5: Thin wrapper on workspace.ts**

```typescript
import * as os from "os";
import { ensureWorkspaceForCoding } from "./project-coding/ensure";

function ensureAutoProject(text: string): { root: string; created: boolean } {
  return ensureWorkspaceForCoding({
    get,
    set,
    home: os.homedir(),
    mkdir: (p) => fs.mkdirSync(p, { recursive: true }),
    exists: (p) => fs.existsSync(p),
    text,
  });
}

export { get, set, clear, pick, resolveInside, promptBlock, ensureAutoProject };
```

- [ ] **Step 6: Run tests**

Run: `cd app && bun test src/main/project-coding/slug.test.ts src/main/project-coding/ensure.test.ts`
Expected: PASS

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add app/src/main/project-coding/slug.ts app/src/main/project-coding/slug.test.ts \
  app/src/main/project-coding/ensure.ts app/src/main/project-coding/ensure.test.ts \
  app/src/main/workspace.ts
git commit -m "feat: auto-create AnyLM-Projects workspace for coding turns"
```

---

### Task 3: Summary builder + fence strip

**Files:**
- Create: `src/main/project-coding/summary.ts`
- Create: `src/main/project-coding/summary.test.ts`

**Interfaces:**
- Produces:
  - `type ToolOutcome = { name: string; args: Record<string, unknown>; output: string; denied?: boolean }`
  - `buildProjectSummary(opts: { root: string; outcomes: ToolOutcome[]; docsNote?: string | null; modelText?: string }): string`
  - `stripLargeCodeFences(text: string, opts?: { maxLines?: number; maxChars?: number }): string` — defaults 20 lines / 500 chars

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/project-coding/summary.test.ts
import { describe, expect, test } from "bun:test";
import { buildProjectSummary, stripLargeCodeFences } from "./summary";

describe("stripLargeCodeFences", () => {
  test("keeps short fence", () => {
    const t = "Hi\n```js\nconst x = 1;\n```\nDone";
    expect(stripLargeCodeFences(t)).toContain("const x = 1");
  });
  test("strips long fence", () => {
    const body = Array.from({ length: 25 }, (_, i) => `line${i}`).join("\n");
    const t = `Intro\n\`\`\`ts\n${body}\n\`\`\`\nOutro`;
    const out = stripLargeCodeFences(t);
    expect(out).not.toContain("line10");
    expect(out).toMatch(/written to files|see list|Code written/i);
  });
});

describe("buildProjectSummary", () => {
  test("lists write_file and run_shell", () => {
    const s = buildProjectSummary({
      root: "/tmp/proj",
      docsNote: null,
      outcomes: [
        { name: "run_shell", args: { command: "npm create vite@latest ." }, output: "ok" },
        { name: "write_file", args: { path: "src/App.tsx", content: "..." }, output: "Wrote src/App.tsx" },
      ],
    });
    expect(s).toContain("/tmp/proj");
    expect(s).toContain("npm create vite@latest");
    expect(s).toContain("src/App.tsx");
  });
  test("notes denied shell", () => {
    const s = buildProjectSummary({
      root: "/tmp/p",
      outcomes: [{ name: "run_shell", args: { command: "cargo new x" }, output: "Denied", denied: true }],
    });
    expect(s).toMatch(/denied|skipped/i);
  });
  test("notes offline docs", () => {
    const s = buildProjectSummary({
      root: "/tmp/p",
      docsNote: "docs lookup skipped (offline)",
      outcomes: [],
    });
    expect(s).toContain("docs lookup skipped (offline)");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/main/project-coding/summary.ts
export type ToolOutcome = {
  name: string;
  args: Record<string, unknown>;
  output: string;
  denied?: boolean;
};

export function stripLargeCodeFences(
  text: string,
  opts?: { maxLines?: number; maxChars?: number }
): string {
  const maxLines = opts?.maxLines ?? 20;
  const maxChars = opts?.maxChars ?? 500;
  const re = /```[\w+-]*\n([\s\S]*?)```/g;
  return String(text || "").replace(re, (full, body: string) => {
    const lines = body.split("\n").length;
    if (lines > maxLines || body.length > maxChars) {
      return "_Code written to files (see list above)._";
    }
    return full;
  });
}

export function buildProjectSummary(opts: {
  root: string;
  outcomes: ToolOutcome[];
  docsNote?: string | null;
  modelText?: string;
}): string {
  const files: string[] = [];
  const commands: string[] = [];
  const notes: string[] = [];
  for (const o of opts.outcomes) {
    if (o.name === "write_file" && o.args.path) files.push(String(o.args.path));
    if (o.name === "create_directory" && o.args.path) files.push(`${o.args.path}/`);
    if (o.name === "run_shell") {
      const cmd = String(o.args.command || "");
      if (o.denied) notes.push(`CLI skipped (user denied): \`${cmd}\``);
      else if (/^error|failed|denied/i.test(o.output || "")) notes.push(`CLI failed: \`${cmd}\``);
      else if (cmd) commands.push(cmd);
    }
  }
  const parts = [`**Project:** \`${opts.root}\``];
  if (opts.docsNote) parts.push(opts.docsNote);
  if (commands.length) parts.push("**Commands run:**\n" + commands.map((c) => `- \`${c}\``).join("\n"));
  if (files.length) {
    const uniq = [...new Set(files)];
    parts.push("**Files created/updated:**\n" + uniq.map((f) => `- \`${f}\``).join("\n"));
  }
  for (const n of notes) parts.push(n);
  let body = parts.join("\n\n");
  if (opts.modelText) {
    const cleaned = stripLargeCodeFences(opts.modelText).trim();
    // Keep only short non-code leftover from the model (e.g. "run npm run dev")
    if (cleaned && cleaned.length < 800 && !/```/.test(cleaned)) {
      body += "\n\n" + cleaned;
    } else if (cleaned && cleaned.includes("Code written to files")) {
      body += "\n\n" + cleaned;
    }
  }
  return body;
}
```

- [ ] **Step 3: Run tests**

Run: `cd app && bun test src/main/project-coding/summary.test.ts`
Expected: PASS

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/main/project-coding/summary.ts app/src/main/project-coding/summary.test.ts
git commit -m "feat: project-coding summary and fence stripping"
```

---

### Task 4: Project-first prompt + docs lookup

**Files:**
- Create: `src/main/project-coding/prompt.ts`
- Create: `src/main/project-coding/prompt.test.ts`
- Create: `src/main/project-coding/docs.ts`
- Create: `src/main/project-coding/docs.test.ts`

**Interfaces:**
- Consumes: `webSearch.search(query: string): Promise<string>` (injectable)
- Produces:
  - `projectFirstPromptBlock(): string`
  - `lookupCodingDocs(opts: { text: string; search: (q: string) => Promise<string> }): Promise<{ block: string; note: string | null }>`

- [ ] **Step 1: Prompt tests**

```typescript
import { describe, expect, test } from "bun:test";
import { projectFirstPromptBlock } from "./prompt";

describe("projectFirstPromptBlock", () => {
  test("requires tools and forbids full source paste", () => {
    const s = projectFirstPromptBlock();
    expect(s.toLowerCase()).toMatch(/run_shell/);
    expect(s.toLowerCase()).toMatch(/write_file/);
    expect(s.toLowerCase()).toMatch(/never|do not/);
    expect(s.toLowerCase()).toMatch(/summary|file list|paths/);
  });
});
```

- [ ] **Step 2: Implement prompt**

```typescript
// src/main/project-coding/prompt.ts
export function projectFirstPromptBlock(): string {
  return [
    "Project-first coding mode is ON for this turn.",
    "1. Prefer official CLI scaffolds via run_shell when creating a new project (npm create, cargo new, django-admin startproject, etc.).",
    "2. Use create_directory and write_file for application code and edits inside the working folder.",
    "3. Read existing files before editing them. Keep modules small.",
    "4. NEVER paste full source files into your chat reply. Put code only in tool calls.",
    "5. After tools finish, reply with a short summary only: project path, commands run, files created/updated, and how to run — no code fences with full programs.",
    "If the user denied a shell command, continue with file tools only.",
  ].join("\n");
}
```

- [ ] **Step 3: Docs lookup tests**

```typescript
import { describe, expect, test } from "bun:test";
import { lookupCodingDocs } from "./docs";

describe("lookupCodingDocs", () => {
  test("returns block on success", async () => {
    const r = await lookupCodingDocs({
      text: "Create a Vite React TypeScript app",
      search: async () => "1. Vite guide\n   https://vitejs.dev\n   Use npm create vite@latest",
    });
    expect(r.note).toBeNull();
    expect(r.block).toMatch(/Vite|npm create/i);
  });
  test("soft-fails offline", async () => {
    const r = await lookupCodingDocs({
      text: "Create a Rust app",
      search: async () => {
        throw new Error("network down");
      },
    });
    expect(r.note).toMatch(/offline|skipped/i);
    expect(r.block).toBe("");
  });
  test("treats Error: search results as soft-fail", async () => {
    const r = await lookupCodingDocs({
      text: "Django project",
      search: async () => "Error: search returned HTTP 500",
    });
    expect(r.note).toMatch(/offline|skipped|failed/i);
  });
});
```

- [ ] **Step 4: Implement docs**

```typescript
// src/main/project-coding/docs.ts
export async function lookupCodingDocs(opts: {
  text: string;
  search: (q: string) => Promise<string>;
}): Promise<{ block: string; note: string | null }> {
  const q = `official project scaffold CLI ${String(opts.text || "").slice(0, 120)} current docs`;
  try {
    const raw = await opts.search(q);
    if (!raw || /^Error:/i.test(raw) || /^No results/i.test(raw)) {
      return { block: "", note: "docs lookup skipped (offline or no results)" };
    }
    return {
      block:
        "Current docs / scaffold search results (prefer these CLI flags and versions):\n\n" + raw,
      note: null,
    };
  } catch {
    return { block: "", note: "docs lookup skipped (offline)" };
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd app && bun test src/main/project-coding/prompt.test.ts src/main/project-coding/docs.test.ts`
Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add app/src/main/project-coding/prompt.ts app/src/main/project-coding/prompt.test.ts \
  app/src/main/project-coding/docs.ts app/src/main/project-coding/docs.test.ts
git commit -m "feat: project-first prompt and docs lookup helper"
```

---

### Task 5: Wire project-coding path into `ipc.ts`

**Files:**
- Modify: `src/main/ipc.ts` (chat:start handler — around tool system blocks, multi-agent gate, and single-agent loop)
- Optionally create: `src/main/project-coding/index.ts` re-exports

**Interfaces:**
- Consumes: `isProjectCodingIntent`, `ensureAutoProject` / ensure helper, `lookupCodingDocs`, `projectFirstPromptBlock`, `buildProjectSummary`, `ToolOutcome`
- Produces: project-coding behavior on `chat:start` when `useTools && isProjectCodingIntent(lastUser.content)`

- [ ] **Step 1: Detect + ensure workspace before tool loop**

After `useTools` / `lastUser` are known and before building `toolDefs` / starting activity:

```typescript
import { isProjectCodingIntent } from "./project-coding/intent";
import { projectFirstPromptBlock } from "./project-coding/prompt";
import { lookupCodingDocs } from "./project-coding/docs";
import { buildProjectSummary, type ToolOutcome } from "./project-coding/summary";
import * as webSearch from "./tools/web-search";

const projectCoding =
  !!useTools && !!lastUser && isProjectCodingIntent(lastUser.content);

let projectCodingDocsNote: string | null = null;
const projectCodingOutcomes: ToolOutcome[] = [];

if (projectCoding) {
  act({ kind: "status", text: "Setting up project" });
  const ensured = workspace.ensureAutoProject(lastUser.content);
  if (ensured.created) {
    act({ kind: "status", text: `Created project folder: ${ensured.root}` });
    send("workspace:changed", { root: ensured.root });
  }
  // Refresh ws prompt into blocks — call workspace.promptBlock() again after ensure
}
```

When `projectCoding`, also **skip multi-agent** for this turn (`useMulti = false`) so the dedicated single-agent tool loop owns scaffolding (avoids parallel tool waves dumping code via synthesize). Document this in a one-line comment.

- [ ] **Step 2: Docs status + inject system blocks**

Inside the `if (useTools)` system-block section, when `projectCoding`:

```typescript
blocks.push(projectFirstPromptBlock());
toolInstructionBlocks.push(projectFirstPromptBlock());
// After ensure, re-add workspace.promptBlock() if it was empty before
```

Before the tool loop (after `activityStarted = true` is fine):

```typescript
if (projectCoding) {
  act({ kind: "status", text: "Looking up docs" });
  const docs = await lookupCodingDocs({
    text: lastUser.content,
    search: (q) => webSearch.search(q),
  });
  projectCodingDocsNote = docs.note;
  if (docs.block) {
    full.push({ role: "system", content: docs.block });
  }
}
```

Note: `full` is built before this point — either inject docs into `blocks` before `full` is constructed, or `full.splice(1, 0, …)` after. Prefer adding to `blocks` before `const system = blocks.join(...)` by awaiting docs earlier (right after ensure). Order:

1. detect projectCoding  
2. ensure workspace  
3. looking up docs (await) → push docs.block into `blocks` / `toolInstructionBlocks`  
4. push projectFirstPromptBlock  
5. push refreshed workspace.promptBlock  
6. build `full` as today  

- [ ] **Step 3: Suppress streamed code; collect outcomes; finalize summary**

In the single-agent `onPiece` callback:

```typescript
if (piece.content) {
  if (!wroteStatus) {
    wroteStatus = true;
    endThinking();
    act({ kind: "status", text: projectCoding ? "Generating code" : "Writing reply…" });
  }
  if (!projectCoding) {
    send("chat:chunk", { id, text: piece.content });
  }
  // projectCoding: do not stream content chunks to the renderer
}
```

When executing tools in the loop, after each tool finishes:

```typescript
projectCodingOutcomes.push({
  name: fname,
  args: fargs,
  output: String(output),
  denied: /^denied|user denied|not approved/i.test(String(output)),
});
if (projectCoding && fname === "run_shell") {
  act({ kind: "status", text: "Using terminal" });
}
if (projectCoding && (fname === "write_file" || fname === "create_directory")) {
  act({ kind: "status", text: "Generating code" });
}
```

After the loop, before `finishTurn`:

```typescript
let text = (result && result.text) || "";
if (projectCoding) {
  act({ kind: "status", text: "Writing summary" });
  text = buildProjectSummary({
    root: workspace.get() || "",
    outcomes: projectCodingOutcomes,
    docsNote: projectCodingDocsNote,
    modelText: text,
  });
  send("chat:replace", { id, text });
}
await finishTurn(text, ...);
```

Also handle Stop: if `stopped && projectCoding && projectCodingOutcomes.length`, still build a partial summary the same way.

- [ ] **Step 4: Manual sanity check (dev)**

Run the app, tools on, no folder selected, prompt: “Create a small Vite React TypeScript app with a StudentList component”. Confirm:

- Status trail shows setting up / docs / terminal / generating code  
- Folder appears under `~/AnyLM-Projects/...`  
- Final bubble is summary, not full source  
- Workspace chip updates (Task 6)

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add app/src/main/ipc.ts app/src/main/project-coding/
git commit -m "feat: route coding turns through project-first path"
```

---

### Task 6: Workspace chip updates on auto-create

**Files:**
- Modify: `preload.ts` — expose `onWorkspaceChanged`
- Modify: `src/types/api.d.ts` — type the API
- Modify: `src/renderer/js/workspace.ts` — subscribe and re-render

**Interfaces:**
- Consumes: main `send("workspace:changed", { root })` from Task 5
- Produces: `window.api.onWorkspaceChanged(cb: (p: { root: string }) => void): () => void`

- [ ] **Step 1: Preload + types**

```typescript
// preload.ts (alongside other on* helpers)
onWorkspaceChanged: (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on("workspace:changed", handler);
  return () => ipcRenderer.removeListener("workspace:changed", handler);
},
```

```typescript
// api.d.ts
onWorkspaceChanged(cb: (p: { root: string }) => void): () => void;
```

- [ ] **Step 2: Renderer**

In `initWorkspace`, after initial `workspaceGet`:

```typescript
window.api.onWorkspaceChanged?.(({ root }) => render(root));
```

- [ ] **Step 3: Smoke** — auto-create turn updates the 📁 chip without manually picking a folder.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/preload.ts app/src/types/api.d.ts app/src/renderer/js/workspace.ts
git commit -m "feat: refresh workspace chip after auto-create"
```

---

### Task 7: Regression tests + verification checklist

**Files:**
- Optionally add: `src/main/project-coding/pipeline-notes.test.ts` only if pure helpers need integration-style composition tests (no Electron)
- No new E2E harness required

- [ ] **Step 1: Run full unit suite for new modules**

Run: `cd app && bun test src/main/project-coding/`
Expected: all PASS

- [ ] **Step 2: Spec coverage checklist (manual)**

Mark each against the spec:

| Spec requirement | Covered by |
|------------------|------------|
| Auto coding intent + tools | Task 1 + 5 |
| Auto-create `~/AnyLM-Projects/<slug>/` | Task 2 + 5 |
| Docs online / offline soft-fail | Task 4 + 5 |
| Prefer CLI then write_file | Task 4 prompt + 5 |
| Status strings | Task 5 |
| Summary-only final message | Task 3 + 5 |
| Fence strip >20 lines / >500 chars | Task 3 |
| Skip when tools off | Task 5 gate |
| Workspace chip update | Task 6 |
| RAM kill deferred | N/A (out of scope) |

- [ ] **Step 3: Manual scenario**

1. Clear working folder  
2. Tools ⚒ on  
3. “Create a React student list app in a new project”  
4. Allow `run_shell` if prompted  
5. Expect files on disk + summary reply + no wall of source  

- [ ] **Step 4: Commit (only if user asked)** — docs-only if plan was edited during execution

---

## Self-review (plan author)

**Spec coverage:** Intent, auto workspace, docs soft-fail, CLI preference via prompt+tools, activity statuses, summary + fence strip, tools-off skip, chip notify — each maps to a task. RAM kill explicitly out of scope.

**Placeholders:** None intentional; Task 2 notes electron-mock vs pure `ensure.ts` extraction — implementers must use the pure `ensure.ts` path (locked): create `ensure.ts` + `ensure.test.ts`, thin `workspace.ensureAutoProject` wrapper.

**Type consistency:** `ToolOutcome`, `isProjectCodingIntent`, `lookupCodingDocs`, `buildProjectSummary`, `projectFirstPromptBlock`, `ensureAutoProject` / `ensureWorkspaceForCoding` names are stable across tasks.
