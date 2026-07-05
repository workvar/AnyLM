// "Save MD" / "Save PDF" actions under assistant replies in project chats.
// Saved files land in the project's on-disk folder (and its Chroma memory).
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { renderMarkdown } from "./markdown.js";

function exportTitle() {
  const base = el("convo-name").value.trim() || "response";
  return `${base} ${new Date().toISOString().slice(0, 10)}`;
}

function flash(btn, label) {
  const prev = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
  }, 1600);
}

// Insert an actions row after an assistant bubble (project chats only).
export function attachExportActions(bubble, text) {
  if (state.mode !== "project" || !state.viewProject || !text) return;
  const projectId = state.viewProject.id;
  const row = node("div", "msg-actions");

  const md = node("button", "ghost small", "Save MD");
  md.onclick = async () => {
    const saved = await window.api.pfilesSaveMd(projectId, exportTitle(), text);
    flash(md, saved ? "Saved ✓" : "Failed");
  };

  const pdf = node("button", "ghost small", "Save PDF");
  pdf.onclick = async () => {
    const saved = await window.api.pfilesSavePdf(projectId, exportTitle(), renderMarkdown(text), text);
    flash(pdf, saved ? "Saved ✓" : "Failed");
  };

  row.append(md, pdf);
  bubble.insertAdjacentElement("afterend", row);
}
