import type { Arch, Platform, Release, ReleaseAsset } from "./releases";

/** Preferred install format per platform, best first. */
const FORMAT_RANK: Record<Platform, string[]> = {
  mac: ["DMG", "ZIP"],
  windows: ["Installer", "MSI", "ZIP"],
  linux: ["AppImage", "DEB", "RPM", "ZIP"],
};

function score(asset: ReleaseAsset, arch: Arch): number {
  if (!asset.platform) return -1;
  const formatIndex = FORMAT_RANK[asset.platform].indexOf(asset.format);
  const formatScore = formatIndex === -1 ? 0 : 10 - formatIndex;
  const archScore = asset.arch === arch ? 20 : asset.arch === "universal" ? 15 : 0;
  return archScore + formatScore;
}

/** The single asset the download button should point at for this visitor. */
export function pickAsset(
  release: Release | null,
  platform: Platform | null,
  arch: Arch,
): ReleaseAsset | null {
  if (!release || !platform) return null;
  const candidates = release.assets.filter((a) => a.platform === platform);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => score(b, arch) - score(a, arch))[0];
}

/** All downloadable assets grouped by platform, in a stable display order. */
export function groupByPlatform(release: Release | null): Record<Platform, ReleaseAsset[]> {
  const groups: Record<Platform, ReleaseAsset[]> = { mac: [], windows: [], linux: [] };
  if (!release) return groups;

  for (const asset of release.assets) {
    if (asset.platform) groups[asset.platform].push(asset);
  }
  for (const key of Object.keys(groups) as Platform[]) {
    groups[key].sort((a, b) => score(b, "arm64") - score(a, "arm64"));
  }
  return groups;
}
