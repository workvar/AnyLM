// File-operation tools, sandboxed to the working folder (../workspace).
// Every function returns a string for the model.
const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const workspace = require("../workspace");

const SKIP = new Set(["node_modules", ".git", ".venv", "__pycache__", "dist", "build"]);
const MAX_HITS = 200;
const MAX_DEPTH = 8;

// Reads may use absolute paths anywhere; relative paths need the workspace.
function resolveRead(p) {
  const str = String(p || "");
  return path.isAbsolute(str) ? str : workspace.resolveInside(str);
}

function writeFile(args) {
  const abs = workspace.resolveInside(args.path);
  const content = String(args.content ?? "");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return `Wrote ${Buffer.byteLength(content)} bytes to ${args.path}`;
}

function createDirectory(args) {
  fs.mkdirSync(workspace.resolveInside(args.path), { recursive: true });
  return `Created directory ${args.path}`;
}

function movePath(args) {
  const src = workspace.resolveInside(args.from);
  const dest = workspace.resolveInside(args.to);
  if (!fs.existsSync(src)) return `Error: ${args.from} does not exist`;
  if (fs.existsSync(dest)) return `Error: ${args.to} already exists`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  return `Moved ${args.from} to ${args.to}`;
}

function copyPath(args) {
  const src = workspace.resolveInside(args.from);
  const dest = workspace.resolveInside(args.to);
  if (!fs.existsSync(src)) return `Error: ${args.from} does not exist`;
  if (fs.existsSync(dest)) return `Error: ${args.to} already exists`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  return `Copied ${args.from} to ${args.to}`;
}

async function deletePath(args) {
  const abs = workspace.resolveInside(args.path);
  if (abs === workspace.get()) return "Error: refusing to delete the working folder itself";
  if (!fs.existsSync(abs)) return `Error: ${args.path} does not exist`;
  await shell.trashItem(abs);
  return `Moved ${args.path} to the system trash`;
}

// Directory listing with size and modified date, to inform organizing.
function listDirectory(args) {
  const abs = resolveRead(args.path || ".");
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const lines = entries.map((e) => {
    if (e.isDirectory()) return `${e.name}/`;
    try {
      const st = fs.statSync(path.join(abs, e.name));
      return `${e.name}  (${formatSize(st.size)}, modified ${st.mtime.toISOString().slice(0, 10)})`;
    } catch {
      return e.name;
    }
  });
  return lines.join("\n") || "(empty)";
}

// Recursive filename search: substring, or glob when the query contains "*".
function findFiles(args) {
  const root = workspace.resolveInside(args.path || ".");
  const q = String(args.query || "").toLowerCase();
  if (!q) return "Error: query required";
  const rx = q.includes("*")
    ? new RegExp("^" + q.split("*").map(escapeRx).join(".*") + "$")
    : null;
  const hits = [];
  walk(root, 0, (abs, name) => {
    const n = name.toLowerCase();
    if (rx ? rx.test(n) : n.includes(q)) hits.push(path.relative(workspace.get(), abs));
    return hits.length < MAX_HITS;
  });
  return hits.length ? hits.join("\n") : "No matches";
}

function walk(dir, depth, visit) {
  if (depth > MAX_DEPTH) return true;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return true;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (!visit(abs, e.name)) return false;
    if (e.isDirectory() && !walk(abs, depth + 1, visit)) return false;
  }
  return true;
}

function escapeRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

module.exports = {
  resolveRead,
  writeFile,
  createDirectory,
  movePath,
  copyPath,
  deletePath,
  listDirectory,
  findFiles,
};
