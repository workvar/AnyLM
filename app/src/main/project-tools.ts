import { resolveUseTools } from "./use-tools";

/**
 * The project default seeds NEW threads only. Existing threads keep whatever
 * the user chose in them, so flipping the toggle in one thread never silently
 * rewrites the others. Threads with no stored value are backfilled from the
 * default so every thread ends up with an explicit boolean.
 */
export function applyProjectDefaultUseTools(project: Project, enabled: boolean): Project {
  const on = !!enabled;
  project.defaultUseTools = on;
  project.threads = project.threads || [];
  for (const t of project.threads) {
    t.useTools = resolveUseTools(t.useTools, on);
  }
  return project;
}
