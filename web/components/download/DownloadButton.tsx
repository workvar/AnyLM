"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { detectOs } from "@/lib/platform";
import { pickAsset } from "@/lib/pickAsset";
import { PLATFORM_LABELS, formatDate, formatSize, type Release } from "@/lib/releases";
import { RELEASES_URL } from "@/lib/config";

interface Props {
  release: Release | null;
}

/** The one-click download on the home page: picks the build for the visitor's OS. */
export default function DownloadButton({ release }: Props) {
  const [os, setOs] = useState<ReturnType<typeof detectOs> | null>(null);

  useEffect(() => setOs(detectOs()), []);

  if (!release) {
    return (
      <div className="flex flex-col items-center gap-2">
        <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="btn-ghost">
          No build published yet
        </a>
        <p className="text-sm text-[var(--color-mist)]">
          Push a version tag and the release workflow will fill this in.
        </p>
      </div>
    );
  }

  const asset = os ? pickAsset(release, os.platform, os.arch) : null;
  const platformName = os?.platform ? PLATFORM_LABELS[os.platform] : "your platform";

  return (
    <div className="flex flex-col items-center gap-3">
      <a href={asset?.downloadUrl ?? "/download"} className="btn-primary text-base">
        {asset ? `Download for ${platformName}` : "See downloads"}
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
          <path
            d="M7 17L17 7M10 7h7v7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>

      <p className="text-sm text-[var(--color-mist)]">
        <span className="font-mono text-white">v{release.version}</span>
        {" · "}
        {formatDate(release.publishedAt)}
        {asset ? ` · ${asset.format} · ${formatSize(asset.size)}` : ""}
      </p>

      <Link href="/download" className="text-sm text-[var(--color-mist)] underline hover:text-white">
        Other platforms and architectures
      </Link>
    </div>
  );
}
