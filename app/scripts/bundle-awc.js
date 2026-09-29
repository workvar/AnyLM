// Bundles AWC UI web components into dist/renderer so the Electron
// file:// renderer can load them without bare package imports.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "..");
const entry = path.join(appDir, "src", "renderer", "js", "awc-boot.ts");
const outdir = path.join(appDir, "dist", "renderer", "js");

fs.mkdirSync(outdir, { recursive: true });

const result = spawnSync(
  "bun",
  ["build", entry, "--outdir", outdir, "--target", "browser", "--format", "esm"],
  { cwd: appDir, encoding: "utf8" },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0) {
  console.error("bundle-awc: bun build failed");
  process.exit(result.status || 1);
}

const cssSrc = path.join(outdir, "awc-boot.css");
const cssDest = path.join(appDir, "dist", "renderer", "awc-boot.css");
if (fs.existsSync(cssSrc)) {
  fs.renameSync(cssSrc, cssDest);
}

console.log("  bundle-awc: wrote dist/renderer/js/awc-boot.js (+ tokens css)");
