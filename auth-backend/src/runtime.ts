import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";

// Shared location the desktop app reads to discover the live API port.
export function runtimeDir(): string {
  return path.join(os.homedir(), ".llmeter");
}

export function runtimeFile(): string {
  return path.join(runtimeDir(), "runtime.json");
}

// True if a TCP port can be bound on the loopback interface right now.
function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

// Prefer the desired port; if taken, ask the OS for a free ephemeral one.
export async function resolvePort(desired: number): Promise<number> {
  if (desired && (await isFree(desired))) return desired;
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

// Publish the chosen port so the app (and OAuth) target the same base URL.
export function writeRuntime(port: number): string {
  const apiUrl = `http://127.0.0.1:${port}`;
  fs.mkdirSync(runtimeDir(), { recursive: true });
  fs.writeFileSync(runtimeFile(), JSON.stringify({ port, apiUrl }, null, 2));
  return apiUrl;
}
