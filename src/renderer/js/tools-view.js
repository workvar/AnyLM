// Tools manager: list built-in and custom tools, toggle them, and edit
// custom tools (shell commands or HTTP requests the model can call).
import { el, node } from "./dom.js";

let editing = null; // tool being edited, or null for new

export async function openToolsView() {
  const tools = await window.api.toolsList();
  const body = el("tools-body");
  body.innerHTML = "";

  body.appendChild(
    node(
      "div",
      "org-hint",
      "Enabled tools are offered to the model when the ⚒ toggle is on in a chat. Risky tools (shell, app launches, non-GET requests) always ask before running."
    )
  );

  const groups = [
    ["Built-in tools", tools.filter((t) => t.builtin)],
    ["Custom tools", tools.filter((t) => !t.builtin)],
  ];
  for (const [title, list] of groups) {
    const head = node("div", "org-section-head");
    head.appendChild(node("h2", "org-section-title", title));
    body.appendChild(head);
    const table = node("div", "org-table");
    if (!list.length) table.appendChild(node("div", "grid-empty", "No custom tools yet. Create one with “New tool”."));
    for (const t of list) table.appendChild(toolRow(t));
    body.appendChild(table);
  }
}

function toolRow(t) {
  const row = node("div", "org-row policy-row");
  const main = node("div", "org-cell org-who");
  const name = node("div", "org-who-name", t.name);
  if (t.risky) name.appendChild(node("span", "tool-risky", " risky"));
  main.appendChild(name);
  main.appendChild(node("div", "org-who-mail", t.description || ""));
  row.appendChild(main);

  const toggleWrap = node("label", "switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = t.enabled !== false;
  input.onchange = () => window.api.toolsToggle(t.id, input.checked);
  toggleWrap.appendChild(input);
  toggleWrap.appendChild(node("span", "track"));
  const cell = node("div", "org-cell");
  cell.appendChild(toggleWrap);
  row.appendChild(cell);

  const actions = node("div", "org-cell org-row-actions");
  if (!t.builtin) {
    const edit = node("button", "ghost small", "Edit");
    edit.onclick = () => openToolModal(t);
    const del = node("button", "ghost small danger", "Delete");
    del.onclick = async () => {
      await window.api.toolsDelete(t.id);
      await openToolsView();
    };
    actions.append(edit, del);
  }
  row.appendChild(actions);
  return row;
}

// ---------- editor modal ----------

function openToolModal(tool) {
  editing = tool || null;
  el("tool-modal-title").textContent = tool ? "Edit tool" : "New tool";
  el("tool-name").value = tool ? tool.name : "";
  el("tool-desc").value = tool ? tool.description : "";
  el("tool-kind").value = tool ? tool.kind : "shell";
  el("tool-command").value = tool ? tool.command || "" : "";
  el("tool-url").value = tool ? tool.url || "" : "";
  el("tool-method").value = tool ? tool.method || "GET" : "GET";
  el("tool-params").value = (tool && tool.params ? tool.params : [])
    .map((p) => `${p.name} | ${p.description}${p.required ? " | required" : ""}`)
    .join("\n");
  paintKind();
  el("tool-error").textContent = "";
  el("tool-modal").classList.remove("hidden");
}

function paintKind() {
  const http = el("tool-kind").value === "http";
  el("tool-cfg-shell").classList.toggle("hidden", http);
  el("tool-cfg-http").classList.toggle("hidden", !http);
}

function parseParams(textValue) {
  return textValue
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, description, flag] = line.split("|").map((s) => (s || "").trim());
      return { name, description: description || "", required: /required/i.test(flag || "") };
    })
    .filter((p) => p.name);
}

async function saveTool() {
  const name = el("tool-name").value.trim();
  if (!name) {
    el("tool-error").textContent = "Give the tool a name.";
    return;
  }
  const kind = el("tool-kind").value;
  const tool = {
    id: editing ? editing.id : undefined,
    name,
    description: el("tool-desc").value.trim(),
    kind,
    command: el("tool-command").value.trim(),
    url: el("tool-url").value.trim(),
    method: el("tool-method").value,
    params: parseParams(el("tool-params").value),
  };
  if (kind === "shell" && !tool.command) {
    el("tool-error").textContent = "Shell tools need a command.";
    return;
  }
  if (kind === "http" && !tool.url) {
    el("tool-error").textContent = "HTTP tools need a URL.";
    return;
  }
  await window.api.toolsSave(tool);
  el("tool-modal").classList.add("hidden");
  await openToolsView();
}

export function initTools() {
  el("new-tool-btn").onclick = () => openToolModal(null);
  el("tool-kind").onchange = paintKind;
  el("tool-cancel").onclick = () => el("tool-modal").classList.add("hidden");
  el("tool-save").onclick = saveTool;
  el("tool-modal").onclick = (e) => {
    if (e.target.id === "tool-modal") el("tool-modal").classList.add("hidden");
  };
}
