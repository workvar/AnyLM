// macOS-native window chrome + Liquid Glass (macOS 26 "Tahoe").
// Everything here is a no-op on Windows/Linux so the cross-platform build is
// unaffected. Liquid Glass needs a transparent window and NO vibrancy; older
// macOS falls back to classic NSVisualEffectView vibrancy instead.
import * as os from "os";

const isMac = process.platform === "darwin";
// Darwin kernel 25.x == macOS 26 (Tahoe), the first release with Liquid Glass.
const darwinMajor = isMac ? parseInt(os.release(), 10) : 0;
const supportsLiquidGlass = isMac && darwinMajor >= 25;

// Extra BrowserWindow options merged in per platform.
function windowOptions() {
  if (!isMac) return {};
  const base = {
    titleBarStyle: "hiddenInset", // inset traffic lights, frameless title area
    trafficLightPosition: { x: 16, y: 18 },
  };
  if (supportsLiquidGlass) {
    return { ...base, transparent: true, backgroundColor: "#00000000" };
  }
  // Pre-Tahoe: classic vibrancy (do NOT combine with Liquid Glass).
  return { ...base, vibrancy: "under-window", backgroundColor: "#00000000" };
}

// Apply the native glass view once content has loaded. Safe to call always.
function applyGlass(win) {
  if (!supportsLiquidGlass) return;
  win.setWindowButtonVisibility(true);
  win.webContents.once("did-finish-load", () => {
    try {
      const liquidGlass = require("electron-liquid-glass");
      liquidGlass.addView(win.getNativeWindowHandle(), { cornerRadius: 12 });
    } catch (err) {
      // Missing native binary / unsupported: keep the window usable.
      // eslint-disable-next-line no-console
      console.warn("Liquid Glass unavailable:", err && err.message);
    }
  });
}

export { windowOptions, applyGlass, isMac, supportsLiquidGlass };

