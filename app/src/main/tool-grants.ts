// Standing permissions for tools that would otherwise ask every time.
//
// Three scopes answer a confirmation prompt:
//   "once"    - run this call only (nothing stored)
//   "session" - remember until the app quits (in-memory)
//   "project" - remember for this project (userData/anylm-tool-grants.json)
// A grant only ever suppresses the prompt; it never enables a disabled tool.
import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

type Scope = "once" | "session" | "project";
type Store = { projects: Record<string, string[]> };

const GLOBAL_KEY = "__global__";
const session = new Set<string>(); // "<projectKey>:<toolName>"

function filePath(): string {
  return path.join(app.getPath("userData"), "anylm-tool-grants.json");
}

function read(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    return { projects: raw?.projects && typeof raw.projects === "object" ? raw.projects : {} };
  } catch {
    return { projects: {} };
  }
}

function write(store: Store): void {
  try {
    fs.writeFileSync(filePath(), JSON.stringify(store, null, 2));
  } catch (e) {
    console.warn(`[grants] write failed: ${(e as Error).message}`);
  }
}

function keyOf(projectId: string | null | undefined): string {
  return projectId || GLOBAL_KEY;
}

function isGranted(projectId: string | null | undefined, tool: string): boolean {
  const key = keyOf(projectId);
  if (session.has(`${key}:${tool}`)) return true;
  return (read().projects[key] || []).includes(tool);
}

function grant(projectId: string | null | undefined, tool: string, scope: Scope): void {
  if (!tool || scope === "once") return;
  const key = keyOf(projectId);
  if (scope === "session") {
    session.add(`${key}:${tool}`);
    return;
  }
  const store = read();
  const list = store.projects[key] || [];
  if (!list.includes(tool)) store.projects[key] = [...list, tool];
  write(store);
}

/** Everything currently remembered for a project (for a settings screen). */
function listFor(projectId: string | null | undefined): { session: string[]; project: string[] } {
  const key = keyOf(projectId);
  return {
    session: [...session].filter((s) => s.startsWith(`${key}:`)).map((s) => s.slice(key.length + 1)),
    project: read().projects[key] || [],
  };
}

function revokeAll(projectId: string | null | undefined): void {
  const key = keyOf(projectId);
  for (const s of [...session]) if (s.startsWith(`${key}:`)) session.delete(s);
  const store = read();
  delete store.projects[key];
  write(store);
}

export { isGranted, grant, listFor, revokeAll };
export type { Scope };
