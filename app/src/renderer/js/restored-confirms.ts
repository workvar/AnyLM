// Confirmations that outlived the turn that asked for them.
//
// A confirm is stored on disk the moment it is asked. If the user never
// answered — the 10-minute wait elapsed, they stopped the turn, or they quit
// the app — the record survives and is offered again here when the
// conversation is reopened. Approving runs the saved call on its own: the
// original agent loop is long gone, so there is nothing to resume into.
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { activeKey } from "./activity.js";
import { fileArtifact } from "./messages.js";
import { renderFileCard } from "./file-cards.js";
import { restoredDetail, restoredTitle, restoredWhen } from "./restored-confirm-copy.js";

/** Store a confirm as soon as it is asked, so it can outlive this turn. */
export function saveConfirmRecord(turn, pending: { token: string; tool?: { name?: string; description?: string }; args?: Record<string, unknown> }): void {
  if (!pending?.token || !pending.tool?.name) return;
  void window.api
    .confirmsSave({
      token: pending.token,
      key: turn.key,
      chatId: turn.chatId || null,
      projectId: turn.projectId || null,
      threadId: turn.threadId || null,
      toolName: pending.tool.name,
      toolDescription: pending.tool.description || "",
      args: pending.args || {},
      createdAt: Date.now(),
      status: "pending",
    })
    .catch(() => {});
}

/** Forget a confirm the user answered while it was still live. */
export function clearConfirmRecord(token: string): void {
  if (!token) return;
  void window.api.confirmsRemove(token).catch(() => {});
}

async function persistArtifact(record: PendingConfirmRecord, artifact: FileArtifactMessage) {
  if (record.projectId && record.threadId) {
    const stored = await window.api.getThread(record.projectId, record.threadId);
    const messages = [...((stored && stored.messages) || []), artifact];
    await window.api.updateThread(record.projectId, record.threadId, { messages });
  } else if (record.chatId) {
    const stored = await window.api.getChat(record.chatId);
    const messages = [...((stored && stored.messages) || []), artifact];
    await window.api.updateChat(record.chatId, { messages });
  }
  if (activeKey() === record.key) state.chat.push(artifact);
}

function settleCard(card: HTMLElement, text: string, denied: boolean): void {
  const actions = card.querySelector(".perm-actions");
  if (actions) actions.remove();
  if (denied) card.classList.add("denied");
  if (!card.querySelector(".perm-result")) card.appendChild(node("div", "perm-result", text));
}

async function approve(record: PendingConfirmRecord, card: HTMLElement): Promise<void> {
  const actions = card.querySelector(".perm-actions");
  if (actions) actions.remove();
  const busy = node("div", "perm-result", "Running…");
  card.appendChild(busy);

  const result = await window.api
    .confirmsResume(record.token)
    .catch((e) => ({ ok: false, output: `Error: ${e.message}`, files: [] }));
  busy.remove();

  if (!result.ok) {
    // Left in place deliberately: a failed run is still an open offer.
    settleCard(card, result.output || "Could not run this", true);
    return;
  }

  card.remove();
  for (const file of result.files || []) {
    const artifact = fileArtifact({ name: file.name, ext: file.ext, dir: file.dir || "" });
    await persistArtifact(record, artifact);
    if (activeKey() === record.key) await renderFileCard(artifact);
  }
}

function renderCard(record: PendingConfirmRecord): void {
  const wrap = el("messages");
  const card = node("div", "perm-card restored");
  card.dataset.permToken = record.token;

  card.appendChild(node("div", "perm-ask", restoredTitle(record)));

  const desc = node("div", "perm-desc");
  desc.appendChild(node("span", "perm-file", restoredDetail(record)));
  desc.appendChild(node("span", "perm-where", `· ${restoredWhen(record.createdAt, Date.now())}, not answered`));
  card.appendChild(desc);

  const actions = node("div", "perm-actions");
  const deny = node("button", "ghost small", "Dismiss");
  deny.type = "button";
  const allow = node("button", "primary small", "Allow");
  allow.type = "button";
  deny.onclick = () => {
    clearConfirmRecord(record.token);
    settleCard(card, "Dismissed", true);
  };
  allow.onclick = () => {
    void approve(record, card);
  };
  actions.append(deny, allow);
  card.appendChild(actions);

  wrap.appendChild(card);
  wrap.scrollTop = wrap.scrollHeight;
}

/** Re-offer unanswered confirms for a conversation that has just been opened. */
export async function renderRestoredConfirms(key: string): Promise<void> {
  if (!key) return;
  const records = await window.api.confirmsForKey(key).catch(() => []);
  // The user may have navigated away while we were reading from disk.
  if (activeKey() !== key) return;
  for (const record of records) renderCard(record);
}
