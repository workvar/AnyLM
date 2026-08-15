// Batched streaming renderer. Coalesces tokens into one DOM write per animation
// frame and appends only new text, so fast models don't cause per-token reflow.
import { el } from "./dom.js";
import { scrollToBottom } from "./autoscroll.js";

export function createStreamRenderer(bubble) {
  let acc = "";
  let pending = "";
  let raf = 0;
  let started = false;
  let textNode = null;

  function flush() {
    raf = 0;
    if (!started) {
      started = true;
      bubble.classList.remove("thinking");
      bubble.classList.add("raw");
      bubble.textContent = "";
      textNode = document.createTextNode("");
      bubble.appendChild(textNode);
    }
    textNode.appendData(pending);
    pending = "";
    scrollToBottom();
  }

  return {
    // Called per token; schedules a single flush per frame.
    push(piece) {
      acc += piece;
      pending += piece;
      if (!raf) raf = requestAnimationFrame(flush);
    },
    // Final text accumulated so far.
    text() {
      return acc;
    },
    // Stop pending frames (call before swapping in rendered markdown).
    cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
