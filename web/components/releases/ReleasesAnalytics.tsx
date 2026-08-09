"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { WebEvents } from "@/lib/analytics.events";

const SESSION_KEY = "anylm_release_viewed";

/** Fires `release_viewed` once when the releases page loads with a version. */
export default function ReleasesAnalytics({ version }: { version: string | null }) {
  useEffect(() => {
    if (!version) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage unavailable — still track once this load
    }
    track(WebEvents.releaseViewed, { version });
  }, [version]);

  return null;
}
