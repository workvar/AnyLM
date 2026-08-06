// Working folder: a user-picked directory that the model's file tools are
// sandboxed to. Persisted in userData/anylm-workspace.json.
import { app, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";

function filePath() {
  return path.join(app.getPath("userData"), "anylm-workspace.json");
}

function get() {
  try {
    const { root } = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    return root && fs.existsSync(root) ? root : null;
  } catch {
    return null;
  }
}

function set(root) {
  fs.writeFileSync(filePath(), JSON.stringify({ root }, null, 2));
  return root;
}

function clear() {
  try {
    fs.unlinkSync(filePath());
  } catch {}
}

async function pick() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Choose a working folder",
    buttonLabel: "Use folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || !filePaths.length) return get();
  return set(filePaths[0]);
}

// Resolve a model-supplied path so it stays inside the working folder.
// Relative paths resolve against the root; absolute paths must be within it.
function resolveInside(p) {
  const root = get();
  if (!root)
    throw new Error(
      "No working folder selected. Ask the user to pick one with the folder button in the chat bar."
    );
  const abs = path.resolve(root, String(p || "."));
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`Path is outside the working folder (${root})`);
  return abs;
}

// System prompt block teaching the model how to work in the folder.
function promptBlock() {
  const root = get();
  if (!root) return "";
  return [
    `Working folder: ${root}`,
    "File tools (read_file, list_directory, write_file, create_directory, move_path, copy_path, delete_path, find_files) accept paths relative to this folder and cannot write outside it.",
    "To clean or organize: list_directory first, plan groupings, create_directory for categories, then move_path files into them. Prefer moving over deleting; delete_path sends items to the system trash.",
    "To write code: create files with write_file, keep modules small, and read existing files before editing them.",
    "If you need facts you don't know (APIs, library versions, current data), use web_search before answering.",
  ].join("\n");
}

export { get, set, clear, pick, resolveInside, promptBlock };

