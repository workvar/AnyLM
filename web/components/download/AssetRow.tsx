import { formatSize, type ReleaseAsset } from "@/lib/releases";

export default function AssetRow({ asset }: { asset: ReleaseAsset }) {
  return (
    <a
      href={asset.downloadUrl}
      className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 transition hover:border-[var(--color-slime)]/50 hover:bg-black/45"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{asset.label}</p>
        <p className="truncate font-mono text-xs text-[var(--color-mist)]">{asset.name}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--color-mist)]">
        <span>{formatSize(asset.size)}</span>
        <span className="rounded-full border border-white/10 px-2 py-0.5 group-hover:border-[var(--color-slime)]/50 group-hover:text-[var(--color-slime)]">
          {asset.format}
        </span>
      </div>
    </a>
  );
}
