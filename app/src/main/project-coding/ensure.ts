import * as path from "path";
import { slugFromText } from "./slug";

export function resolveAutoProjectPath(
  home: string,
  slug: string,
  exists: (p: string) => boolean
): string {
  const base = path.join(home, "AnyLM-Projects");
  const primary = path.join(base, slug);
  if (!exists(primary)) return primary;
  for (let i = 2; i < 1000; i++) {
    const candidate = path.join(base, `${slug}-${i}`);
    if (!exists(candidate)) return candidate;
  }
  return path.join(base, `${slug}-${Date.now()}`);
}

export function ensureWorkspaceForCoding(deps: {
  get: () => string | null;
  set: (root: string) => string;
  home: string;
  mkdir: (p: string) => void;
  exists: (p: string) => boolean;
  text: string;
}): { root: string; created: boolean } {
  const existing = deps.get();
  if (existing) return { root: existing, created: false };
  const base = path.join(deps.home, "AnyLM-Projects");
  deps.mkdir(base);
  const dir = resolveAutoProjectPath(deps.home, slugFromText(deps.text), deps.exists);
  deps.mkdir(dir);
  deps.set(dir);
  return { root: dir, created: true };
}
