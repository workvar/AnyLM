// System-prompt block describing the folder the file tools work in, plus a
// shallow listing of what is already there. The listing is what lets the model
// read existing files for context instead of guessing filenames.
import * as fs from "fs";
import * as path from "path";
import * as contextRoot from "./context-root";

const SKIP = new Set(["node_modules", ".git", ".venv", "__pycache__", "dist", "build", ".DS_Store"]);
const MAX_ENTRIES = 40;

/** Top-level entries of `dir`, folders first, capped. */
function outline(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: string[] = [];
  const files: string[] = [];
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
    if (e.isDirectory()) dirs.push(`${e.name}/`);
    else files.push(e.name);
  }
  return [...dirs.sort(), ...files.sort()].slice(0, MAX_ENTRIES);
}

function promptBlock(): string {
  const { root, kind, name } = contextRoot.describe();
  if (!root) return "";
  const where =
    kind === "project"
      ? `Project folder${name ? ` for "${name}"` : ""}: ${root}`
      : `Working folder: ${root}`;
  const listed = outline(root);
  const lines = [
    where,
    "This folder is your context. File tools (read_file, list_directory, find_files, write_file, " +
      "create_directory, move_path, copy_path, delete_path) take paths relative to it and cannot " +
      "reach outside it. create_project makes a new project with its own folder.",
    "Read before you write: open the files below with read_file (or list_directory on a subfolder) " +
      "so new work matches what is already there, and never overwrite a file you have not read.",
    "To organize: list_directory first, plan groupings, create_directory for categories, then " +
      "move_path files into them. Prefer moving over deleting; delete_path uses the system trash.",
    "To write code: create files with write_file and keep modules small.",
  ];
  lines.push(
    listed.length
      ? `Already in this folder (${path.basename(root)}):\n${listed.map((l) => `- ${l}`).join("\n")}`
      : "This folder is currently empty."
  );
  return lines.join("\n");
}

export { promptBlock, outline };
