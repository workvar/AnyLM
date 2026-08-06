import { execFile } from "child_process";
import { promisify } from "util";
import * as os from "os";

export type OpenApp = { id: string; name: string };

export function dedupeApps(apps: OpenApp[]): OpenApp[] {
  const seen = new Set<string>();
  const out: OpenApp[] = [];
  for (const app of apps) {
    if (seen.has(app.id)) continue;
    seen.add(app.id);
    out.push(app);
  }
  return out;
}

export function sortApps(apps: OpenApp[]): OpenApp[] {
  return [...apps].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

const execFileAsync = promisify(execFile);

const MAC_SWIFT = `
import Foundation
import CoreServices

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath) as CFURL

if let defaultURL = LSCopyDefaultApplicationURLForURL(fileURL, .all, nil)?.takeRetainedValue() as URL? {
  let bundle = Bundle(url: defaultURL)
  let name = bundle?.object(forInfoDictionaryKey: "CFBundleName") as? String
    ?? bundle?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
    ?? defaultURL.deletingPathExtension().lastPathComponent
  let id = bundle?.bundleIdentifier ?? defaultURL.path
  print("DEFAULT\\t\\(id)\\t\\(name)")
}

if let appURLs = LSCopyApplicationURLsForURL(fileURL, .all, nil)?.takeRetainedValue() as? [URL] {
  for url in appURLs {
    let bundle = Bundle(url: url)
    let name = bundle?.object(forInfoDictionaryKey: "CFBundleName") as? String
      ?? bundle?.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
      ?? url.deletingPathExtension().lastPathComponent
    let id = bundle?.bundleIdentifier ?? url.path
    print("APP\\t\\(id)\\t\\(name)")
  }
}
`;

function parseMacApps(stdout: string): { defaultApp: OpenApp | null; apps: OpenApp[] } {
  let defaultApp: OpenApp | null = null;
  const apps: OpenApp[] = [];
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length < 3) continue;
    const [kind, id, name] = parts;
    const app = { id, name };
    if (kind === "DEFAULT") defaultApp = app;
    else if (kind === "APP") apps.push(app);
  }
  return { defaultApp, apps: sortApps(dedupeApps(apps)) };
}

async function macAppsFor(filePath: string): Promise<{ defaultApp: OpenApp | null; apps: OpenApp[] }> {
  try {
    const { stdout } = await execFileAsync("swift", ["-e", MAC_SWIFT, filePath], {
      timeout: 8000,
    });
    return parseMacApps(String(stdout || ""));
  } catch {
    return { defaultApp: null, apps: [] };
  }
}

async function macOpenWith(filePath: string, appId: string): Promise<boolean> {
  try {
    const args = appId.includes(".") ? ["-b", appId, filePath] : ["-a", appId, filePath];
    await execFileAsync("open", args);
    return true;
  } catch {
    return false;
  }
}

export async function appsFor(
  dir: string,
  name: string
): Promise<{ defaultApp: OpenApp | null; apps: OpenApp[] }> {
  const projectFiles = require("./project-files") as typeof import("./project-files");
  const filePath = projectFiles.resolveGenerated(dir, name);
  if (!filePath) return { defaultApp: null, apps: [] };

  if (os.platform() === "darwin") return macAppsFor(filePath);
  return { defaultApp: null, apps: [] };
}

export async function openWith(dir: string, name: string, appId: string): Promise<boolean> {
  const projectFiles = require("./project-files") as typeof import("./project-files");
  const filePath = projectFiles.resolveGenerated(dir, name);
  if (!filePath) return false;

  if (os.platform() === "darwin" && appId) {
    if (await macOpenWith(filePath, appId)) return true;
  }

  const { shell } = require("electron") as typeof import("electron");
  const err = await shell.openPath(filePath);
  return !err;
}
