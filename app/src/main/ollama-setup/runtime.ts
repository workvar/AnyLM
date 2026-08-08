import { execFileSync, spawn } from "child_process";
import { shell } from "electron";
import * as fs from "fs";
import * as ollama from "../ollama";
import { findOllamaBinary } from "./detect";
import { probe, startAndWait } from "./index";
import type { StartPlan } from "./start";

const DOWNLOAD_URL = "https://ollama.com/download";

function whichOllama(): string | null {
  try {
    const command = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(command, ["ollama"], { encoding: "utf8" });
    return output.trim().split(/\r?\n/, 1)[0] || null;
  } catch {
    return null;
  }
}

function findInstall() {
  return findOllamaBinary({
    platform: process.platform,
    env: process.env,
    pathEnv: process.env.PATH || "",
    exists: fs.existsSync,
    which: whichOllama,
  });
}

async function isReachable(): Promise<boolean> {
  return (await ollama.status()).ok;
}

export function spawnPlan(plan: StartPlan): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, {
      ...(plan.cwd ? { cwd: plan.cwd } : {}),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export function probeRuntime() {
  return probe({
    host: ollama.HOST,
    isReachable,
    findInstall,
  });
}

export function startRuntime() {
  return startAndWait({
    platform: process.platform,
    findInstall,
    spawnPlan,
    isReachable,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}

export function openDownload(): Promise<void> {
  return shell.openExternal(DOWNLOAD_URL);
}
