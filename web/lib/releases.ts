export type Platform = "mac" | "windows" | "linux";
export type Arch = "arm64" | "x64" | "ia32" | "universal";

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadUrl: string;
  downloadCount: number;
  platform: Platform | null;
  arch: Arch;
  format: string;
  label: string;
}

export interface Release {
  id: number;
  tag: string;
  version: string;
  name: string;
  notes: string;
  htmlUrl: string;
  publishedAt: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: ReleaseAsset[];
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

const ARCH_LABELS: Record<Arch, string> = {
  arm64: "Apple Silicon / ARM64",
  x64: "Intel / x64",
  ia32: "32-bit",
  universal: "Universal",
};

/** Files electron-builder emits that are not user-facing downloads. */
const METADATA_FILES = /(^|\/)(latest|latest-mac|latest-linux)\.yml$/i;

export function isMetadataAsset(name: string): boolean {
  return METADATA_FILES.test(name) || name.endsWith(".blockmap");
}

export function detectPlatform(name: string): Platform | null {
  const n = name.toLowerCase();
  if (n.endsWith(".dmg") || n.endsWith(".pkg") || n.includes("-mac.zip")) return "mac";
  if (n.endsWith(".exe") || n.endsWith(".msi") || n.includes("-win.zip")) return "windows";
  if (n.endsWith(".appimage") || n.endsWith(".deb") || n.endsWith(".rpm") || n.endsWith(".snap")) {
    return "linux";
  }
  if (n.endsWith(".zip") || n.endsWith(".tar.gz")) return "linux";
  return null;
}

export function detectArch(name: string): Arch {
  const n = name.toLowerCase();
  if (n.includes("arm64") || n.includes("aarch64")) return "arm64";
  if (n.includes("ia32") || n.includes("i386") || n.includes("x86.")) return "ia32";
  if (n.includes("x64") || n.includes("x86_64") || n.includes("amd64")) return "x64";
  if (n.includes("universal")) return "universal";
  return "x64";
}

export function detectFormat(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "appimage") return "AppImage";
  if (ext === "exe") return "Installer";
  if (ext === "dmg") return "DMG";
  if (ext === "deb") return "DEB";
  if (ext === "zip") return "ZIP";
  return ext.toUpperCase();
}

export function assetLabel(name: string): string {
  const platform = detectPlatform(name);
  const arch = detectArch(name);
  const base = platform ? PLATFORM_LABELS[platform] : "Other";
  return `${base} · ${ARCH_LABELS[arch]}`;
}

export function formatSize(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "Unreleased";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function assetsFor(release: Release | null, platform: Platform): ReleaseAsset[] {
  if (!release) return [];
  return release.assets.filter((a) => a.platform === platform);
}
