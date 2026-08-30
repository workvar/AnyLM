// The folder the model's file tools operate in ("the context").
//
// Precedence: the active project's own folder, then the user-picked working
// folder. Before this existed, file tools always used the global working
// folder, so a chat inside a project could not write into that project.
import * as fs from "fs";
import * as path from "path";
import * as workspace from "./workspace";

type RootKind = "project" | "workspace" | "none";

let projectRoot: string | null = null;
let projectName: string | null = null;
// Which turn last set the root. Two chats in different projects can run at
// once, so a turn re-claims the root before each tool call; the owner check is
// what stops that from undoing an override made earlier in the same turn.
let owner: string | null = null;

/** Point the root at a turn's project folder (null when the chat has none). */
function claim(turnId: string, root: string | null, name?: string | null): void {
  if (owner === turnId) return;
  owner = turnId;
  projectRoot = root || null;
  projectName = root ? name || null : null;
}

/** Move the root mid-turn (create_project), keeping the current owner. */
function setProject(root: string | null, name?: string | null): void {
  projectRoot = root || null;
  projectName = root ? name || null : null;
}

function get(): string | null {
  if (projectRoot && fs.existsSync(projectRoot)) return projectRoot;
  return workspace.get();
}

function kind(): RootKind {
  if (projectRoot && fs.existsSync(projectRoot)) return "project";
  return workspace.get() ? "workspace" : "none";
}

function describe(): { root: string | null; kind: RootKind; name: string | null } {
  return { root: get(), kind: kind(), name: projectName };
}

// Resolve a model-supplied path so it stays inside the context folder.
// Relative paths resolve against the root; absolute paths must be within it.
function resolveInside(p: string): string {
  const root = get();
  if (!root)
    throw new Error(
      "No folder to work in. Ask the user to open a project or pick a working folder " +
        "with the folder button in the chat bar."
    );
  const abs = path.resolve(root, String(p || "."));
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error(`Path is outside the working folder (${root})`);
  return abs;
}

export { claim, setProject, get, kind, describe, resolveInside };
