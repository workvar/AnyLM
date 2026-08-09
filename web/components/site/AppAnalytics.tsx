"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { WebEvents } from "@/lib/analytics.events";

const SESSION_KEY = "anylm_app_opened";

/** Fires `app_opened` once per browser tab session. */
export default function AppAnalytics() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage unavailable — still track once this load
    }
    track(WebEvents.appOpened);
  }, []);

  return null;
}
