// Downloads the standalone Chroma CLI server binary for a target platform into
// vendor/chroma/, so it can be bundled with the app (see package.json
// build.extraResources). Runs automatically at package time via the beforePack
// hook (which imports fetchChroma), or manually for local dev:
//
//   node scripts/fetch-chroma.js [--platform=darwin|win32|linux] [--arch=arm64|x64|ia32]
//
// Binaries come from the Chroma CLI GitHub release (Rust single binary, no
// Python needed).
const fs = require("fs");
const path = require("path");
const https = require("https");

const RELEASE = "cli-1.4.4";
const BASE = `https://github.com/chroma-core/chroma/releases/download/${RELEASE}`;

// Map a platform/arch to the published release asset. Note: Chroma ships only a
// single 64-bit Windows binary (chroma-windows.exe) and no arm64-Windows or
// 32-bit build, so ia32 reuses the x64 exe (works on 64-bit Windows only).
function assetFor(platform, arch) {
  if (platform === "darwin") {
    return arch === "arm64" ? "chroma-macos-arm64" : "chroma-macos-intel";
  }
  if (platform === "win32") return "chroma-windows.exe";
  if (platform === "linux") return "chroma-linux";
  throw new Error(`Unsupported platform: ${platform}`);
}

// GET with redirect following (GitHub release assets redirect to a CDN).
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const go = (u, depth) => {
      if (depth > 5) return reject(new Error("too many redirects"));
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return go(res.headers.location, depth + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          }
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
          file.on("error", reject);
        })
        .on("error", reject);
    };
    go(url, 0);
  });
}

// Fetch the binary for {platform, arch} into vendor/chroma/. Returns the path.
async function fetchChroma({ platform = process.platform, arch = process.arch } = {}) {
  const asset = assetFor(platform, arch);
  if (platform === "win32" && arch === "ia32") {
    console.warn(
      "[fetch-chroma] no 32-bit Chroma build exists; bundling the 64-bit exe " +
        "(the app will only find the server on 64-bit Windows)."
    );
  }
  const outDir = path.join(__dirname, "..", "vendor", "chroma");
  fs.mkdirSync(outDir, { recursive: true });
  const outName = platform === "win32" ? "chroma.exe" : "chroma";
  const dest = path.join(outDir, outName);

  console.log(`Downloading ${asset} (${platform}/${arch}) -> ${dest}`);
  await download(`${BASE}/${asset}`, dest);
  if (platform !== "win32") fs.chmodSync(dest, 0o755);
  console.log("Done.");
  return dest;
}

function argOf(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
}

// CLI entry (default: host platform/arch).
if (require.main === module) {
  fetchChroma({ platform: argOf("platform", process.platform), arch: argOf("arch", process.arch) }).catch(
    (e) => {
      console.error(`fetch-chroma failed: ${e.message}`);
      process.exit(1);
    }
  );
}

module.exports = { fetchChroma, assetFor };
