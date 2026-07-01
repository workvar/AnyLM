// Project persistence as a single JSON file in Electron's userData dir.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

function filePath() {
  return path.join(app.getPath("userData"), "llmeter-projects.json");
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(filePath(), "utf8"));
  } catch {
    return [];
  }
}

function writeAll(projects) {
  fs.writeFileSync(filePath(), JSON.stringify(projects, null, 2));
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function latestTime(p) {
  const times = (p.threads || []).map((t) => t.updatedAt).filter(Boolean);
  if (p.createdAt) times.push(p.createdAt);
  return times.sort().slice(-1)[0] || "";
}

function list() {
  return readAll().map((p) => ({
    id: p.id,
    name: p.name,
    model: p.model,
    archived: !!p.archived,
    contextCount: (p.contexts || []).length,
    chatCount: (p.threads || []).length,
    updatedAt: latestTime(p),
  }));
}

// Flattened, most-recent-first project threads for the global recents list.
// Skips archived projects and archived threads.
function recentThreads() {
  const out = [];
  for (const p of readAll()) {
    if (p.archived) continue;
    for (const t of p.threads || []) {
      if (t.archived) continue;
      out.push({
        kind: "thread",
        id: t.id,
        projectId: p.id,
        projectName: p.name,
        title: t.title,
        model: p.model,
        msgCount: (t.messages || []).length,
        updatedAt: t.updatedAt,
      });
    }
  }
  return out;
}

function get(pid) {
  return readAll().find((p) => p.id === pid) || null;
}

// Renderer-safe project: drop chunk vectors and raw chunk text (can be large).
function getPublic(pid) {
  const p = get(pid);
  if (!p) return null;
  // Drop threads (fetched separately) to keep this payload lean.
  const { threads, ...rest } = p;
  return {
    ...rest,
    contexts: (p.contexts || []).map((c) => ({
      id: c.id,
      name: c.name,
      chars: c.chars,
      summary: c.summary,
      // Vectors now live in Chroma; fall back to legacy inline chunks if present.
      chunkCount: c.chunkCount != null ? c.chunkCount : (c.chunks || []).length,
      embedded:
        c.embedded != null
          ? !!c.embedded
          : (c.chunks || []).some((ch) => Array.isArray(ch.vector)),
      embedError: c.embedError || null,
      addedAt: c.addedAt,
    })),
  };
}

function create({ name, instructions, model }) {
  const projects = readAll();
  const project = {
    id: id(),
    name: name || "Untitled project",
    instructions: instructions || "",
    model: model || "",
    contexts: [],
    archived: false,
    // Knowledge flow vs the general store (default: isolated).
    importGeneral: false,
    exportToGeneral: false,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);
  writeAll(projects);
  return project;
}

function update(pid, patch) {
  const projects = readAll();
  const i = projects.findIndex((p) => p.id === pid);
  if (i === -1) return null;
  projects[i] = { ...projects[i], ...patch };
  writeAll(projects);
  return projects[i];
}

function remove(pid) {
  writeAll(readAll().filter((p) => p.id !== pid));
  return true;
}

function addContext(pid, ctx) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return null;
  const entry = { id: id(), addedAt: new Date().toISOString(), ...ctx };
  p.contexts = p.contexts || [];
  p.contexts.push(entry);
  writeAll(projects);
  return entry;
}

function removeContext(pid, cid) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return false;
  p.contexts = (p.contexts || []).filter((c) => c.id !== cid);
  writeAll(projects);
  return true;
}

// --- Per-project chat threads ---
function listThreads(pid) {
  const p = get(pid);
  if (!p) return [];
  return (p.threads || [])
    .filter((t) => !t.archived)
    .map(({ id, title, messages, updatedAt, folderId }) => ({
      id,
      title,
      folderId: folderId || null,
      msgCount: (messages || []).length,
      updatedAt,
    }))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

// --- Subfolders inside a project ---
function listFolders(pid) {
  const p = get(pid);
  return p ? p.folders || [] : [];
}

function addFolder(pid, name) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return null;
  p.folders = p.folders || [];
  const folder = { id: id(), name: name || "New folder", createdAt: new Date().toISOString() };
  p.folders.push(folder);
  writeAll(projects);
  return folder;
}

function renameFolder(pid, fid, name) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return null;
  const f = (p.folders || []).find((x) => x.id === fid);
  if (!f) return null;
  f.name = name || f.name;
  writeAll(projects);
  return f;
}

// Removing a folder keeps its chats; they fall back to ungrouped.
function removeFolder(pid, fid) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return false;
  p.folders = (p.folders || []).filter((x) => x.id !== fid);
  for (const t of p.threads || []) if (t.folderId === fid) t.folderId = null;
  writeAll(projects);
  return true;
}

function getThread(pid, tid) {
  const p = get(pid);
  return p ? (p.threads || []).find((t) => t.id === tid) || null : null;
}

function createThread(pid, { title, folderId } = {}) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return null;
  const now = new Date().toISOString();
  const thread = { id: id(), title: title || "New chat", folderId: folderId || null, messages: [], createdAt: now, updatedAt: now };
  p.threads = p.threads || [];
  p.threads.push(thread);
  writeAll(projects);
  return thread;
}

function updateThread(pid, tid, patch) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return null;
  const t = (p.threads || []).find((x) => x.id === tid);
  if (!t) return null;
  Object.assign(t, patch, { updatedAt: new Date().toISOString() });
  writeAll(projects);
  return t;
}

function deleteThread(pid, tid) {
  const projects = readAll();
  const p = projects.find((x) => x.id === pid);
  if (!p) return false;
  p.threads = (p.threads || []).filter((x) => x.id !== tid);
  writeAll(projects);
  return true;
}

module.exports = {
  list,
  recentThreads,
  listFolders,
  addFolder,
  renameFolder,
  removeFolder,
  get,
  getPublic,
  create,
  update,
  remove,
  addContext,
  removeContext,
  listThreads,
  getThread,
  createThread,
  updateThread,
  deleteThread,
  newId: id,
};
