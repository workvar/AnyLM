// Shared on/off switch control used by Tools, Skills, Org policies, etc.
import { node } from "./dom.js";

/** Build a `.switch` label with an in-flow track + knob (no ::before). */
export function createSwitch(
  checked: boolean,
  onChange: (next: boolean) => void
): UiElement {
  const wrap = node("label", "switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.onchange = () => onChange(!!input.checked);

  const track = node("span", "track");
  track.appendChild(node("span", "knob"));
  wrap.appendChild(input);
  wrap.appendChild(track);
  return wrap;
}
