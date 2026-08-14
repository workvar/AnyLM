// Bringing the app's window forward, from anywhere in the main process.
//
// Several flows end somewhere other than the app: a system notification, a
// browser tab finishing an OAuth callback. All of them need the same "get the
// user back here" behaviour, so it lives in one place.
import { BrowserWindow } from "electron";

export function focusWindow(): boolean {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}
