export function applyProjectDefaultUseTools(project: Project, enabled: boolean): Project {
  const on = !!enabled;
  project.defaultUseTools = on;
  project.threads = project.threads || [];
  for (const t of project.threads) {
    t.useTools = on;
  }
  return project;
}
