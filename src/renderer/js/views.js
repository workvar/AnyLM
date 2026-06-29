// Pure rendering helpers. They touch the DOM but hold no app logic.
import { el, node } from "./dom.js";
import { renderMarkdown } from "./markdown.js";

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

export function renderChatList(chats, currentId, onSelect) {
  const ul = el("chat-list");
  ul.innerHTML = "";
  for (const c of chats) {
    const li = node("li", c.id === currentId ? "active" : "");
    li.appendChild(node("span", "", c.title || "New chat"));
    const meta = node("span", "meta", `${c.msgCount || 0} msgs . ${c.model || "no model"}`);
    li.appendChild(meta);
    li.onclick = () => onSelect(c.id);
    ul.appendChild(li);
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

// Optimistic "indexing" row shown while a context file is chunked + embedded.
export function addPendingContext(name) {
  const ul = el("context-list");
  const li = node("li", "ctx-item pending");
  const head = node("div", "ctx-name");
  head.appendChild(node("span", "", name));
  head.appendChild(node("span", "spinner"));
  li.appendChild(head);
  li.appendChild(node("div", "ctx-meta", "Indexing…"));
  ul.appendChild(li);
  return li;
}

export function addMessage(role, text) {
  const wrap = el("messages");
  const m = node("div", `msg ${role}`, text);
  wrap.appendChild(m);
  wrap.scrollTop = wrap.scrollHeight;
  return m;
}

// User message with optional image thumbnails (data URLs).
export function addUserMessage(text, images = []) {
  const wrap = el("messages");
  const m = node("div", "msg user");
  if (images.length) {
    const row = node("div", "msg-images");
    for (const src of images) {
      const img = document.createElement("img");
      img.className = "msg-thumb";
      img.src = src;
      row.appendChild(img);
    }
    m.appendChild(row);
  }
  if (text) m.appendChild(node("div", "", text));
  wrap.appendChild(m);
  wrap.scrollTop = wrap.scrollHeight;
  return m;
}

// Assistant bubble showing an animated typing indicator until tokens arrive.
export function addThinking() {
  const wrap = el("messages");
  const m = node("div", "msg assistant thinking");
  const dots = node("div", "typing");
  dots.appendChild(node("span"));
  dots.appendChild(node("span"));
  dots.appendChild(node("span"));
  m.appendChild(dots);
  wrap.appendChild(m);
  wrap.scrollTop = wrap.scrollHeight;
  return m;
}

// Replace a bubble's contents with rendered (safe) markdown.
export function setBubbleMarkdown(bubble, text) {
  bubble.classList.remove("thinking", "raw");
  bubble.innerHTML = renderMarkdown(text);
}

export function clearMessages() {
  el("messages").innerHTML = "";
}
