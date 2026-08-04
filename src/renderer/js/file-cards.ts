// Inline chat cards for document generation: the permission prompt shown
// before a file is created, and the clickable card for the finished file
// (click opens the in-app preview; the file also lives in the project folder).
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { openFileViewer } from "./project-files.js";

const ICONS = { ".pdf": "📄", ".docx": "📝", ".pptx": "📊", ".md": "🗒️" };

function messagesEl() {
  return el("messages");
}

function currentProjectId() {
  return (state.viewProject && state.viewProject.id) || (state.current && state.current.id) || null;
}

// "Create report.pdf?" with Allow / Deny, rendered inline in the conversation.
export function showDocConfirm({ token, args }, reply) {
  const wrap = messagesEl();
  const fmt = String(args.format || "").toLowerCase().replace(/^\./, "");
  const fname = `${args.title || "document"}.${fmt || "pdf"}`;

  const card = node("div", "doc-card doc-confirm");
  card.appendChild(node("div", "doc-card-icon", ICONS[`.${fmt}`] || "📄"));
  const body = node("div", "doc-card-body");
  body.appendChild(node("div", "doc-card-name", `Create ${fname}?`));
  body.appendChild(node("div", "doc-card-sub", "Saved to this project's storage folder."));
  card.appendChild(body);

  const actions = node("div", "doc-card-actions");
  const allow = node("button", "small", "Allow");
  const deny = node("button", "ghost small", "Deny");
  const done = (ok) => {
    reply(token, ok);
    actions.remove();
    body.appendChild(node("div", "doc-card-sub", ok ? "Approved ✓" : "Denied ✕"));
  };
  allow.onclick = () => done(true);
  deny.onclick = () => done(false);
  actions.append(allow, deny);
  card.appendChild(actions);

  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}

// Clickable card for a generated file; opens the in-app preview.
export function showFileCard({ name, ext }) {
  const wrap = messagesEl();
  const projectId = currentProjectId();

  const card = node("div", "doc-card doc-file");
  card.appendChild(node("div", "doc-card-icon", ICONS[ext] || "📄"));
  const body = node("div", "doc-card-body");
  body.appendChild(node("div", "doc-card-name", name));
  body.appendChild(node("div", "doc-card-sub", "In project folder · click to preview"));
  card.appendChild(body);

  card.onclick = () => projectId && openFileViewer(projectId, name);
  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}
