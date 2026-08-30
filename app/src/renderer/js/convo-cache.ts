// Rendered-transcript cache for recently opened conversations.
//
// Re-opening a chat used to rebuild every bubble from scratch (markdown render
// per message, a file-existence check per artifact), which reads as a visible
// refresh. Instead the live DOM nodes of the conversation being left are moved
// into a detached holder and put back when it is opened again, so the view
// reappears exactly as it was, scroll position included.
//
// Correctness comes from the signature: the stored transcript is read from
// disk on every open anyway, so a cached view is only reused when it still
// describes the same messages. Anything else falls back to a full render.

const MAX_CACHED = 5;

// Nodes that attachTurn / renderRestoredConfirms re-create on every open;
// caching them would duplicate them on the way back in.
const EPHEMERAL = ".perm-card.restored";

type Entry = { signature: string; nodes: Node[]; scrollTop: number };

// Insertion order is the LRU order: oldest first, most recently used last.
const cache = new Map<string, Entry>();

// Cheap fingerprint of a transcript: enough to catch appended, edited or
// removed messages without holding a second copy of the text.
export function signatureOf(messages): string {
  const parts = (messages || []).map((m) => {
    const body = typeof m.content === "string" ? m.content.length : 0;
    return `${m.role || ""}:${body}:${m.name || ""}:${m.type || ""}`;
  });
  return `${parts.length}|${parts.join("~")}`;
}

function touch(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
}

export function invalidateConvo(key: string): void {
  if (key) cache.delete(key);
}

export function clearConvoCache(): void {
  cache.clear();
}

// Detach the rendered view of `key` out of `host` and keep it for later.
// `live` conversations (a turn still generating) are never cached: their DOM
// is rebuilt by attachTurn on the way back in.
export function saveConvoView(
  key: string,
  host: HTMLElement,
  messages,
  live: boolean
): void {
  if (!key || !host) return;
  if (live) {
    cache.delete(key);
    return;
  }
  for (const n of host.querySelectorAll(EPHEMERAL)) n.remove();
  const nodes = Array.from(host.childNodes);
  if (!nodes.length) {
    cache.delete(key);
    return;
  }
  const holder = document.createDocumentFragment();
  for (const n of nodes) holder.appendChild(n);
  touch(key, { signature: signatureOf(messages), nodes, scrollTop: host.scrollTop });
}

// Put a cached view back. Returns false when there is nothing usable, in which
// case the caller renders the history normally.
export function restoreConvoView(key: string, host: HTMLElement, messages): boolean {
  const entry = key ? cache.get(key) : null;
  if (!entry) return false;
  if (entry.signature !== signatureOf(messages)) {
    cache.delete(key);
    return false;
  }
  host.textContent = "";
  for (const n of entry.nodes) host.appendChild(n);
  host.scrollTop = entry.scrollTop;
  touch(key, entry);
  return true;
}
