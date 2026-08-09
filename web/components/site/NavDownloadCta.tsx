"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import { WebEvents } from "@/lib/analytics.events";

export default function NavDownloadCta() {
  return (
    <Link
      href="/download"
      className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--color-slime)]"
      onClick={() => track(WebEvents.ctaClicked, { source: "nav", feature: "download" })}
    >
      Download
    </Link>
  );
}
