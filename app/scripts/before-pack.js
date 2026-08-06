// electron-builder beforePack hook: fetch the Chroma server binary for the
// exact platform+arch being packed, so it is bundled via build.extraResources.
// Called once per (platform, arch); the fixed vendor/chroma path is safe
// because packs run sequentially. Imports fetchChroma directly so it works
// whether electron-builder runs under Node or Bun.
const { fetchChroma } = require("./fetch-chroma");

// electron-builder Arch enum -> node arch string.
function archName(a) {
  return { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64" }[a] || process.arch;
}

exports.default = async function beforePack(context) {
  const platform = context.electronPlatformName || process.platform; // darwin|win32|linux
  const arch = context.arch != null ? archName(context.arch) : process.arch;
  await fetchChroma({ platform, arch });
};
