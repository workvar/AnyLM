// Batched streaming renderer. Coalesces tokens into one DOM write per animation
// frame, so fast models don't cause per-token reflow. Text is rendered as
// formatted Markdown while it streams rather than as raw source.
import { scrollToBottom } from "./autoscroll.js";
import { createIncrementalMarkdown } from "./markdown-stream.js";

export function createStreamRenderer(bubble) {
  let acc = "";
  let raf = 0;
  let started = false;
  let md = null;

  function flush() {
    raf = 0;
    if (!started) {
      started = true;
      bubble.classList.remove("thinking", "raw");
      md = createIncrementalMarkdown(bubble);
    }
    md.update(acc);
    scrollToBottom();
  }

  return {
    // Called per token; schedules a single flush per frame.
    push(piece) {
      acc += piece;
      if (!raf) raf = requestAnimationFrame(flush);
    },
    // Final text accumulated so far.
    text() {
      return acc;
    },
    // Stop pending frames (call before swapping in the final rendered markdown).
    cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
