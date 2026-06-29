// Pure rendering helpers. They touch the DOM but hold no app logic.
import { el, node } from "./dom.js";

export function renderProjectList(projects, currentId, onSelect) {
  const ul = el("project-list");
  ul.innerHTML = "";
  for (const p of projects) {
    const li = node("li", p.id === currentId ? "active" : "");
    li.appendChild(node("span", "", p.name));
    const meta = node("span", "meta", `${p.contextCount} refs . ${p.model || "no model"}`);
    li.appendChild(meta);
    li.onclick = () => onSelect(p.id);
    ul.appendChild(li);
  }
}

export function renderModelOptions(models, selected) {
  const sel = el("model-select");
  sel.innerHTML = "";
  if (!models.length) {
    sel.appendChild(node("option", "", "No models found"));
    return;
  }
  for (const m of models) {
    const opt = node("option", "", m);
    opt.value = m;
    if (m === selected) opt.selected = true;
    sel.appendChild(opt);
  }
}

export function renderContextList(contexts, onRemove) {
  const ul = el("context-list");
  ul.innerHTML = "";
  for (const c of contexts || []) {
    const li = node("li", "ctx-item");
    const head = node("div", "ctx-name");
    head.appendChild(node("span", "", c.name));
    const x = node("span", "x", "remove");
    x.onclick = () => onRemove(c.id);
    head.appendChild(x);
    li.appendChild(head);
    li.appendChild(node("div", "ctx-sum", c.summary || ""));
    const tag = c.embedded
      ? `indexed . ${c.chunkCount} chunks`
      : "summary only (embedding model missing)";
    li.appendChild(node("div", "ctx-meta", tag));
    ul.appendChild(li);
  }
}

export function addMessage(role, text) {
  const wrap = el("messages");
  const m = node("div", `msg ${role}`, text);
  wrap.appendChild(m);
  wrap.scrollTop = wrap.scrollHeight;
  return m;
}

export function clearMessages() {
  el("messages").innerHTML = "";
}
