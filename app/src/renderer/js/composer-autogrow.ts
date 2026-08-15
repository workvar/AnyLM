// The composer starts at two rows and grows with the text, so a long prompt is
// visible while it is being written instead of scrolling inside two lines.
//
// The floor lives here rather than only in CSS: this writes an inline height,
// and an inline height with no JS floor collapses the box to a sliver whenever
// scrollHeight is small — including the case where the element is measured
// while its view is still hidden and scrollHeight is 0.
const MIN_PX = 52; // ~two rows at --fs-lg
const MAX_PX = 200; // past this the textarea scrolls instead of growing

function laidOut(input: UiElement): boolean {
  // offsetParent is null for a hidden element; measuring it yields 0.
  return !!input.offsetParent || input.getClientRects().length > 0;
}

export function resizeComposer(input: UiElement | null): void {
  if (!input) return;
  if (!laidOut(input)) {
    // Not measurable yet. Leave the stylesheet's height alone rather than
    // pinning it to a bogus 0.
    input.style.height = "";
    return;
  }
  // Reset first: without it the box can only ever grow, never shrink back.
  input.style.height = "auto";
  const content = input.scrollHeight;
  const next = Math.max(MIN_PX, Math.min(content || MIN_PX, MAX_PX));
  input.style.height = `${next}px`;
  input.style.overflowY = content > MAX_PX ? "auto" : "hidden";
}

export function initComposerAutogrow(input: UiElement | null): void {
  if (!input) return;
  const resize = () => resizeComposer(input);
  input.addEventListener("input", resize);
  // Height must also settle after a programmatic set (drafts, clearing on
  // send), after focus, and after a width change that re-wraps the text.
  input.addEventListener("focus", resize);
  window.addEventListener("resize", resize);
  // First measurement waits a frame: at bind time the chat view can still be
  // hidden behind the boot splash, where every dimension reads 0.
  requestAnimationFrame(resize);
}
