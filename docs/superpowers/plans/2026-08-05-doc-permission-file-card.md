# Document Permission + Open-with File Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the document-generation permission prompt into a full-width three-row Allow/Deny block, and after Allow show a compact full-width finished-file row with Open with default app + dropdown.

**Architecture:** Main process gains an allowlisted `pfiles:open` IPC that calls `shell.openPath` (mirroring `pfiles:show`). Renderer `file-cards.ts` owns both UIs: permission lifecycle (deny → collapse with “Denied”; allow → remove node) and the finished-file Open-with split control. Styles stretch both blocks to the messages column like `.ask-card`.

**Tech Stack:** Electron IPC (`ipcMain` / `preload` / `window.api`), vanilla renderer DOM (`node`/`el` helpers), CSS in `styles.css`, TypeScript (`bun run typecheck`). No unit-test runner in this package — verify with typecheck + manual checklist.

## Global Constraints

- Permission block: full width of `#messages`, three rows (ask / description / Deny·Allow); no Open with on the permission UI.
- Deny: same element stays, collapsed, shows “Denied”; no finished-file card.
- Allow: remove permission node immediately; finished-file row appears only on `chat:file` / `onFileGenerated`.
- Finished-file row: compact height, full width; primary “Open with Default app”; dropdown minimum: Open with default, Preview in AnyLM (project only), Show in folder.
- No full OS app picker. Other risky tools keep the modal confirm.
- Do not invent brand-specific default app names; label is **“Default app”**.
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged.

## File map

| File | Responsibility |
|------|----------------|
| `app/src/main/project-files.ts` | Shared allowlist + `openGenerated(dir, name)` via `shell.openPath` |
| `app/src/main/ipc.ts` | Register `pfiles:open` handler |
| `app/preload.ts` | Expose `pfilesOpen` |
| `app/src/types/api.d.ts` | Type `pfilesOpen` on `window.api` |
| `app/src/renderer/js/file-cards.ts` | `showDocConfirm` + `showFileCard` UI/behavior |
| `app/src/renderer/styles.css` | `.perm-card` / `.doc-card` full-width compact layouts + open menu |
| `app/src/renderer/js/chat.ts` | Unchanged wiring unless a tiny glue tweak is required |

---

### Task 1: Allowlisted `pfiles:open` IPC

**Files:**
- Modify: `app/src/main/project-files.ts`
- Modify: `app/src/main/ipc.ts` (near existing `pfiles:show` handler ~line 287)
- Modify: `app/preload.ts` (near `pfilesShow`)
- Modify: `app/src/types/api.d.ts` (near `pfilesShow`)

**Interfaces:**
- Consumes: existing `showGenerated` allowlist roots (`defaultBase()`, Documents/AnyLM/Documents, project `folderPath`s)
- Produces: `openGenerated(dir: string, name: string): Promise<boolean>`; `window.api.pfilesOpen(dir: string, name: string): Promise<boolean>`

- [ ] **Step 1: Extract shared path resolution + allowlist check**

In `app/src/main/project-files.ts`, refactor so `showGenerated` and the new opener share one helper. Replace the body of `showGenerated` with calls to the helper, then add `openGenerated`:

```typescript
function resolveGenerated(dir: string, name: string): string | null {
  const target = path.resolve(String(dir || ""), path.basename(String(name || "")));
  const allowed = [
    path.resolve(defaultBase()),
    path.resolve(app.getPath("documents"), "AnyLM", "Documents"),
    ...store
      .list()
      .map((p) => folderOf(p.id))
      .filter(Boolean)
      .map((d) => path.resolve(d as string)),
  ].filter(Boolean) as string[];
  const inside = allowed.some((root) => target === root || target.startsWith(root + path.sep));
  if (!inside || !fs.existsSync(target)) return null;
  return target;
}

function showGenerated(dir: string, name: string): boolean {
  const target = resolveGenerated(dir, name);
  if (!target) return false;
  shell.showItemInFolder(target);
  return true;
}

async function openGenerated(dir: string, name: string): Promise<boolean> {
  const target = resolveGenerated(dir, name);
  if (!target) return false;
  const err = await shell.openPath(target);
  return !err;
}
```

Update the export list at the bottom of the file to include `openGenerated`:

```typescript
export {
  defaultBase,
  childPath,
  ensureFolder,
  listFiles,
  readFile,
  previewFile,
  appendLog,
  reveal,
  showGenerated,
  openGenerated,
};
```

- [ ] **Step 2: Register IPC + preload + types**

In `app/src/main/ipc.ts`, next to `pfiles:show`:

```typescript
ipcMain.handle("pfiles:open", (_e, { dir, name }) => projectFiles.openGenerated(dir, name));
```

In `app/preload.ts`, next to `pfilesShow`:

```typescript
pfilesOpen: (dir, name) => ipcRenderer.invoke("pfiles:open", { dir, name }),
```

In `app/src/types/api.d.ts`, next to `pfilesShow`:

```typescript
pfilesOpen(dir: string, name: string): Promise<boolean>;
```

- [ ] **Step 3: Typecheck**

Run:

```bash
cd app && bun run typecheck
```

Expected: exit 0, no errors related to `openGenerated` / `pfilesOpen`.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/main/project-files.ts app/src/main/ipc.ts app/preload.ts app/src/types/api.d.ts
git commit -m "$(cat <<'EOF'
feat: add allowlisted pfiles:open for generated documents

EOF
)"
```

---

### Task 2: Full-width compact CSS for permission + file rows

**Files:**
- Modify: `app/src/renderer/styles.css` (`.doc-card` ~1790–1824 and `.perm-card` ~2563–2646)

**Interfaces:**
- Consumes: existing CSS variables (`--border`, `--panel`, `--warn`, `--ok`, `--muted`, `--accent`, etc.)
- Produces: class names used by Task 3–4: `.perm-card`, `.perm-ask`, `.perm-desc`, `.perm-actions`, `.perm-card.denied`, `.perm-result`, `.doc-card.doc-file`, `.doc-card-body`, `.doc-card-name`, `.doc-card-sub`, `.doc-card-actions`, `.doc-open`, `.doc-open-main`, `.doc-open-chevron`, `.doc-open-menu`, `.doc-open-item`

- [ ] **Step 1: Replace `.doc-card` block**

Replace the existing “Inline document cards” block (from `.doc-card` through `.doc-card-actions`) with:

```css
/* Inline document cards: permission prompts + generated-file rows */
.doc-card {
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  margin: 4px 0;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--panel-2) 80%, transparent);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-height: 0;
}
.doc-card.doc-file {
  cursor: default;
}
.doc-card-icon {
  flex-shrink: 0;
  font-size: 18px;
  line-height: 1;
}
.doc-card-body {
  flex: 1;
  min-width: 0;
}
.doc-card-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-card-sub {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-card-actions {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: 8px;
  flex-shrink: 0;
  position: relative;
}
.doc-open {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--panel);
}
.doc-open-main,
.doc-open-chevron {
  font-size: 12px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
}
.doc-open-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-right: 1px solid var(--border);
}
.doc-open-main:hover,
.doc-open-chevron:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.doc-open-chevron {
  padding: 4px 6px;
  color: var(--muted);
}
.doc-open-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 40;
  min-width: 180px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px color-mix(in srgb, #000 35%, transparent);
}
.doc-open-menu.hidden {
  display: none;
}
.doc-open-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  text-align: left;
  font-size: 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text);
  cursor: pointer;
}
.doc-open-item:hover {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.doc-open-item:disabled {
  opacity: 0.45;
  cursor: default;
}
```

- [ ] **Step 2: Replace `.perm-card` block**

Replace the “Permission prompt” section (from `.perm-card` through `.perm-card.denied`) with:

```css
/* ===== Permission prompt (compact full-width request) ================== */
.perm-card {
  align-self: stretch;
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  margin: 4px 0;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--warn) 8%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--border));
  border-left: 3px solid var(--warn);
  border-radius: 8px;
}
.perm-ask {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 4px;
}
.perm-desc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--muted);
}
.perm-ext {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--accent-contrast);
  background: var(--accent);
  border-radius: 4px;
}
.perm-file {
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.perm-where {
  font-size: 11.5px;
  color: var(--muted);
}
.perm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.perm-result {
  margin-top: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}
.perm-card.denied {
  padding: 6px 10px;
  background: transparent;
  border-color: var(--border);
  border-left-color: var(--muted);
}
.perm-card.denied .perm-ask,
.perm-card.denied .perm-where {
  display: none;
}
.perm-card.denied .perm-desc {
  margin: 0;
}
```

- [ ] **Step 3: Visual smoke (optional during implementation)**

After later tasks rebuild the app, confirm in DevTools that `.perm-card` and `.doc-card` have computed `width` matching `#messages` content box (not ~70–78% inset).

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/renderer/styles.css
git commit -m "$(cat <<'EOF'
style: full-width compact permission and file card rows

EOF
)"
```

---

### Task 3: Three-row permission prompt lifecycle

**Files:**
- Modify: `app/src/renderer/js/file-cards.ts` (`showDocConfirm` and helpers)

**Interfaces:**
- Consumes: `node`, `el`, `state`, `currentProjectId()`; `reply(token, ok)` from `chat.ts`
- Produces: updated `showDocConfirm({ token, args }, reply)` — Deny collapses in place; Allow removes the card then calls `reply(token, true)`

- [ ] **Step 1: Rewrite `showDocConfirm`**

Replace `showDocConfirm` in `app/src/renderer/js/file-cards.ts` with:

```typescript
export function showDocConfirm({ token, args }, reply) {
  const wrap = messagesEl();
  const fmt = String(args.format || "").toLowerCase().replace(/^\./, "");
  const fname = `${args.title || "document"}.${fmt || "pdf"}`;

  const card = node("div", "perm-card");
  card.dataset.permToken = String(token);

  card.appendChild(node("div", "perm-ask", "Create a file in your folder?"));

  const desc = node("div", "perm-desc");
  desc.appendChild(node("span", "perm-ext", (fmt || "pdf").toUpperCase()));
  desc.appendChild(node("span", "perm-file", fname));
  desc.appendChild(
    node(
      "span",
      "perm-where",
      currentProjectId()
        ? "· Writes to this project's storage folder"
        : "· Writes to your Documents/AnyLM folder"
    )
  );
  card.appendChild(desc);

  const actions = node("div", "perm-actions");
  const deny = node("button", "ghost small", "Deny");
  const allow = node("button", "primary small", "Allow");

  deny.onclick = () => {
    reply(token, false);
    actions.remove();
    card.classList.add("denied");
    card.appendChild(node("div", "perm-result", "Denied"));
  };

  allow.onclick = () => {
    card.remove();
    reply(token, true);
  };

  actions.append(deny, allow);
  card.appendChild(actions);

  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}
```

Remove unused classes from the old implementation (`perm-head`, `perm-badge`, `perm-tool`, `perm-title`, `perm-target`). Keep `messagesEl` / `currentProjectId` / `ICONS` as needed for Task 4.

- [ ] **Step 2: Typecheck**

Run:

```bash
cd app && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Manual check (Deny path)**

1. `cd app && bun run start`
2. Enable tools, ask for a PDF in a project chat.
3. Confirm permission is full-width, three rows.
4. Click **Deny** → buttons gone, “Denied” visible, filename/ext still visible, no file card.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/renderer/js/file-cards.ts
git commit -m "$(cat <<'EOF'
feat: compact full-width document permission with deny collapse

EOF
)"
```

---

### Task 4: Finished-file row with Open with + dropdown

**Files:**
- Modify: `app/src/renderer/js/file-cards.ts` (`showFileCard` and small helpers)

**Interfaces:**
- Consumes: `window.api.pfilesOpen`, `window.api.pfilesShow`, `openFileViewer(projectId, name)`, `currentProjectId()`, CSS from Task 2
- Produces: updated `showFileCard({ name, ext, dir })` with split Open-with control

- [ ] **Step 1: Add type-label helper and rewrite `showFileCard`**

In `app/src/renderer/js/file-cards.ts`, add:

```typescript
const TYPE_LINE = {
  ".pdf": "Document · PDF",
  ".docx": "Document · DOCX",
  ".pptx": "Presentation · PPTX",
  ".xlsx": "Spreadsheet · XLSX",
  ".md": "Document · MD",
};

function closeOpenMenus(except?: Element | null) {
  for (const m of document.querySelectorAll(".doc-open-menu")) {
    if (except && m === except) continue;
    m.classList.add("hidden");
  }
}
```

Replace `showFileCard` with:

```typescript
export function showFileCard({ name, ext, dir }) {
  const wrap = messagesEl();
  const projectId = currentProjectId();

  const card = node("div", "doc-card doc-file");
  card.appendChild(node("div", "doc-card-icon", ICONS[ext] || "📄"));

  const body = node("div", "doc-card-body");
  body.appendChild(node("div", "doc-card-name", name));
  body.appendChild(node("div", "doc-card-sub", TYPE_LINE[ext] || String(ext || "").replace(/^\./, "").toUpperCase()));
  card.appendChild(body);

  const actions = node("div", "doc-card-actions");
  const split = node("div", "doc-open");
  const main = node("button", "doc-open-main", "Open with Default app");
  const chevron = node("button", "doc-open-chevron", "▾");
  chevron.setAttribute("aria-label", "More open options");
  const menu = node("div", "doc-open-menu hidden");

  const openDefault = () => {
    closeOpenMenus();
    if (dir) window.api.pfilesOpen(dir, name);
  };
  const preview = () => {
    closeOpenMenus();
    if (projectId) openFileViewer(projectId, name);
  };
  const showFolder = () => {
    closeOpenMenus();
    if (dir) window.api.pfilesShow(dir, name);
  };

  const itemDefault = node("button", "doc-open-item", "Open with Default app");
  itemDefault.onclick = (e) => {
    e.stopPropagation();
    openDefault();
  };
  menu.appendChild(itemDefault);

  if (projectId) {
    const itemPreview = node("button", "doc-open-item", "Preview in AnyLM");
    itemPreview.onclick = (e) => {
      e.stopPropagation();
      preview();
    };
    menu.appendChild(itemPreview);
  }

  const itemFolder = node("button", "doc-open-item", "Show in folder");
  itemFolder.onclick = (e) => {
    e.stopPropagation();
    showFolder();
  };
  menu.appendChild(itemFolder);

  main.onclick = (e) => {
    e.stopPropagation();
    openDefault();
  };
  chevron.onclick = (e) => {
    e.stopPropagation();
    const opening = menu.classList.contains("hidden");
    closeOpenMenus();
    if (opening) menu.classList.remove("hidden");
  };

  split.append(main, chevron);
  actions.append(split, menu);
  card.appendChild(actions);

  // One document-level listener is enough; guard against duplicates.
  if (!window.__anylmDocOpenMenuBound) {
    window.__anylmDocOpenMenuBound = true;
    document.addEventListener("click", () => closeOpenMenus());
  }

  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}
```

If `window.__anylmDocOpenMenuBound` fails typecheck, use a module-level `let openMenuBound = false` instead of a `window` flag (preferred):

```typescript
let openMenuBound = false;
// ...
if (!openMenuBound) {
  openMenuBound = true;
  document.addEventListener("click", () => closeOpenMenus());
}
```

Do **not** attach a whole-card `onclick` that opens preview (actions own navigation).

- [ ] **Step 2: Typecheck**

Run:

```bash
cd app && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Manual check (Allow + Open with)**

1. Ask for a PDF with tools enabled.
2. Click **Allow** → permission node disappears.
3. When generation finishes → full-width compact file row appears.
4. Primary **Open with Default app** opens the OS default handler.
5. Chevron → **Show in folder** reveals Finder/Explorer; in a project, **Preview in AnyLM** opens the in-app viewer.
6. Standalone (no project) chat: no Preview item; Open with + Show in folder still work.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add app/src/renderer/js/file-cards.ts
git commit -m "$(cat <<'EOF'
feat: open generated documents with default app split control

EOF
)"
```

---

### Task 5: End-to-end verification + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-doc-permission-file-card-design.md` (status line only)
- Verify: no required change to `app/src/renderer/js/chat.ts` (wiring already calls `showDocConfirm` / `showFileCard`)

**Interfaces:**
- Consumes: Tasks 1–4 deliverables
- Produces: checklist pass; spec status → Implemented

- [ ] **Step 1: Confirm chat wiring**

Open `app/src/renderer/js/chat.ts` and confirm these lines remain (no duplicate permission nodes, no old click-only assumptions):

```typescript
if (tool.name === "generate_document") {
  showDocConfirm({ token, args }, (t, approved) => window.api.replyToolConfirm(t, approved));
  return;
}
// ...
window.api.onFileGenerated(({ name, ext, dir }) => showFileCard({ name, ext, dir }));
```

If something still references removed CSS classes or old click behavior, fix in `file-cards.ts` only.

- [ ] **Step 2: Full typecheck + build**

```bash
cd app && bun run typecheck && bun run build
```

Expected: both succeed.

- [ ] **Step 3: Manual matrix**

| Case | Expect |
|------|--------|
| Project + PDF → Deny | Collapsed “Denied”, no file row |
| Project + PDF → Allow | Permission gone → file row → Open / Preview / Show in folder |
| Standalone + DOCX → Allow | No Preview item; Open + Show in folder work |
| Project + XLSX / PPTX / MD → Allow | File row + open paths work |
| Resize messages column | Both blocks stay full width within padding |

- [ ] **Step 4: Mark spec implemented**

In `docs/superpowers/specs/2026-08-05-doc-permission-file-card-design.md`, change:

```markdown
**Status:** Approved (pending implementation plan)
```

to:

```markdown
**Status:** Implemented
```

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add docs/superpowers/specs/2026-08-05-doc-permission-file-card-design.md app/
git commit -m "$(cat <<'EOF'
feat: document permission row and open-with file card

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Full-width 3-row permission | 2, 3 |
| Deny → collapsed “Denied”, no file card | 3 |
| Allow → remove permission; file row on generate | 3, 4 |
| Compact full-width Open with + dropdown | 2, 4 |
| Allowlisted `shell.openPath` | 1 |
| Preview in project / Show in folder | 4 |
| No OS app picker; label “Default app” | 4 |
| Other tools keep modal | unchanged (`chat.ts`) |

## Placeholder scan

No TBD / “add error handling later” / “similar to Task N” steps. Commit steps are gated on user request per Global Constraints.
