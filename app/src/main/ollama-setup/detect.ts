import * as path from "path";

export type OllamaSetupState = "running" | "installed" | "missing";

export type OllamaInstall =
  | { kind: "binary"; path: string }
  | { kind: "app"; path: string };

export function fallbackPaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === "darwin") {
    return ["/opt/homebrew/bin/ollama", "/usr/local/bin/ollama", "/Applications/Ollama.app"];
  }
  if (platform === "linux") {
    return ["/usr/bin/ollama", "/usr/local/bin/ollama"];
  }
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || "";
    const pf = env.ProgramFiles || "C:\\Program Files";
    const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    return [
      local ? path.win32.join(local, "Programs", "Ollama", "ollama.exe") : "",
      path.win32.join(pf, "Ollama", "ollama.exe"),
      path.win32.join(pf86, "Ollama", "ollama.exe"),
    ].filter(Boolean);
  }
  return [];
}

export function findOllamaBinary(opts: {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  pathEnv: string;
  exists: (p: string) => boolean;
  which: () => string | null;
}): OllamaInstall | null {
  const fromWhich = opts.which();
  if (fromWhich) return { kind: "binary", path: fromWhich };
  for (const p of fallbackPaths(opts.platform, opts.env)) {
    if (!opts.exists(p)) continue;
    if (p.endsWith(".app")) return { kind: "app", path: p };
    return { kind: "binary", path: p };
  }
  return null;
}

export function resolveSetupState(
  reachable: boolean,
  install: OllamaInstall | null
): OllamaSetupState {
  if (reachable) return "running";
  if (install) return "installed";
  return "missing";
}
