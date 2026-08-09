"use client";

import { formatSize, type ReleaseAsset } from "@/lib/releases";
import { track } from "@/lib/analytics";
import { WebEvents } from "@/lib/analytics.events";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AssetRow({
  asset,
  source,
}: {
  asset: ReleaseAsset;
  source: "download" | "releases";
}) {
  return (
    <a
      href={asset.downloadUrl}
      className="group flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 transition hover:border-[var(--color-slime)]/50 hover:bg-black/45"
      onClick={() =>
        track(WebEvents.downloadClicked, {
          source,
          platform: asset.platform ?? "unknown",
        })
      }
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{asset.label}</p>
        <p className="mt-0.5 break-all font-mono text-[11px] leading-snug text-[var(--color-mist)]">
          {asset.name}
        </p>
        <p className="mt-1 text-[11px] text-[var(--color-mist)]">{formatSize(asset.size)}</p>
      </div>
      <span
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-mist)] transition group-hover:text-[var(--color-slime)]"
        aria-hidden
      >
        <DownloadIcon className="h-4 w-4" />
      </span>
      <span className="sr-only">Download {asset.format}</span>
    </a>
  );
}
