"use client";

import type { Arch, Platform } from "./releases";

export interface DetectedOs {
  platform: Platform | null;
  arch: Arch;
}

/**
 * Best-effort OS guess from the browser. Used only to pre-select a download,
 * never to hide the other options.
 */
export function detectOs(): DetectedOs {
  if (typeof navigator === "undefined") return { platform: null, arch: "x64" };

  const ua = navigator.userAgent;
  const platformHint = `${ua} ${(navigator as Navigator & { platform?: string }).platform ?? ""}`;
  const s = platformHint.toLowerCase();

  let platform: Platform | null = null;
  if (s.includes("mac") || s.includes("iphone") || s.includes("ipad")) platform = "mac";
  else if (s.includes("win")) platform = "windows";
  else if (s.includes("linux") || s.includes("android") || s.includes("x11")) platform = "linux";

  let arch: Arch = "x64";
  if (platform === "mac") {
    // Safari and Chrome both report Intel on Apple Silicon, so assume ARM for
    // modern Macs and let the user switch if they are on an older Intel machine.
    arch = "arm64";
  } else if (s.includes("arm64") || s.includes("aarch64")) {
    arch = "arm64";
  } else if (s.includes("wow64") || s.includes("win64") || s.includes("x86_64")) {
    arch = "x64";
  }

  return { platform, arch };
}
