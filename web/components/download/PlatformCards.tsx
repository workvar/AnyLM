import AssetRow from "./AssetRow";
import { groupByPlatform } from "@/lib/pickAsset";
import { PLATFORM_LABELS, type Platform, type Release } from "@/lib/releases";

const ORDER: Platform[] = ["mac", "windows", "linux"];

const HINTS: Record<Platform, string> = {
  mac: "Apple Silicon and Intel builds. Open the DMG and drag AnyLM to Applications.",
  windows: "Signed NSIS installer. Installs per user, no admin rights needed.",
  linux: "AppImage runs anywhere: chmod +x, then launch.",
};

export default function PlatformCards({ release }: { release: Release | null }) {
  const groups = groupByPlatform(release);

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {ORDER.map((platform) => (
        <section key={platform} className="glass rounded-3xl p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">{PLATFORM_LABELS[platform]}</h2>
          <p className="mt-1 mb-4 text-sm text-[var(--color-mist)]">{HINTS[platform]}</p>

          <div className="space-y-2">
            {groups[platform].length > 0 ? (
              groups[platform].map((asset) => (
                <AssetRow key={asset.id} asset={asset} source="download" />
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-[var(--color-mist)]">
                No build for this platform in the latest release.
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
