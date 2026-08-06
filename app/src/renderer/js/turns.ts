// In-flight turns, one per conversation.
//
// A turn is not bound to the view: switching chats detaches its bubble but the
// request keeps streaming, and the reply is written to the right conversation
// whether or not the user is looking at it. Coming back re-attaches the live
// bubble (and any question the model asked while they were away).
import { el, node } from "./dom.js";
import { state } from "./state.js";
import { addThinking, setBubbleMarkdown, paintRecentsTitle } from "./views.js";
import { createStreamRenderer } from "./stream.js";
import { setActivity, clearActivity, activeKey, notifyWaiting } from "./activity.js";
import { renderAsk, clearAsk } from "./ask-card.js";
import { attachTokenStats } from "./tokenstats.js";
import { setContextUsage } from "./contextmeter.js";
import { maybeTitle } from "./titler.js";
import { askArtifact, fileArtifact, llmMessages } from "./messages.js";
import { renderFileCard } from "./file-cards.js";
import { applyActivity, buildSummary, toolCountOf, thoughtMsOf, formatThought } from "./activity-store.js";
import { createTrailHost, paintTrail, paintCollapsed } from "./activity-trail.js";
import { paintWorkingStrip, setWorkingStripActions } from "./working-strip.js";

const turns = new Map<string, any>();
const byRequest = new Map<string, any>();

export function turnFor(key: string) {
  return (key && turns.get(key)) || null;
}

export function activeTurn() {
  const key = activeKey();
  return key ? turnFor(key) : null;
}

export function pendingAsk() {
  const turn = activeTurn();
  return turn && turn.pendingAsk ? turn.pendingAsk : null;
}

// --- activity trail ---------------------------------------------------------

function clearThoughtTicker(turn): void {
  if (turn.thoughtTimer) {
    clearInterval(turn.thoughtTimer);
    turn.thoughtTimer = null;
  }
}

function thoughtTickMs(turn): number | undefined {
  if (turn.thoughtStartedAt == null) return undefined;
  return Date.now() - turn.thoughtStartedAt;
}

function metaFromEvents(events: ActivityEvent[]): MessageActivity {
  const thoughtMs = thoughtMsOf(events);
  const toolCount = toolCountOf(events);
  return {
    thoughtMs,
    toolCount,
    summary: buildSummary(thoughtMs, toolCount),
    events,
  };
}

function resolveActivityMeta(turn): MessageActivity | null {
  if (turn.activityMeta) return turn.activityMeta;
  if (turn.events?.length) return metaFromEvents(turn.events);
  return null;
}

function dropPendingConfirm(turn): void {
  if (!turn.pendingConfirm) return;
  turn.pendingConfirm = null;
}

/** Clear pending confirm UI (file-card reply path, or by request id). */
export function clearPendingConfirm(requestId?: string): void {
  const turn = requestId ? byRequest.get(requestId) : activeTurn();
  if (!turn) return;
  dropPendingConfirm(turn);
  repaintTrail(turn);
}

function replyConfirm(turn, token: string, approved: boolean): void {
  if (turn.pendingConfirm?.token === token) dropPendingConfirm(turn);
  window.api.replyToolConfirm(token, approved);
  repaintTrail(turn);
}

/** Allow/Deny from the Working strip (same token as the trail). */
export function replyActiveConfirm(token: string, approved: boolean): void {
  const turn = activeTurn();
  if (turn) replyConfirm(turn, token, approved);
  else window.api.replyToolConfirm(token, approved);
}

function stripLabel(turn): string {
  const events: ActivityEvent[] = turn.events || [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.kind === "status") return ev.text;
    if (ev.kind === "confirm") {
      if (ev.tool?.name === "generate_document") continue;
      return ev.label || "Waiting for approval…";
    }
    if (ev.kind === "tool" && ev.status === "running") return ev.label;
    if (ev.kind === "ask") return "Waiting for your answer…";
    if (ev.kind === "thinking" && ev.phase === "start") {
      return formatThought(thoughtTickMs(turn) ?? 0);
    }
  }
  if (turn.pendingAsk) return "Waiting for your answer…";
  return "Working…";
}

function syncWorkingStrip(): void {
  const turn = activeTurn();
  if (!turn || turn.status === "done") {
    paintWorkingStrip(null);
    return;
  }
  const pending = turn.pendingConfirm;
  const confirmToken =
    pending && pending.tool?.name !== "generate_document" ? pending.token : undefined;
  paintWorkingStrip({ label: stripLabel(turn), confirmToken });
}

function repaintTrail(turn): void {
  if (activeKey() !== turn.key) return;
  if (turn.trailHost) {
    paintTrail(turn.trailHost, turn.events || [], {
      live: turn.status !== "done",
      thoughtTickMs: thoughtTickMs(turn),
      pendingConfirmToken: turn.pendingConfirm?.token ?? null,
      onAllow: (token) => replyConfirm(turn, token, true),
      onDeny: (token) => replyConfirm(turn, token, false),
    });
  }
  syncWorkingStrip();
}

function collapseTrail(turn): void {
  clearThoughtTicker(turn);
  turn.thoughtStartedAt = null;
  if (!turn.trailHost) return;
  const meta = resolveActivityMeta(turn);
  if (meta) {
    turn.activityMeta = meta;
    paintCollapsed(turn.trailHost, meta);
  } else {
    turn.trailHost.innerHTML = "";
  }
}

function onActivity(payload: ActivityIpcEvent): void {
  const turn = byRequest.get(payload.id);
  if (!turn) return;

  const { id: _id, ...rest } = payload;
  const ev = rest as ActivityEvent;
  turn.events = applyActivity(turn.events || [], ev);

  if (ev.kind === "thinking" && ev.phase === "start") {
    turn.thoughtStartedAt = Date.now();
    clearThoughtTicker(turn);
    turn.thoughtTimer = setInterval(() => repaintTrail(turn), 500);
  } else if (ev.kind === "thinking" && ev.phase === "end") {
    clearThoughtTicker(turn);
    turn.thoughtStartedAt = null;
  }

  if (ev.kind === "confirm") {
    turn.pendingConfirm = {
      token: ev.token,
      label: ev.label,
      tool: ev.tool,
      args: ev.args,
    };
  } else if (turn.pendingConfirm) {
    // Timeout / tool finished / loop continued without trail/strip click.
    if (
      (ev.kind === "tool" && ev.status === "done") ||
      ev.kind === "thinking" ||
      ev.kind === "status"
    ) {
      dropPendingConfirm(turn);
    }
  }

  if (ev.kind === "done") {
    clearThoughtTicker(turn);
    turn.thoughtStartedAt = null;
    dropPendingConfirm(turn);
    turn.activityMeta = {
      thoughtMs: ev.thoughtMs,
      toolCount: ev.toolCount,
      summary: ev.summary,
      events: turn.events,
    };
  }

  if (activeKey() === turn.key) repaintTrail(turn);
}

// --- persistence ------------------------------------------------------------

// Persist a file artifact to the conversation that owns the in-flight request.
export async function handleFileGenerated({
  id,
  name,
  ext,
  dir,
}: GeneratedFile & { id: string }) {
  const turn = id ? byRequest.get(id) : null;
  const artifact = fileArtifact({ name, ext, dir: dir || "" });
  if (turn) {
    await persistStoredMessage(turn, artifact);
    if (activeKey() === turn.key) await renderFileCard(artifact);
    return;
  }
  // Fallback when the request id is unknown: persist to the active conversation.
  if (!activeKey()) return;
  state.chat.push(artifact);
  if (state.mode === "project" && state.current && state.thread) {
    await window.api.updateThread(state.current.id, state.thread.id, { messages: state.chat });
  } else if (state.mode === "chat" && state.current) {
    await window.api.updateChat(state.current.id, { messages: state.chat });
  }
  await renderFileCard(artifact);
}

async function persistStoredMessage(turn, artifact: StoredMessage) {
  if (turn.mode === "project") {
    const stored = await window.api.getThread(turn.projectId, turn.threadId);
    const messages = [...((stored && stored.messages) || []), artifact];
    await window.api.updateThread(turn.projectId, turn.threadId, { messages });
  } else {
    const stored = await window.api.getChat(turn.chatId);
    const messages = [...((stored && stored.messages) || []), artifact];
    await window.api.updateChat(turn.chatId, { messages });
  }
  if (activeKey() === turn.key) state.chat.push(artifact);
}

// Append the finished reply to whichever conversation it belongs to, reading
// the stored record rather than the on-screen one: the user may be elsewhere.
async function commit(turn, text: string) {
  if (!text) return;
  const message: ChatMessage = { role: "assistant", content: text };
  const meta = resolveActivityMeta(turn);
  if (meta) {
    turn.activityMeta = meta;
    message.activity = meta;
  }
  if (turn.mode === "project") {
    const stored = await window.api.getThread(turn.projectId, turn.threadId);
    const messages = [...((stored && stored.messages) || []), message];
    await window.api.updateThread(turn.projectId, turn.threadId, { messages });
    const title = await maybeTitle(turn.model, messages, stored && stored.title);
    if (title) {
      await window.api.updateThread(turn.projectId, turn.threadId, { title });
      if (activeKey() === turn.key) el("convo-name").value = title;
      paintRecentsTitle(turn.key, title);
    }
  } else {
    const stored = await window.api.getChat(turn.chatId);
    const messages = [...((stored && stored.messages) || []), message];
    await window.api.updateChat(turn.chatId, { messages });
    const title = await maybeTitle(turn.model, messages, stored && stored.title);
    if (title) {
      await window.api.updateChat(turn.chatId, { title });
      if (activeKey() === turn.key) el("convo-name").value = title;
      paintRecentsTitle(turn.key, title);
    }
  }
  // Keep the on-screen transcript in step when this is the open conversation.
  if (activeKey() === turn.key) state.chat.push(message);
}

// --- view attach / detach ---------------------------------------------------

// Called when the conversation view is cleared (switching chats).
export function detachAll(): void {
  for (const turn of turns.values()) {
    turn.bubble = null;
    turn.renderer = null;
    turn.trailHost = null;
  }
  clearAsk();
  paintWorkingStrip(null);
}

// Called after a conversation's history is rendered: re-attach a live turn.
export function attachTurn(key: string): void {
  const turn = turnFor(key);
  if (!turn || turn.status === "done") return;
  const wrap = el("messages");
  turn.trailHost = createTrailHost();
  wrap.appendChild(turn.trailHost);
  turn.bubble = addThinking();
  turn.renderer = createStreamRenderer(turn.bubble);
  if (turn.acc) turn.renderer.push(turn.acc);
  if (turn.pendingAsk) showAsk(turn);
  repaintTrail(turn);
  wrap.scrollTop = wrap.scrollHeight;
}

// --- questions --------------------------------------------------------------

export function appendAskAnswered(question: string, text: string | null) {
  const wrap = el("messages");
  const box = node("div", "ask-answered");
  box.appendChild(node("div", "ask-answered-q", question));
  box.appendChild(
    node("div", "ask-answered-a", text == null ? "Skipped" : `You chose: ${text}`)
  );
  wrap.appendChild(box);
}

async function answer(turn, text: string | null) {
  const ask = turn.pendingAsk;
  if (!ask) return;
  turn.pendingAsk = null;
  const question = ask.question || "";
  const artifact = askArtifact({ question, answer: text });
  await persistStoredMessage(turn, artifact);
  window.api.replyAsk(ask.token, text);
  setActivity(turn.key, "working");
  if (activeKey() === turn.key) {
    clearAsk();
    appendAskAnswered(question, text);
    el("messages").scrollTop = el("messages").scrollHeight;
    el("chat-input").placeholder = turn.placeholder || "Message…";
    syncWorkingStrip();
  }
}

function showAsk(turn) {
  renderAsk(turn.pendingAsk, {
    onAnswer: (text) => answer(turn, text),
    onSkip: () => answer(turn, null),
    onFreeform: () => {
      el("chat-input").placeholder = "Type your answer…";
      el("chat-input").focus();
    },
  });
}

// Answer the open question from the composer (the "Something else" path).
export function answerFromComposer(text: string): boolean {
  const turn = activeTurn();
  if (!turn || !turn.pendingAsk) return false;
  answer(turn, text);
  return true;
}

function onAsk(payload) {
  const turn = byRequest.get(payload.id);
  if (!turn) {
    // Nothing is tracking this request; unblock the model rather than hang.
    window.api.replyAsk(payload.token, null);
    return;
  }
  turn.pendingAsk = {
    token: payload.token,
    question: payload.question,
    options: payload.options || [],
    recommended: payload.recommended || "",
  };
  setActivity(turn.key, "waiting", turn.label);
  notifyWaiting(turn.key, payload.question);
  if (activeKey() === turn.key) {
    showAsk(turn);
    syncWorkingStrip();
  }
}

let bound = false;
export function initTurns(): void {
  if (bound) return;
  bound = true;
  window.api.onAsk(onAsk);
  window.api.onActivity(onActivity);
  setWorkingStripActions({
    stop: () => {
      const key = activeKey();
      if (key) stopTurn(key);
    },
    confirm: replyActiveConfirm,
  });
}

// --- running ----------------------------------------------------------------

export function isBusy(key: string): boolean {
  const turn = turnFor(key);
  return !!turn && turn.status !== "done";
}

export function stopTurn(key: string): void {
  const turn = turnFor(key);
  if (turn && turn.id) window.api.cancelChat(turn.id);
}

// Recovery stripped tool-call JSON from the reply mid-stream: drop it from
// the visible bubble (and the accumulator persistence reads from) before the
// next tool round's chunks resume appending.
function replaceTurnText(turn, text: string): void {
  if (turn.renderer) turn.renderer.cancel();
  turn.acc = text || "";
  if (!turn.bubble) {
    turn.renderer = null;
    return;
  }
  setBubbleMarkdown(turn.bubble, turn.acc);
  turn.renderer = createStreamRenderer(turn.bubble);
  if (turn.acc) turn.renderer.push(turn.acc);
}

// Start a turn. Resolves when it finishes, but nothing depends on that: the
// turn cleans up after itself so the caller can walk away.
export async function runTurn(ctx): Promise<void> {
  const wrap = el("messages");
  const trailHost = createTrailHost();
  wrap.appendChild(trailHost);
  const bubble = addThinking();
  const turn = {
    ...ctx,
    id: null,
    acc: "",
    status: "working",
    pendingAsk: null,
    pendingConfirm: null,
    events: [] as ActivityEvent[],
    activityMeta: null as MessageActivity | null,
    thoughtStartedAt: null as number | null,
    thoughtTimer: null as ReturnType<typeof setInterval> | null,
    trailHost,
    bubble,
    renderer: createStreamRenderer(bubble),
  };
  turns.set(turn.key, turn);
  setActivity(turn.key, "working", turn.label);
  syncWorkingStrip();

  try {
    const result = await window.api.chat(
      {
        projectId: ctx.projectId,
        threadId: ctx.threadId,
        model: ctx.model,
        messages: llmMessages(ctx.messages),
        attachments: ctx.attachments,
        useTools: ctx.useTools,
      },
      (piece) => {
        turn.acc += piece;
        if (turn.renderer) turn.renderer.push(piece);
      },
      (id) => {
        turn.id = id;
        byRequest.set(id, turn);
      },
      (text) => replaceTurnText(turn, text)
    );

    turn.status = "done";
    if (turn.renderer) turn.renderer.cancel();
    const text = turn.acc;
    if (turn.bubble) {
      setBubbleMarkdown(turn.bubble, text || "_(stopped before any reply)_");
      if (result.stopped) turn.bubble.appendChild(node("div", "msg-stopped", "Stopped"));
      if (result.usage) {
        setContextUsage(result.usage);
        attachTokenStats(turn.bubble, result.usage);
      }
    }
    collapseTrail(turn);
    await commit(turn, text);
  } catch (e) {
    turn.status = "done";
    if (turn.renderer) turn.renderer.cancel();
    if (turn.bubble) {
      turn.bubble.classList.remove("thinking", "raw");
      turn.bubble.textContent = `Error: ${e.message}`;
    }
    collapseTrail(turn);
  } finally {
    clearThoughtTicker(turn);
    if (turn.id) byRequest.delete(turn.id);
    turns.delete(turn.key);
    clearActivity(turn.key);
    if (activeKey() === turn.key) {
      clearAsk();
      paintWorkingStrip(null);
    }
  }
}
