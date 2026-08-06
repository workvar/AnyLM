// Merge the per-arch update manifests produced by the build matrix.
//
// Each (OS, arch) job runs electron-builder separately, so each emits its own
// latest-mac.yml / latest.yml listing only its own installers. Flattening them
// into one release folder makes the last copy win, which would hand (say) an
// arm64 Mac the x64 build. Here we union the `files:` arrays so one manifest
// covers every arch, and electron-updater picks the right asset by filename.
//
// Usage: node scripts/merge-update-feeds.js <artifacts-dir> <output-dir>

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const [, , artifactsDir, outDir] = process.argv;
const MANIFESTS = ["latest-mac.yml", "latest.yml", "latest-linux.yml"];

// Every manifest of a given name, across all artifact subfolders.
function collect(name) {
  const found = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === name) found.push(yaml.load(fs.readFileSync(full, "utf8")));
    }
  })(artifactsDir);
  return found;
}

function merge(docs) {
  // Base on the first doc; it carries version/releaseDate and the top-level
  // path/sha512 that older electron-updater clients fall back to.
  const merged = { ...docs[0] };
  const seen = new Set();
  merged.files = [];
  for (const doc of docs) {
    for (const f of doc.files || []) {
      if (seen.has(f.url)) continue;
      seen.add(f.url);
      merged.files.push(f);
    }
  }
  return merged;
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of MANIFESTS) {
  const docs = collect(name);
  if (docs.length === 0) continue;
  const out = path.join(outDir, name);
  fs.writeFileSync(out, yaml.dump(merge(docs), { lineWidth: -1 }));
  console.log(`${name}: merged ${docs.length} manifest(s), ${merge(docs).files.length} file(s)`);
}
