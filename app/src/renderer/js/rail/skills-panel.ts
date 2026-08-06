// Skills panel: which skills this conversation can draw on, toggleable
// without leaving the chat.
import { el, node } from "../dom.js";

export async function refreshSkills() {
  const wrap = el("rail-skills");
  wrap.innerHTML = "";
  let skills = [];
  try {
    skills = await window.api.skillsList();
  } catch {
    wrap.appendChild(node("div", "rail-empty", "Skills unavailable."));
    return;
  }
  if (!skills.length) {
    wrap.appendChild(node("div", "rail-empty", "No skills yet."));
    return;
  }
  for (const s of skills) {
    const row = node("div", "rail-skill");
    const label = node("div", "rail-skill-name", s.name);
    const toggle = node("button", `rail-pill${s.enabled ? " on" : ""}`, s.enabled ? "On" : "Off");
    toggle.onclick = async () => {
      await window.api.skillsToggle(s.id, !s.enabled);
      refreshSkills();
    };
    row.append(label, toggle);
    wrap.appendChild(row);
  }
}
