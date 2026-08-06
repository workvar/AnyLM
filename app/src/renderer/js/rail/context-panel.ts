// Context panel: what the model was actually given this turn, plus the
// project's standing memory (files and knowledge graph).
import { el, node } from "../dom.js";
import { state } from "../state.js";

let lastTurn: ChatContextEvent | null = null;

function row(label: string, value: string) {
  const r = node("div", "rail-row");
  r.appendChild(node("span", "rail-row-label", label));
  r.appendChild(node("span", "rail-row-value", value));
  return r;
}

function chips(items: string[]) {
  const wrap = node("div", "rail-chips");
  for (const item of items) wrap.appendChild(node("span", "rail-chip", item));
  return wrap;
}

async function paint() {
  const wrap = el("rail-context");
  wrap.innerHTML = "";

  const projectId = state.mode === "project" && state.current ? state.current.id : null;
  if (projectId) {
    wrap.appendChild(row("Project", state.current.name || "Untitled"));
    try {
      const files = await window.api.pfilesList(projectId);
      if (files.files.length) {
        wrap.appendChild(node("div", "rail-label", "Files"));
        wrap.appendChild(chips(files.files.slice(0, 8).map((f) => f.name)));
      }
      const graph = await window.api.graphSummary(projectId);
      if (graph.entities) {
        wrap.appendChild(
          row("Knowledge graph", `${graph.entities} entities · ${graph.relations} links`)
        );
        if (graph.top.length) wrap.appendChild(chips(graph.top));
      }
    } catch {
      /* panel is informational; a failed read just shows less */
    }
  } else {
    wrap.appendChild(row("Scope", "Standalone chat"));
  }

  if (!lastTurn) return;
  wrap.appendChild(node("div", "rail-label", "Used in the last reply"));
  if (lastTurn.sources.length) wrap.appendChild(chips(lastTurn.sources));
  if (lastTurn.attachments.length) wrap.appendChild(chips(lastTurn.attachments));
  const flags = [
    lastTurn.memory && "project memory",
    lastTurn.graph && "knowledge graph",
    lastTurn.general ? `${lastTurn.general} general excerpts` : "",
    lastTurn.customized && "your context",
    lastTurn.document && `${lastTurn.document.toUpperCase()} request`,
  ].filter(Boolean) as string[];
  if (flags.length) wrap.appendChild(chips(flags));
  if (!lastTurn.sources.length && !lastTurn.attachments.length && !flags.length) {
    wrap.appendChild(node("div", "rail-empty", "Conversation history only."));
  }
}

export function setTurnContext(ctx: ChatContextEvent) {
  lastTurn = ctx;
  paint();
}

export function refreshContext() {
  paint();
}

export function resetContext() {
  lastTurn = null;
  paint();
}
