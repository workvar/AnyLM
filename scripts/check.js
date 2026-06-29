// Syntax-checks every JS file in the project (skips node_modules).
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith(".js")) files.push(full);
  }
})(root);

let failed = 0;
for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
  } catch (e) {
    failed++;
    console.error("FAIL", path.relative(root, f), "\n", e.stderr.toString());
  }
}
console.log(`Checked ${files.length} files, ${failed} failed.`);
process.exit(failed ? 1 : 0);
