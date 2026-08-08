import type { OllamaInstall } from "./detect";

export type StartPlan = { command: string; args: string[]; cwd?: string };

export function planStart(
  platform: NodeJS.Platform,
  install: OllamaInstall | null
): StartPlan | null {
  if (!install) return null;
  if (platform === "darwin" && install.kind === "app") {
    return { command: "open", args: ["-a", "Ollama"] };
  }
  if (platform === "win32") {
    // GUI/app entry: empty args starts the tray app which serves locally.
    return { command: install.path, args: [] };
  }
  return { command: install.path, args: ["serve"] };
}
