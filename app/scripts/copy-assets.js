// Copies the renderer's non-TypeScript assets into dist/renderer, next to the
// JS that tsc emits there. tsc only knows about .ts files, so index.html and
// styles.css have to be moved across separately.
const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "..");
const from = path.join(appDir, "src", "renderer");
const to = path.join(appDir, "dist", "renderer");

/** Recursively copy everything except TypeScript sources and editor cruft. */
function copyTree(srcDir, destDir) {
  let copied = 0;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(src, dest);
    } else if (!entry.name.endsWith(".ts")) {
      fs.copyFileSync(src, dest);
      copied++;
    }
  }
  return copied;
}

const n = copyTree(from, to);
console.log(`  copy-assets: copied ${n} renderer asset(s) to dist/renderer`);
