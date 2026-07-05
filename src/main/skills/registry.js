// Skill registry: built-in connector skills (Google Calendar, Outlook) plus
// user-defined custom skills. A skill = instructions injected into the system
// prompt + a bundle of tools offered to the model, enabled as one unit.
//
// Custom skills persist in userData/anylm-skills.json:
//   { disabled: [ids], custom: [{ id, name, description, instructions,
//     toolNames: [names from the tools registry], enabled }] }
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { BUILTIN_SKILLS } = require("./builtins");
const toolsRegistry = require("../tools/registry");

function filePath() {
  return path.join(app.getPath("userData"), "anylm-skills.json");
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(filePath(), "utf8"));
  } catch {
    return { disabled: [], custom: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2));
}

function newId() {
  return "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// All skills with enabled state, for the Skills manager UI. Built-in skills
// are disabled by default until the user flips them on.
function list() {
  const store = readStore();
  const builtins = BUILTIN_SKILLS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    connector: s.connector,
    builtin: true,
    enabled: store.enabledBuiltins ? store.enabledBuiltins.includes(s.id) : false,
    toolNames: s.tools.map((t) => t.name),
  }));
  const custom = (store.custom || []).map((s) => ({ ...s, builtin: false, connector: null }));
  return [...builtins, ...custom];
}

function enabledSkills() {
  return list().filter((s) => s.enabled);
}

function toggle(id, enabled) {
  const store = readStore();
  if (BUILTIN_SKILLS.some((s) => s.id === id)) {
    store.enabledBuiltins = (store.enabledBuiltins || []).filter((e) => e !== id);
    if (enabled) store.enabledBuiltins.push(id);
  } else {
    const s = (store.custom || []).find((c) => c.id === id);
    if (s) s.enabled = enabled;
  }
  writeStore(store);
  return true;
}

// Create or update a custom skill.
// skill: { id?, name, description, instructions, toolNames: [string] }
function save(skill) {
  const store = readStore();
  store.custom = store.custom || [];
  const clean = {
    id: skill.id || newId(),
    name: String(skill.name || "").trim().slice(0, 64),
    description: String(skill.description || ""),
    instructions: String(skill.instructions || ""),
    toolNames: Array.isArray(skill.toolNames)
      ? skill.toolNames.map(String).filter(Boolean)
      : [],
    enabled: skill.enabled !== false,
  };
  const i = store.custom.findIndex((c) => c.id === clean.id);
  if (i === -1) store.custom.push(clean);
  else store.custom[i] = clean;
  writeStore(store);
  return clean;
}

function remove(id) {
  const store = readStore();
  store.custom = (store.custom || []).filter((c) => c.id !== id);
  writeStore(store);
  return true;
}

// Full built-in skill (with runnable tools) by id.
function builtinSkill(id) {
  return BUILTIN_SKILLS.find((s) => s.id === id) || null;
}

// Locate a connector tool by name across enabled built-in skills.
// Returns { skill, tool } or null. Custom-skill tools live in the tools
// registry and are executed there.
function findConnectorTool(name) {
  for (const enabled of enabledSkills()) {
    if (!enabled.builtin) continue;
    const skill = builtinSkill(enabled.id);
    const tool = skill && skill.tools.find((t) => t.name === name);
    if (tool) return { skill, tool };
  }
  return null;
}

// System-prompt block for all enabled skills (shown only when tools are on).
function instructionsBlock() {
  const parts = [];
  for (const s of enabledSkills()) {
    const instructions = s.builtin ? builtinSkill(s.id).instructions : s.instructions;
    if (instructions && instructions.trim()) {
      parts.push(`Skill "${s.name}":\n${instructions.trim()}`);
    }
  }
  return parts.length ? `Enabled skills:\n\n${parts.join("\n\n")}` : "";
}

// Ollama function definitions contributed by enabled skills. Built-in skills
// bring their own connector tools; custom skills pull the registry tools
// they reference (even ones globally disabled — enabling the skill is the
// user's opt-in).
function ollamaTools() {
  const defs = [];
  const seen = new Set();
  for (const s of enabledSkills()) {
    if (s.builtin) {
      for (const t of builtinSkill(s.id).tools) {
        if (!seen.has(t.name)) {
          seen.add(t.name);
          defs.push(toOllama(t));
        }
      }
    } else {
      for (const name of s.toolNames || []) {
        const t = toolsRegistry.get(name);
        if (t && !seen.has(t.name)) {
          seen.add(t.name);
          defs.push(toOllama(t));
        }
      }
    }
  }
  return defs;
}

// Registry-tool names referenced by enabled custom skills — the chat loop
// lets these execute even when globally disabled.
function customToolNames() {
  const names = new Set();
  for (const s of enabledSkills()) {
    if (!s.builtin) for (const n of s.toolNames || []) names.add(n);
  }
  return names;
}

function toOllama(t) {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          (t.params || []).map((p) => [p.name, { type: "string", description: p.description }])
        ),
        required: (t.params || []).filter((p) => p.required).map((p) => p.name),
      },
    },
  };
}

module.exports = {
  list,
  enabledSkills,
  toggle,
  save,
  remove,
  builtinSkill,
  findConnectorTool,
  instructionsBlock,
  ollamaTools,
  customToolNames,
};
