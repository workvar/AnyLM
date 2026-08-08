// Skills manager: built-in connector skills (Google Calendar, Outlook) with
// connect/disconnect, plus custom skills bundling instructions with tools.
import { el, node } from "./dom.js";
import { createSwitch } from "./switch.js";

let editing = null; // skill being edited, or null for new
let connectors = []; // cached /connectors status

export async function openSkillsView() {
  const [skills, conns] = await Promise.all([
    window.api.skillsList(),
    window.api.skillsConnectors().catch(() => []),
  ]);
  connectors = conns;
  const body = el("skills-body");
  body.innerHTML = "";

  body.appendChild(
    node(
      "div",
      "org-hint",
      "A skill bundles instructions and tools the model gets when the ⚒ toggle is on in a chat. " +
        "Connector skills (Calendar, Outlook) need their account connected first. Write actions always ask before running."
    )
  );

  const groups = [
    ["Built-in skills", skills.filter((s) => s.builtin)],
    ["Custom skills", skills.filter((s) => !s.builtin)],
  ];
  for (const [title, list] of groups as Array<[string, SkillDefinition[]]>) {
    const head = node("div", "org-section-head");
    head.appendChild(node("h2", "org-section-title", title));
    body.appendChild(head);
    const table = node("div", "org-table");
    if (!list.length)
      table.appendChild(node("div", "grid-empty", "No custom skills yet. Create one with “New skill”."));
    for (const s of list) table.appendChild(skillRow(s));
    body.appendChild(table);
  }
}

function connFor(skill) {
  return connectors.find((c) => c.provider === skill.connector) || null;
}

function skillRow(s) {
  const row = node("div", "skill-row");
  const main = node("div", "skill-row-main");
  const name = node("div", "org-who-name", s.name);
  const conn = s.connector ? connFor(s) : null;
  if (conn && conn.connected)
    name.appendChild(node("span", "skill-connected", ` connected${conn.accountEmail ? ` · ${conn.accountEmail}` : ""}`));
  main.appendChild(name);
  const sub = s.description || "";
  const toolsLine = (s.toolNames || []).join(", ");
  main.appendChild(node("div", "org-who-mail", toolsLine ? `${sub} — tools: ${toolsLine}` : sub));
  row.appendChild(main);

  const actions = node("div", "skill-row-actions");
  const needsConnection = !!(s.builtin && s.connector);
  const connected = !!(conn && conn.connected);
  // Connector skills stay off until linked — hide the enable switch until then.
  if (!needsConnection || connected) {
    actions.appendChild(
      createSwitch(s.enabled !== false, (on) => {
        window.api.skillsToggle(s.id, on);
      })
    );
  }
  if (needsConnection) {
    actions.appendChild(connectButton(s, conn));
  } else if (!s.builtin) {
    const edit = node("button", "ghost small", "Edit");
    edit.onclick = () => openSkillModal(s);
    const del = node("button", "ghost small danger", "Delete");
    del.onclick = async () => {
      await window.api.skillsDelete(s.id);
      await openSkillsView();
    };
    actions.append(edit, del);
  }
  row.appendChild(actions);
  return row;
}

function connectButton(s, conn) {
  if (conn && !conn.configured) {
    const b = node("button", "ghost small", "Not configured");
    b.disabled = true;
    b.title = "Set the provider's client ID/secret in the auth backend's .env";
    return b;
  }
  if (conn && conn.connected) {
    const b = node("button", "ghost small danger", "Disconnect");
    b.onclick = async () => {
      connectors = await window.api.skillsDisconnect(s.connector);
      await openSkillsView();
    };
    return b;
  }
  const b = node("button", "primary small", "Connect");
  b.onclick = async () => {
    b.disabled = true;
    b.textContent = "Waiting for browser…";
    try {
      connectors = await window.api.skillsConnect(s.connector);
    } catch (e) {
      alert(e.message || "Connecting failed");
    }
    await openSkillsView();
  };
  return b;
}

// ---------- custom skill editor modal ----------

async function openSkillModal(skill) {
  editing = skill || null;
  el("skill-modal-title").textContent = skill ? "Edit skill" : "New skill";
  el("skill-name").value = skill ? skill.name : "";
  el("skill-desc").value = skill ? skill.description : "";
  el("skill-instructions").value = skill ? skill.instructions || "" : "";

  // Tool picker: every registry tool as a checkbox.
  const tools = await window.api.toolsList();
  const box = el("skill-tools");
  box.innerHTML = "";
  const selected = new Set((skill && skill.toolNames) || []);
  for (const t of tools) {
    const label = node("label", "skill-tool-check");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = t.name;
    cb.checked = selected.has(t.name);
    label.appendChild(cb);
    label.appendChild(node("span", "", ` ${t.name}${t.risky ? " (risky)" : ""}`));
    box.appendChild(label);
  }

  el("skill-error").textContent = "";
  el("skill-modal").classList.remove("hidden");
}

async function saveSkill() {
  const name = el("skill-name").value.trim();
  if (!name) {
    el("skill-error").textContent = "Give the skill a name.";
    return;
  }
  const toolNames = [...el("skill-tools").querySelectorAll("input:checked")].map((c) => c.value);
  const instructions = el("skill-instructions").value.trim();
  if (!instructions && !toolNames.length) {
    el("skill-error").textContent = "A skill needs instructions, tools, or both.";
    return;
  }
  await window.api.skillsSave({
    id: editing ? editing.id : undefined,
    name,
    description: el("skill-desc").value.trim(),
    instructions,
    toolNames,
  });
  el("skill-modal").classList.add("hidden");
  await openSkillsView();
}

export function initSkills() {
  el("new-skill-btn").onclick = () => openSkillModal(null);
  el("skill-cancel").onclick = () => el("skill-modal").classList.add("hidden");
  el("skill-save").onclick = saveSkill;
  el("skill-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "skill-modal") el("skill-modal").classList.add("hidden");
  };
}
