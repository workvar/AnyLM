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

function list() {
  return readAll().map(({ id, name, model, contexts }) => ({
    id,
    name,
    model,
    contextCount: (contexts || []).length,
  }));
}

function get(pid) {
  return readAll().find((p) => p.id === pid) || null;
}

// Renderer-safe project: drop chunk vectors and raw chunk text (can be large).
function getPublic(pid) {
  const p = get(pid);
  if (!p) return null;
  return {
    ...p,
    contexts: (p.contexts || []).map((c) => ({
      id: c.id,
      name: c.name,
      chars: c.chars,
      summary: c.summary,
      chunkCount: (c.chunks || []).length,
      embedded: !!(c.chunks || []).some((ch) => Array.isArray(ch.vector)),
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

module.exports = {
  list,
  get,
  getPublic,
  create,
  update,
  remove,
  addContext,
  removeContext,
  newId: id,
};
