// Pure rendering helpers. They touch the DOM but hold no app logic.
import { el, node } from "./dom.js";
import { renderMarkdown } from "./markdown.js";

// Human-friendly relative time ("Updated 3h ago").
export function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function dotsButton(onMenu) {
  const b = node("button", "card-dots", "⋯");
  b.type = "button";
  b.setAttribute("aria-label", "More");
  b.onclick = (e) => {
    e.stopPropagation();
    onMenu(e.clientX, e.clientY);
  };
  return b;
}

// Projects grid. handlers: { onOpen(id), onMenu(p, x, y) }
export function renderProjectCards(projects, emptyText, handlers) {
  const grid = el("projects-grid");
  grid.innerHTML = "";
  if (!projects.length) {
    grid.appendChild(node("div", "grid-empty", emptyText));
    return;
  }
  for (const p of projects) {
    const card = node("div", "card");
    const top = node("div", "card-top");
    top.appendChild(node("div", "card-title", p.name || "Untitled project"));
    top.appendChild(dotsButton((x, y) => handlers.onMenu(p, x, y)));
    card.appendChild(top);
    card.appendChild(node("div", "card-meta", `${p.chatCount || 0} chats · ${p.model || "no model"}`));
    card.appendChild(node("div", "card-sub", `Updated ${relTime(p.updatedAt)}`));
    card.onclick = () => handlers.onOpen(p.id);
    card.oncontextmenu = (e) => {
      e.preventDefault();
      handlers.onMenu(p, e.clientX, e.clientY);
    };
    grid.appendChild(card);
  }
}

function chatCard(t, handlers) {
  const card = node("div", "card");
  const top = node("div", "card-top");
  top.appendChild(node("div", "card-title", t.title || "New chat"));
  top.appendChild(dotsButton((x, y) => handlers.onChatMenu(t, x, y)));
  card.appendChild(top);
  card.appendChild(node("div", "card-meta", `${t.msgCount || 0} messages`));
  card.appendChild(node("div", "card-sub", `Updated ${relTime(t.updatedAt)}`));
  card.onclick = () => handlers.onOpen(t.id);
  card.oncontextmenu = (e) => {
    e.preventDefault();
    handlers.onChatMenu(t, e.clientX, e.clientY);
  };
  return card;
}

// A project's chats grouped into folders.
// handlers: { onOpen(id), onChatMenu(t, x, y), onFolderMenu(f, x, y) }
export function renderProjectChats(folders, threads, handlers) {
  const wrap = el("project-chats");
  wrap.innerHTML = "";
  interface ChatGroup {
    id: string | null;
    name: string;
    folder?: any;
    items: any[];
  }
  const groups: ChatGroup[] = [
    { id: null, name: "Chats", items: threads.filter((t) => !t.folderId) },
  ];
  for (const f of folders || []) {
    groups.push({ id: f.id, name: f.name, folder: f, items: threads.filter((t) => t.folderId === f.id) });
  }

  let any = false;
  for (const g of groups) {
    if (g.id === null && !g.items.length) continue; // hide empty default section
    any = true;
    const section = node("div", "folder-section");
    const head = node("div", "folder-head");
    head.appendChild(node("span", "folder-name", g.name));
    head.appendChild(node("span", "folder-count", String(g.items.length)));
    if (g.folder) head.appendChild(dotsButton((x, y) => handlers.onFolderMenu(g.folder, x, y)));
    section.appendChild(head);

    const grid = node("div", "folder-grid");
    if (!g.items.length) grid.appendChild(node("div", "grid-empty", "No chats here yet."));
    else for (const t of g.items) grid.appendChild(chatCard(t, handlers));
    section.appendChild(grid);
    wrap.appendChild(section);
  }
  if (!any) wrap.appendChild(node("div", "grid-empty", "No chats yet. Start one with “New chat”."));
}

// Sidebar recents. handlers: { onOpen(item), onMenu(item, x, y) }
export function renderRecents(items, activeKey, handlers) {
  const ul = el("recents-list");
  ul.innerHTML = "";
  if (!items.length) {
    ul.appendChild(node("li", "recents-empty", "No recent chats"));
    return;
  }
  for (const it of items) {
    const key = `${it.kind}:${it.id}`;
    const li = node("li", key === activeKey ? "active" : "");
    li.appendChild(node("span", "conv-title", it.title || "New chat"));
    li.onclick = () => handlers.onOpen(it);
    li.oncontextmenu = (e) => {
      e.preventDefault();
      handlers.onMenu(it, e.clientX, e.clientY);
    };
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
      : c.embedError
      ? `summary only (embed failed: ${c.embedError})`
      : "summary only (no embeddings)";
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
