// Standalone "general" chats, persisted as JSON in userData. Separate from
// projects: these are independent conversations (no per-project context).
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

function filePath() {
  return path.join(app.getPath("userData"), "llmeter-chats.json");
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(filePath(), "utf8"));
  } catch {
    return [];
  }
}

function writeAll(chats) {
  fs.writeFileSync(filePath(), JSON.stringify(chats, null, 2));
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Sidebar summaries, most-recently-updated first.
function list() {
  return readAll()
    .filter((c) => !c.archived)
    .map(({ id, title, model, messages, updatedAt }) => ({
      id,
      kind: "chat",
      title,
      model,
      msgCount: (messages || []).length,
      updatedAt,
    }))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

function get(cid) {
  return readAll().find((c) => c.id === cid) || null;
}

function create({ title, model } = {}) {
  const all = readAll();
  const now = new Date().toISOString();
  const chat = {
    id: id(),
    title: title || "New chat",
    model: model || "",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  all.push(chat);
  writeAll(all);
  return chat;
}

function update(cid, patch) {
  const all = readAll();
  const i = all.findIndex((c) => c.id === cid);
  if (i === -1) return null;
  all[i] = { ...all[i], ...patch, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[i];
}

function remove(cid) {
  writeAll(readAll().filter((c) => c.id !== cid));
  return true;
}

module.exports = { list, get, create, update, remove };
