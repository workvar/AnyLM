// Manages the bundled Chroma server as a child process, so users never have to
// install or start Chroma themselves. The Rust single binary ships in the app
// resources (see build.extraResources -> "chroma"); data persists under
// userData/chroma-data.
//
// Fails soft everywhere: if the binary is missing or the server won't start,
// the app keeps running and chroma.js reads/writes simply return empty until a
// server becomes reachable.
import { app } from "electron";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as settings from "./settings";

let proc = null;
let startPromise = null;

function binaryName() {
  return process.platform === "win32" ? "chroma.exe" : "chroma";
}

// Packaged: <resources>/chroma/<bin>. Dev: <app>/vendor/chroma/<bin>.
//
// This file compiles to dist/src/main/, so __dirname is <app>/dist/src/main
// and reaching <app> takes three levels, not one.
function binaryPath(): string | null {
  const name = binaryName();
  const packaged = process.resourcesPath
    ? path.join(process.resourcesPath, "chroma", name)
    : null;
  if (packaged && fs.existsSync(packaged)) return packaged;
  const appRoot = path.join(__dirname, "..", "..", "..");
  const dev = path.join(appRoot, "vendor", "chroma", name);
  return fs.existsSync(dev) ? dev : null;
}

function dataDir() {
  const dir = path.join(app.getPath("userData"), "chroma-data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function heartbeatOK(host, port, ssl) {
  try {
    const res = await fetch(`${ssl ? "https" : "http"}://${host}:${port}/api/v2/heartbeat`);
    return res.ok;
  } catch {
    return false;
  }
}

function waitForReady(host, port, ssl, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await heartbeatOK(host, port, ssl)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 400);
    };
    tick();
  });
}

// Start the bundled server. Idempotent; resolves true once reachable.
function start() {
  if (startPromise) return startPromise;
  startPromise = (async () => {
    const s = settings.read();
    const host = s.chromaHost || "localhost";
    const port = s.chromaPort || 8000;
    const ssl = !!s.chromaSsl;

    // A server already listening (bundled instance from a prior run, or the
    // user's own) — reuse it rather than spawning a second.
    if (await heartbeatOK(host, port, ssl)) return true;

    const bin = binaryPath();
    if (!bin) {
      console.warn("[chroma-server] binary not found; running without bundled server");
      return false;
    }
    try {
      if (process.platform !== "win32") fs.chmodSync(bin, 0o755);
    } catch {}

    try {
      proc = spawn(bin, ["run", "--host", host, "--port", String(port), "--path", dataDir()], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch (e) {
      console.warn(`[chroma-server] spawn failed: ${e.message}`);
      proc = null;
      return false;
    }
    proc.on("exit", (code) => {
      if (code) console.warn(`[chroma-server] exited (code ${code})`);
      proc = null;
    });
    proc.on("error", (e) => {
      console.warn(`[chroma-server] process error: ${e.message}`);
      proc = null;
    });

    const ok = await waitForReady(host, port, ssl);
    if (!ok) console.warn("[chroma-server] not reachable within timeout");
    return ok;
  })();
  return startPromise;
}

function stop() {
  if (proc) {
    try {
      proc.kill();
    } catch {}
    proc = null;
  }
  startPromise = null;
}

export { start, stop, binaryPath };

