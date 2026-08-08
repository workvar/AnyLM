import * as fs from "fs";
import * as path from "path";

export const ARTIFACT_EXTS = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".md"]);

export function isUnderAllowedRoot(absFile: string, roots: string[]): boolean {
  const target = path.resolve(absFile);
  return roots.some((root) => {
    const r = path.resolve(root);
    return target === r || target.startsWith(r + path.sep);
  });
}

export function listArtifactRoots(
  projects: Array<{ id: string; name: string; folderPath: string }>,
  generatedDir: string
): ArtifactRoot[] {
  const roots: ArtifactRoot[] = [
    { id: "generated", label: "Generated", dir: generatedDir, kind: "generated" },
  ];
  for (const p of projects) {
    if (!p.folderPath) continue;
    roots.push({ id: p.id, label: p.name || "Untitled project", dir: p.folderPath, kind: "project" });
  }
  return roots;
}

export function artifactAllowedRoots(
  projects: Array<{ id: string; name: string; folderPath: string }>,
  generatedDir: string
): string[] {
  return listArtifactRoots(projects, generatedDir).map((r) => path.resolve(r.dir));
}

export function listArtifactFiles(dir: string, allowedRoots: string[]): ProjectFileEntry[] {
  const root = path.resolve(dir);
  if (!allowedRoots.some((r) => path.resolve(r) === root)) return [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: ProjectFileEntry[] = [];
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith(".")) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!ARTIFACT_EXTS.has(ext)) continue;
    try {
      const fp = path.join(root, e.name);
      const st = fs.statSync(fp);
      files.push({ name: e.name, ext, size: st.size, mtime: st.mtime.toISOString() });
    } catch {}
  }
  files.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return files;
}

export function deleteArtifact(dir: string, name: string, allowedRoots: string[]): boolean {
  const root = allowedRoots.find((allowed) => path.resolve(allowed) === path.resolve(dir));
  const fileName = String(name || "");
  if (!root || path.basename(fileName) !== fileName || !ARTIFACT_EXTS.has(path.extname(fileName).toLowerCase())) {
    return false;
  }
  const fp = path.resolve(root, fileName);
  try {
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return false;
    fs.unlinkSync(fp);
    return true;
  } catch {
    return false;
  }
}
