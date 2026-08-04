// Update state machine. Updates come from GitHub Releases; the app never
// touches an app store.
//
// The user is asked before anything is fetched, and can send the download to
// the background — at which point the toast shrinks to a pill that reports
// percent and speed without covering the app.
import { el } from "../dom.js";
import * as toast from "./toast.js";

// States that only matter when the user explicitly pressed "Check now".
const QUIET = new Set(["checking", "up-to-date", "dev"]);

let manual = false;
let last = null; // most recent status, so collapsing can re-render

function rerender() {
  if (last) render(last);
}

function download({ background }) {
  toast.collapse(background);
  window.api.downloadUpdate();
}

function dismiss() {
  toast.hide();
}

function render(s) {
  last = s;
  if (QUIET.has(s.state) && !manual) return toast.hide();

  switch (s.state) {
    case "checking":
      return toast.show({ title: "Checking for updates…" });

    case "up-to-date":
      manual = false;
      return toast.show({
        title: "You're up to date",
        actions: [{ label: "Dismiss", onClick: dismiss }],
      });

    case "dev":
      manual = false;
      return toast.show({
        title: "Updates unavailable in dev",
        msg: "Run an installed build to test updates.",
        actions: [{ label: "Dismiss", onClick: dismiss }],
      });

    case "available":
      manual = false;
      // auto-download preference: main already started it, so skip the prompt
      // and go straight to the unobtrusive pill.
      if (s.auto) return toast.collapse(true);
      return toast.show({
        title: `Version ${s.version} is available`,
        msg: "Download it now, or let it fetch quietly in the background.",
        notes: s.notes,
        pill: `v${s.version} available`,
        actions: [
          { label: "Later", onClick: dismiss },
          { label: "In background", onClick: () => download({ background: true }) },
          { label: "Download", primary: true, onClick: () => download({ background: false }) },
        ],
      });

    case "downloading":
      return toast.showDownloading(s, [
        { label: "Cancel", onClick: () => window.api.cancelUpdate() },
        {
          label: "Hide",
          primary: true,
          onClick: () => {
            toast.collapse(true);
            rerender();
          },
        },
      ]);

    case "cancelled":
      manual = false;
      toast.collapse(false);
      return toast.show({
        title: "Download cancelled",
        actions: [
          { label: "Dismiss", onClick: dismiss },
          { label: "Try again", primary: true, onClick: () => download({ background: true }) },
        ],
      });

    case "ready":
      manual = false;
      toast.collapse(false);
      return toast.show({
        title: `Version ${s.version} is ready`,
        msg: s.installOnQuit
          ? "It will install automatically the next time you quit AnyLM."
          : "Restart AnyLM to finish installing.",
        pill: "Update ready",
        actions: [
          { label: s.installOnQuit ? "Install on quit" : "Later", onClick: dismiss },
          { label: "Restart now", primary: true, onClick: () => window.api.installUpdate() },
        ],
      });

    case "error":
      manual = false;
      toast.collapse(false);
      return toast.show({
        title: "Update failed",
        msg: s.message || "Something went wrong.",
        actions: [
          { label: "Dismiss", onClick: dismiss },
          { label: "Retry", primary: true, onClick: () => window.api.checkForUpdate() },
        ],
      });
  }
}

export function checkNow() {
  manual = true;
  window.api.checkForUpdate();
}

export function initUpdates() {
  toast.bind();
  toast.setToggleHandler((wantCollapsed) => {
    toast.collapse(wantCollapsed);
    rerender();
  });
  window.api.onUpdateStatus(render);
}

// First launch: ask once. Otherwise honor the saved preference.
export function runLaunchUpdateFlow(settings) {
  if (settings.checkUpdatesOnLaunch === null) {
    el("first-run").classList.remove("hidden");
    el("fr-no").onclick = async () => {
      el("first-run").classList.add("hidden");
      await window.api.setSettings({ checkUpdatesOnLaunch: false });
    };
    el("fr-yes").onclick = async () => {
      el("first-run").classList.add("hidden");
      await window.api.setSettings({ checkUpdatesOnLaunch: true });
      window.api.checkForUpdate();
    };
    return;
  }
  if (settings.checkUpdatesOnLaunch === true) window.api.checkForUpdate();
}
