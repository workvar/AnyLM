// Incremental Markdown rendering for streaming replies. Model output is
// formatted as it arrives instead of showing raw `**`, `#` and `-` markers
// that only get replaced once the turn finishes.
//
// Re-rendering the whole message every frame would be wasteful, so the text is
// split at the last safe block boundary (a blank line outside a code fence).
// Everything before it is finished markdown and is rendered once; only the
// short tail after it is re-rendered on each frame.
import { renderMarkdown } from "./markdown.js";

// Offset of the end of the last completed block, i.e. just after a blank line
// that is not inside a fenced code block. 0 when nothing is settled yet.
export function stableBoundary(src) {
  const lines = (src || "").split("\n");
  let offset = 0;
  let inFence = false;
  let stable = 0;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    else if (!inFence && /^\s*$/.test(line)) stable = offset + line.length + 1;
    offset += line.length + 1;
  }
  return stable;
}

// A fence opened mid-stream would otherwise render as a plain paragraph; close
// it so a partial code block already looks like code.
export function closeOpenFence(src) {
  const fences = (src.match(/^\s*```/gm) || []).length;
  return fences % 2 ? src + "\n```" : src;
}

// Renders growing markdown text into `host` across two child containers: the
// settled prefix (written once per completed block) and the live tail.
export function createIncrementalMarkdown(host) {
  let stableEl = null;
  let tailEl = null;
  let stableLen = -1;

  function mount() {
    host.textContent = "";
    stableEl = document.createElement("div");
    stableEl.className = "md-part";
    tailEl = document.createElement("div");
    tailEl.className = "md-part";
    host.appendChild(stableEl);
    host.appendChild(tailEl);
    stableLen = 0;
  }

  return {
    update(full) {
      if (stableLen < 0) mount();
      const boundary = stableBoundary(full);
      if (boundary > stableLen) {
        stableLen = boundary;
        stableEl.innerHTML = renderMarkdown(full.slice(0, boundary));
      }
      tailEl.innerHTML = renderMarkdown(closeOpenFence(full.slice(stableLen)));
    },
  };
}
