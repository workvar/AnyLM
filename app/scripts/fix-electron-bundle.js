#!/usr/bin/env node
// macOS: the menu-bar app name comes from Electron.app's Info.plist
// (CFBundleName), not app.setName(). Patch it so unpackaged `electron .`
// runs show "AnyLM" instead of "Electron". No-op on other platforms / when
// the Electron.app bundle is missing.
const { existsSync } = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const NAME = "AnyLM";
const plist = path.join(
  __dirname,
  "..",
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
  "Contents",
  "Info.plist"
);

if (process.platform !== "darwin") process.exit(0);
if (!existsSync(plist)) {
  console.warn("  fix-electron-bundle: Electron.app Info.plist not found; skip");
  process.exit(0);
}

try {
  execFileSync("plutil", ["-replace", "CFBundleName", "-string", NAME, plist], { stdio: "pipe" });
  execFileSync("plutil", ["-replace", "CFBundleDisplayName", "-string", NAME, plist], {
    stdio: "pipe",
  });
  console.log(`  fix-electron-bundle: CFBundleName → ${NAME}`);
} catch (err) {
  console.warn("  fix-electron-bundle: failed:", err && err.message ? err.message : err);
  process.exit(0);
}
