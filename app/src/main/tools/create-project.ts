// The create_project tool: makes a real AnyLM project with its own folder on
// disk, then points the file tools at it so the rest of the turn writes there.
import * as store from "../store";
import * as projectFiles from "../project-files";
import * as contextRoot from "../context-root";

type Ctx = {
  model?: string | null;
  onProjectCreated?: (project: { id: string; name: string; folderPath: string | null }) => void;
};

function createProject(args: Record<string, unknown>, ctx: Ctx = {}): string {
  const name = String(args.name || "").trim();
  if (!name) return "Error: name required";

  const existing = store.list().find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const folder = projectFiles.ensureFolder(store.get(existing.id));
    contextRoot.setProject(folder, existing.name);
    return `A project named "${name}" already exists; working in its folder ${folder}.`;
  }

  const project = store.create({
    name,
    instructions: String(args.instructions || "").trim(),
    model: ctx.model || undefined,
  });
  const folder = projectFiles.ensureFolder(project);
  contextRoot.setProject(folder, project.name);
  ctx.onProjectCreated?.({ id: project.id, name: project.name, folderPath: folder });
  return folder
    ? `Created project "${project.name}". Its folder is ${folder} and file tools now write there.`
    : `Created project "${project.name}", but its folder could not be created.`;
}

export { createProject };
