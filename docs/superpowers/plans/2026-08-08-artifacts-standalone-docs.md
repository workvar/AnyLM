# Artifacts Explorer + Standalone Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow standalone chats to generate documents into `~/Documents/AnyLM/generated`, browse/delete all artifacts from a sidebar explorer, make project location keyboard-editable with kebab folder slugs, and fix Thought/Reasoning/Writing live-status overlap.

**Architecture:** Pure `path-slug` + destination helpers; extend `dest`/`exec` for null `projectId`; thin `artifacts` main module + IPC for gated list/open/reveal/delete; sidebar explorer pane (not nested nav); activity-store supersedes status and trail paints only the current phase live; end thinking when reasoning starts in `ipc.ts`.

**Tech Stack:** Electron main/renderer TypeScript, Bun tests (`bun:test`), existing project-files / documents / preload IPC patterns.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-artifacts-standalone-docs-design.md`
- Standalone dir: `path.join(app.getPath("documents"), "AnyLM", "generated")` only (not install dir, not `AnyLM/Documents`)
- Auto folder segments: lowercase kebab (`My Project` → `my-project`); never auto-create spaced folder names
- Typed project `folderPath` is authoritative; display name need not match folder
- Artifacts: one flat `#artifacts-nav` under Projects; hierarchy only inside explorer pane
- Click file → OS default app; right-click → Show in folder · Delete (disk delete + confirm)
- Do not migrate existing on-disk project folders
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged
- Paths under `app/` below are relative to `app/` unless noted

## File map

| File | Responsibility |
|------|----------------|
| `src/main/path-slug.ts` | Shared kebab folder/file segment helper |
| `src/main/path-slug.test.ts` | Slug cases |
| `src/main/documents/dest.ts` | Standalone fallback → `AnyLM/generated`; use path-slug |
| `src/main/documents/dest.test.ts` | `standaloneGeneratedDir` path join |
| `src/main/documents/index.ts` | Unchanged generate entry (already accepts null projectId) |
| `src/main/tools/exec.ts` | Allow null projectId; success message for both scopes |
| `src/main/project-files.ts` | Use path-slug; include `generated` in allowed roots |
| `src/main/artifacts.ts` | List roots/files; gated delete |
| `src/main/artifacts.test.ts` | Path gate + list filtering |
| `src/main/ipc.ts` | Artifacts IPC; create with `folderPath`; end thinking on reasoning |
| `preload.ts` + `src/types/api.d.ts` | Renderer API |
| `src/types/domain.d.ts` | `ArtifactRoot` type if needed |
| `src/renderer/js/activity-store.ts` | Status supersede |
| `src/renderer/js/activity-store.test.ts` | Supersede tests |
| `src/renderer/js/activity-trail.ts` | Only current phase live |
| `src/renderer/js/activity-trail.test.ts` | Live-bullet tests (DOM via happy-dom or string assertions on helpers) |
| `src/renderer/js/file-cards.ts` | Standalone destination copy |
| `src/renderer/js/projects.ts` + `index.html` | Editable locations; manual-edit latch; pass `folderPath` |
| `src/renderer/js/artifacts.ts` | Explorer pane UI |
| `src/renderer/js/nav.ts` + `app.ts` | Artifacts nav active state |
| `src/renderer/styles.css` | Explorer pane styles matching side-nav/list |

---

### Task 1: Path slug + standalone `generated` destination

**Files:**
- Create: `src/main/path-slug.ts`
- Create: `src/main/path-slug.test.ts`
- Create: `src/main/documents/dest.test.ts`
- Modify: `src/main/documents/dest.ts`
- Modify: `src/main/project-files.ts` (`safeName` → re-export/use path-slug; `allowedGeneratedRoots`)

**Interfaces:**
- Produces:
  - `pathSlug(name: unknown, fallback?: string): string`
  - `standaloneGeneratedDir(documentsPath: string): string` → `…/AnyLM/generated`
  - `fallbackDir(): string` uses `standaloneGeneratedDir(app.getPath("documents"))`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/path-slug.test.ts
import { describe, expect, test } from "bun:test";
import { pathSlug } from "./path-slug";

describe("pathSlug", () => {
  test("spaces become hyphens and lowercased", () => {
    expect(pathSlug("My Project")).toBe("my-project");
  });
  test("strips illegal path chars", () => {
    expect(pathSlug('Report: "Q1"/final')).toBe("report-q1-final");
  });
  test("collapses repeated hyphens and trims", () => {
    expect(pathSlug("  Foo   Bar--Baz  ")).toBe("foo-bar-baz");
  });
  test("empty falls back", () => {
    expect(pathSlug("")).toBe("project");
    expect(pathSlug("***", "document")).toBe("document");
  });
});
```

```typescript
// src/main/documents/dest.test.ts
import { describe, expect, test } from "bun:test";
import { standaloneGeneratedDir } from "./dest";
import * as path from "path";

describe("standaloneGeneratedDir", () => {
  test("joins Documents/AnyLM/generated", () => {
    expect(standaloneGeneratedDir("/Users/x/Documents")).toBe(
      path.join("/Users/x/Documents", "AnyLM", "generated")
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && bun test src/main/path-slug.test.ts src/main/documents/dest.test.ts`
Expected: FAIL (module/exports missing)

- [ ] **Step 3: Implement**

```typescript
// src/main/path-slug.ts
export function pathSlug(name: unknown, fallback = "project"): string {
  const clean = String(name || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return clean || fallback;
}
```

In `dest.ts`:
- Export `standaloneGeneratedDir(documentsPath: string)` as above
- `fallbackDir()` → `standaloneGeneratedDir(app.getPath("documents"))`
- Replace local `safeName` with `pathSlug(name, "document")`

In `project-files.ts`:
- `safeName(name)` → `pathSlug(name, "project")` (keep `safeName` wrapper if callers expect the name)
- In `allowedGeneratedRoots()`, replace `AnyLM/Documents` with `AnyLM/generated` (or include **both** briefly if old files may exist — prefer **replace** per spec; keep old root only if you want open/reveal of legacy files: include both roots for read/delete safety)

Recommended roots list:

```typescript
path.resolve(defaultBase()),
path.resolve(app.getPath("documents"), "AnyLM", "generated"),
path.resolve(app.getPath("documents"), "AnyLM", "Documents"), // legacy standalone
...project folders
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && bun test src/main/path-slug.test.ts src/main/documents/dest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/path-slug.ts app/src/main/path-slug.test.ts \
  app/src/main/documents/dest.ts app/src/main/documents/dest.test.ts \
  app/src/main/project-files.ts
git commit -m "feat: kebab path slugs and standalone generated folder"
```

---

### Task 2: Allow `generate_document` without a project

**Files:**
- Modify: `src/main/tools/exec.ts` (generate_document case ~80–89)
- Modify: `src/renderer/js/file-cards.ts` (~104–105)

**Interfaces:**
- Consumes: `documents.generate(projectId: string | null, args)` (already)
- Produces: tool string success without requiring project; file card standalone copy

- [ ] **Step 1: Write a focused unit test for the success message helper**

Extract a tiny pure helper next to exec (or in `src/main/documents/messages.ts`):

```typescript
// src/main/documents/messages.ts
export function generateDocumentToolMessage(
  fileName: string,
  inProject: boolean
): string {
  const where = inProject ? "in the project folder" : "in Documents/AnyLM/generated";
  return `Created "${fileName}" ${where}. Tell the user it is ready; do not repeat the document content in your reply.`;
}
```

```typescript
// src/main/documents/messages.test.ts
import { describe, expect, test } from "bun:test";
import { generateDocumentToolMessage } from "./messages";

test("project wording", () => {
  expect(generateDocumentToolMessage("a.pdf", true)).toContain("project folder");
});
test("standalone wording", () => {
  expect(generateDocumentToolMessage("a.pdf", false)).toContain("Documents/AnyLM/generated");
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd app && bun test src/main/documents/messages.test.ts`

- [ ] **Step 3: Implement helper + change exec**

```typescript
case "generate_document": {
  try {
    const projectId = context?.projectId || null;
    const file = await documents.generate(projectId, args);
    if (context?.onFile) context.onFile(file);
    return generateDocumentToolMessage(file.name, !!projectId);
  } catch (e) {
    return `Error: ${e.message}`;
  }
}
```

Update `file-cards.ts` standalone line to:

```typescript
: "· Writes to Documents/AnyLM/generated"
```

- [ ] **Step 4: Run tests**

Run: `cd app && bun test src/main/documents/messages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/tools/exec.ts app/src/main/documents/messages.ts \
  app/src/main/documents/messages.test.ts app/src/renderer/js/file-cards.ts
git commit -m "feat: allow document generation outside projects"
```

---

### Task 3: Activity status — end thinking + supersede + live paint

**Files:**
- Modify: `src/main/ipc.ts` (`onPiece` ~911–925 and agent synth path ~861–867)
- Modify: `src/renderer/js/activity-store.ts`
- Modify: `src/renderer/js/activity-store.test.ts`
- Modify: `src/renderer/js/activity-trail.ts`
- Create: `src/renderer/js/activity-trail.test.ts` (test a small exported helper if DOM paint is awkward)

**Interfaces:**
- Produces:
  - `applyActivity` replaces prior `status` event in place
  - `statusIsLive(events, index, liveTurn): boolean` or paint logic: only last status is live; thinking live only for `phase: "start"`

- [ ] **Step 1: Failing store tests**

Replace/extend `applyActivity` “appends status” test:

```typescript
test("status supersedes previous status", () => {
  let evs = applyActivity([], { kind: "status", text: "Reasoning…" });
  evs = applyActivity(evs, { kind: "status", text: "Writing reply…" });
  expect(evs).toEqual([{ kind: "status", text: "Writing reply…" }]);
});

test("status after thinking keeps thought row", () => {
  let evs = applyActivity([], { kind: "thinking", phase: "end", ms: 21000 });
  evs = applyActivity(evs, { kind: "status", text: "Reasoning…" });
  expect(evs).toEqual([
    { kind: "thinking", phase: "end", ms: 21000 },
    { kind: "status", text: "Reasoning…" },
  ]);
});
```

- [ ] **Step 2: Run — expect FAIL** on supersede

Run: `cd app && bun test src/renderer/js/activity-store.test.ts`

- [ ] **Step 3: Implement `applyActivity` status supersede**

```typescript
if (ev.kind === "status") {
  const next = events.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].kind === "status") {
      next[i] = ev;
      return next;
    }
  }
  return [...next, ev];
}
```

- [ ] **Step 4: Update `paintTrail` status/thinking bullets**

For thinking: `live = opts.live && ev.phase === "start"` (already).

For status: compute last status index; only that row gets running bullet when `opts.live`:

```typescript
const lastStatusIdx = (() => {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === "status") return i;
  }
  return -1;
})();
// in loop, when painting status at index i:
const running = opts.live && i === lastStatusIdx;
row.appendChild(bullet(false, running));
```

(You may need to change the `for...of` to `for (let i = 0; …)`.)

- [ ] **Step 5: End thinking when reasoning starts (`ipc.ts`)**

In both `onPiece` handlers that emit Reasoning…:

```typescript
if (piece.thinking && !sawReasoning) {
  sawReasoning = true;
  endThinking();
  act({ kind: "status", text: "Reasoning…" });
}
```

Keep existing `endThinking()` before Writing reply (idempotent if already ended).

- [ ] **Step 6: Run store tests + typecheck**

Run: `cd app && bun test src/renderer/js/activity-store.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add app/src/main/ipc.ts app/src/renderer/js/activity-store.ts \
  app/src/renderer/js/activity-store.test.ts app/src/renderer/js/activity-trail.ts
git commit -m "fix: settle thought before reasoning and keep one live status"
```

---

### Task 4: Editable project location + create with full `folderPath`

**Files:**
- Modify: `src/renderer/index.html` (`#np-location`, `#project-location` — remove `readonly`)
- Modify: `src/renderer/js/projects.ts` (create modal + settings location)
- Modify: `src/main/ipc.ts` (`projects:create`)
- Modify: `src/types/api.d.ts` (`createProject` accepts `folderPath?`)

**Interfaces:**
- Consumes: `pathSlug` behavior mirrored in renderer for suggested paths (duplicate a tiny `slugProjectFolder(name)` in renderer **or** expose `window.api.pathSlug` — prefer **local renderer helper** `slugFolderName` in `projects.ts` matching path-slug rules to avoid IPC for keystrokes)
- Produces: create with `{ name, model, folderPath }`; settings blur saves typed path via `pfilesSetLocation`

- [ ] **Step 1: Add a renderer slug helper test**

```typescript
// src/renderer/js/folder-slug.test.ts
import { describe, expect, test } from "bun:test";
import { slugFolderName } from "./folder-slug";

test("matches main pathSlug kebab", () => {
  expect(slugFolderName("My Project")).toBe("my-project");
});
```

```typescript
// src/renderer/js/folder-slug.ts
export function slugFolderName(name: string): string {
  const clean = String(name || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return clean || "project";
}
```

(Keep DRY later if desired by sharing a JSON-free copy; duplicating the 10-line function is acceptable to avoid bundling main into renderer.)

- [ ] **Step 2: Run — FAIL then implement until PASS**

Run: `cd app && bun test src/renderer/js/folder-slug.test.ts`

- [ ] **Step 3: HTML — remove readonly**

- `#project-location`: remove `readonly`
- `#np-location`: remove `readonly`

- [ ] **Step 4: New-project modal logic in `projects.ts`**

```typescript
let npBase = "";
let npDefault = "";
let npLocationManual = false;

function updateNpLocation() {
  if (npLocationManual) return;
  const name = el("np-name").value.trim() || "Untitled project";
  const base = npBase || npDefault;
  el("np-location").value = base ? `${base}/${slugFolderName(name)}` : "";
}

// np-browse: set full folder path (not parent base)
el("np-browse").onclick = async () => {
  const dir = await window.api.pfilesPickFolder();
  if (!dir) return;
  npLocationManual = true;
  el("np-location").value = dir;
};

el("np-location").oninput = () => {
  npLocationManual = true;
};

// create:
const folderPath = el("np-location").value.trim() || null;
const p = await window.api.createProject({
  name,
  model: state.models[0] || "",
  folderPath,
});
```

Reset `npLocationManual = false` in `createProject()` when opening the modal.

- [ ] **Step 5: `projects:create` IPC**

```typescript
ipcMain.handle("projects:create", (_e, data) => {
  const project = store.create(data || {});
  let custom: string | null = null;
  if (data?.folderPath) custom = String(data.folderPath);
  else if (data?.folderBase) custom = projectFiles.childPath(data.folderBase, project.name);
  projectFiles.ensureFolder(project, custom);
  return store.get(project.id);
});
```

Update `api.d.ts`:

```typescript
createProject(data: Partial<Project> & { folderBase?: string; folderPath?: string }): Promise<Project | null>;
```

- [ ] **Step 6: Settings location keyboard save**

```typescript
el("project-location").onchange = saveProjectLocation;
el("project-location").onkeydown = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveProjectLocation();
  }
};

async function saveProjectLocation() {
  if (!state.current) return;
  const dir = el("project-location").value.trim();
  if (!dir) return;
  const set = await window.api.pfilesSetLocation(state.current.id, dir);
  if (set) {
    state.current = { ...state.current, folderPath: set };
    el("project-location").value = set;
  }
}
```

Keep Browse (`changeProjectLocation`) setting the input + `pfilesSetLocation` as today.

- [ ] **Step 7: Typecheck**

Run: `cd app && bun test src/renderer/js/folder-slug.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 8: Commit** (only if user asked)

```bash
git add app/src/renderer/index.html app/src/renderer/js/projects.ts \
  app/src/renderer/js/folder-slug.ts app/src/renderer/js/folder-slug.test.ts \
  app/src/main/ipc.ts app/src/types/api.d.ts
git commit -m "feat: editable project paths and kebab auto folders"
```

---

### Task 5: Artifacts main module + IPC

**Files:**
- Create: `src/main/artifacts.ts`
- Create: `src/main/artifacts.test.ts`
- Modify: `src/main/ipc.ts`
- Modify: `preload.ts`
- Modify: `src/types/api.d.ts`
- Modify: `src/types/domain.d.ts` (optional `ArtifactRoot`)

**Interfaces:**
- Produces:
  - `listArtifactRoots(projects: { id; name; folderPath }[], generatedDir: string): ArtifactRoot[]`
  - `listArtifactFiles(dir: string, allowedRoots: string[]): ProjectFileEntry[]`
  - `deleteArtifact(dir: string, name: string, allowedRoots: string[]): boolean`
  - IPC: `artifacts:list-roots`, `artifacts:list-files`, `artifacts:delete`
  - Reuse existing `pfiles:open` / `pfiles:show` for open/reveal (after roots include `generated`)

```typescript
interface ArtifactRoot {
  id: string; // "generated" | projectId
  label: string;
  dir: string;
  kind: "generated" | "project";
}
```

- [ ] **Step 1: Failing tests (pure helpers with injected fs)**

```typescript
// src/main/artifacts.test.ts
import { describe, expect, test } from "bun:test";
import { listArtifactRoots, isUnderAllowedRoot, ARTIFACT_EXTS } from "./artifacts";

describe("listArtifactRoots", () => {
  test("puts Generated first then projects with folders", () => {
    const roots = listArtifactRoots(
      [
        { id: "1", name: "RSA", folderPath: "/p/rsa" },
        { id: "2", name: "Empty", folderPath: "" },
      ],
      "/docs/AnyLM/generated"
    );
    expect(roots[0]).toMatchObject({ id: "generated", label: "Generated", kind: "generated" });
    expect(roots.map((r) => r.id)).toEqual(["generated", "1"]);
    expect(roots[1].label).toBe("RSA");
  });
});

describe("isUnderAllowedRoot", () => {
  test("accepts path inside root", () => {
    expect(isUnderAllowedRoot("/a/b/c.pdf", ["/a/b"])).toBe(true);
  });
  test("rejects traversal", () => {
    expect(isUnderAllowedRoot("/a/other/c.pdf", ["/a/b"])).toBe(false);
  });
});

test("ARTIFACT_EXTS includes office docs", () => {
  expect(ARTIFACT_EXTS.has(".pdf")).toBe(true);
  expect(ARTIFACT_EXTS.has(".docx")).toBe(true);
  expect(ARTIFACT_EXTS.has(".xlsx")).toBe(true);
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd app && bun test src/main/artifacts.test.ts`

- [ ] **Step 3: Implement `artifacts.ts`**

```typescript
import * as fs from "fs";
import * as path from "path";

export const ARTIFACT_EXTS = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".md"]);

export function isUnderAllowedRoot(absFile: string, roots: string[]): boolean {
  const target = path.resolve(absFile);
  return roots.some((root) => {
    const r = path.resolve(root);
    return target === r || target.startsWith(r + path.sep);
  });
}

export function listArtifactRoots(
  projects: Array<{ id: string; name: string; folderPath: string }>,
  generatedDir: string
): ArtifactRoot[] {
  const roots: ArtifactRoot[] = [
    { id: "generated", label: "Generated", dir: generatedDir, kind: "generated" },
  ];
  for (const p of projects) {
    if (!p.folderPath) continue;
    roots.push({ id: p.id, label: p.name || "Untitled project", dir: p.folderPath, kind: "project" });
  }
  return roots;
}

export function listArtifactFiles(dir: string, allowedRoots: string[]): ProjectFileEntry[] {
  const root = path.resolve(dir);
  if (!isUnderAllowedRoot(root, allowedRoots) && !allowedRoots.map(path.resolve).includes(root)) {
    return [];
  }
  // allow listing the root dir itself when root is in allowedRoots
  if (!allowedRoots.some((r) => path.resolve(r) === root)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: ProjectFileEntry[] = [];
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith(".")) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!ARTIFACT_EXTS.has(ext)) continue;
    try {
      const fp = path.join(root, e.name);
      const st = fs.statSync(fp);
      files.push({ name: e.name, ext, size: st.size, mtime: st.mtime.toISOString() });
    } catch {}
  }
  files.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return files;
}

export function deleteArtifact(dir: string, name: string, allowedRoots: string[]): boolean {
  const fp = path.resolve(dir, path.basename(name));
  if (!isUnderAllowedRoot(fp, allowedRoots)) return false;
  try {
    if (!fs.existsSync(fp)) return false;
    fs.unlinkSync(fp);
    return true;
  } catch {
    return false;
  }
}
```

Wire IPC (use `dest.fallbackDir()` / `standaloneGeneratedDir` for generated path; mkdir not required for list):

```typescript
ipcMain.handle("artifacts:list-roots", () => {
  const generatedDir = require("./documents/dest").fallbackDir();
  return artifacts.listArtifactRoots(store.list(), generatedDir);
});
ipcMain.handle("artifacts:list-files", (_e, dir) => {
  const roots = /* same allowed list as project-files or from listArtifactRoots dirs */;
  return artifacts.listArtifactFiles(dir, roots);
});
ipcMain.handle("artifacts:delete", (_e, { dir, name }) => {
  return artifacts.deleteArtifact(dir, name, roots);
});
```

Expose on preload + `api.d.ts`:

```typescript
artifactsListRoots(): Promise<ArtifactRoot[]>;
artifactsListFiles(dir: string): Promise<ProjectFileEntry[]>;
artifactsDelete(dir: string, name: string): Promise<boolean>;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd app && bun test src/main/artifacts.test.ts && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add app/src/main/artifacts.ts app/src/main/artifacts.test.ts \
  app/src/main/ipc.ts app/preload.ts app/src/types/api.d.ts app/src/types/domain.d.ts
git commit -m "feat: artifacts list and delete IPC"
```

---

### Task 6: Artifacts sidebar explorer UI

**Files:**
- Modify: `src/renderer/index.html` (button under Projects; pane in side-scroll)
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/js/artifacts.ts`
- Modify: `src/renderer/js/app.ts` (bind nav)
- Modify: `src/renderer/js/nav.ts` (active state for artifacts-nav)
- Modify: `src/renderer/js/chat.ts` or file-generated handler — call `refreshArtifactsIfOpen()`

**Interfaces:**
- Consumes: `artifactsListRoots`, `artifactsListFiles`, `artifactsDelete`, `pfilesOpen`, `pfilesShow`
- Produces: `openArtifactsPane()`, `refreshArtifactsIfOpen()`

- [ ] **Step 1: HTML structure**

After `#projects-nav`:

```html
<button id="artifacts-nav" class="side-nav" type="button">▭ Artifacts</button>
```

Inside `.side-scroll`, wrap existing chats UI and add pane:

```html
<div class="side-scroll">
  <div id="side-chats-pane">
    <div class="side-section-label"><span id="side-chats-label">Chats</span></div>
    <ul id="recents-list" class="nav-list"></ul>
  </div>
  <div id="artifacts-pane" class="hidden">
    <div class="artifacts-head">
      <button type="button" id="artifacts-back" class="ghost small hidden">← Back</button>
      <span id="artifacts-title">Artifacts</span>
    </div>
    <ul id="artifacts-list" class="nav-list"></ul>
  </div>
</div>
```

- [ ] **Step 2: Implement `artifacts.ts`**

State: `mode: "roots" | "files"`, `currentRoot: ArtifactRoot | null`.

- `openArtifactsPane()`: show `#artifacts-pane`, hide `#side-chats-pane`, mark `#artifacts-nav` active, clear projects-nav active, load roots
- `closeArtifactsPane()` / when opening Projects or New chat: reverse visibility
- Render roots as folder rows; click → list files
- Back → roots
- File click → `window.api.pfilesOpen(dir, name)`
- Context menu (right-click): Show in folder / Delete
  - Delete: `confirm("Delete <name> from disk?")` then `artifactsDelete` + refresh
- `refreshArtifactsIfOpen()`: if pane visible, reload current view
- Subscribe once: `window.api.onFileGenerated(() => refreshArtifactsIfOpen())`

Keep styling close to `.nav-list` / `.side-nav` (folder icon + label; file row with ext).

- [ ] **Step 3: Wire `app.ts` / `nav.ts`**

```typescript
bindClick("artifacts-nav", () => openArtifactsPane());
// openProjectsGrid / createChat should call closeArtifactsPane()
```

Update `navFor` / active loop to include `artifacts-nav` when `state.sidebarPane === "artifacts"` (add field on state or a module flag).

- [ ] **Step 4: CSS**

Minimal: `.artifacts-head` flex row; `#artifacts-pane` fills side-scroll; file/folder rows reuse list item hover.

- [ ] **Step 5: Typecheck**

Run: `cd app && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Manual smoke (document in PR notes)**

1. Standalone chat → generate PDF → file under `~/Documents/AnyLM/generated` without project error
2. Artifacts → Generated → see file → open; right-click delete removes from disk
3. Project chat → generate → appears under project display-name folder
4. New project “My Project” → suggested path ends with `my-project`; type a different path and create
5. Settings location: type path, Enter, persists
6. Thinking model: Thought settles when Reasoning starts; only Writing reply live afterward

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add app/src/renderer/index.html app/src/renderer/styles.css \
  app/src/renderer/js/artifacts.ts app/src/renderer/js/app.ts \
  app/src/renderer/js/nav.ts app/src/renderer/js/state.ts
git commit -m "feat: artifacts sidebar explorer pane"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Standalone → `Documents/AnyLM/generated` | 1, 2 |
| Remove projectId hard-fail | 2 |
| File card copy | 2 |
| Flat Artifacts nav + explorer pane | 6 |
| Generated + per-project folders | 5, 6 |
| Open / reveal / delete | 5, 6 |
| Path gate | 5 |
| Kebab slug, no spaced auto folders | 1, 4 |
| Editable location + independent name | 4 |
| End thinking on reasoning | 3 |
| Status supersede + one live status | 3 |
| No migrate existing folders | 1 / 4 (documented) |

## Self-review notes

- No TBD placeholders.
- `folder-slug.ts` duplicates `path-slug.ts` intentionally (main vs renderer); keep rules identical in tests.
- Legacy `AnyLM/Documents` kept in allowed roots for open/reveal of older files; new writes use `generated` only.
- Commit steps skipped unless the user asks.
