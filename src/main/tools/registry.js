// Tool registry: built-in tools plus user-defined custom tools.
// Custom tools persist in userData/anylm-tools.json. Definitions convert to
// Ollama function-calling schemas via ollamaTools().
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

// Built-ins. `risky: true` tools require user confirmation before running.
const BUILTINS = [
  {
    id: "get_time",
    name: "get_time",
    builtin: true,
    risky: false,
    description: "Get the current date and time on this computer.",
    params: [],
  },
  {
    id: "read_file",
    name: "read_file",
    builtin: true,
    risky: false,
    description: "Read a text file and return its contents. Paths may be relative to the working folder.",
    params: [{ name: "path", description: "File path (relative to working folder, or absolute)", required: true }],
  },
  {
    id: "list_directory",
    name: "list_directory",
    builtin: true,
    risky: false,
    description:
      "List files and folders in a directory, with sizes and modified dates. Paths may be relative to the working folder.",
    params: [{ name: "path", description: "Directory path (relative to working folder, or absolute)", required: true }],
  },
  {
    id: "write_file",
    name: "write_file",
    builtin: true,
    risky: false,
    description:
      "Create or overwrite a text file inside the working folder (code, notes, configs). Parent folders are created automatically.",
    params: [
      { name: "path", description: "File path relative to the working folder", required: true },
      { name: "content", description: "Full text content of the file", required: true },
    ],
  },
  {
    id: "create_directory",
    name: "create_directory",
    builtin: true,
    risky: false,
    description: "Create a folder (and any missing parents) inside the working folder.",
    params: [{ name: "path", description: "Folder path relative to the working folder", required: true }],
  },
  {
    id: "move_path",
    name: "move_path",
    builtin: true,
    risky: false,
    description: "Move or rename a file or folder inside the working folder. Use this to organize files.",
    params: [
      { name: "from", description: "Current path, relative to the working folder", required: true },
      { name: "to", description: "New path, relative to the working folder", required: true },
    ],
  },
  {
    id: "copy_path",
    name: "copy_path",
    builtin: true,
    risky: false,
    description: "Copy a file or folder inside the working folder.",
    params: [
      { name: "from", description: "Source path, relative to the working folder", required: true },
      { name: "to", description: "Destination path, relative to the working folder", required: true },
    ],
  },
  {
    id: "delete_path",
    name: "delete_path",
    builtin: true,
    risky: true,
    description: "Move a file or folder in the working folder to the system trash (recoverable).",
    params: [{ name: "path", description: "Path relative to the working folder", required: true }],
  },
  {
    id: "find_files",
    name: "find_files",
    builtin: true,
    risky: false,
    description:
      "Search the working folder recursively for files/folders whose name matches a substring or *glob* pattern.",
    params: [
      { name: "query", description: "Name substring or glob, e.g. *.png or report", required: true },
      { name: "path", description: "Subfolder to search (default: whole working folder)", required: false },
    ],
  },
  {
    id: "web_search",
    name: "web_search",
    builtin: true,
    risky: false,
    description:
      "Search the web (DuckDuckGo) and return top results with URLs and snippets. Use when you lack current or specific information.",
    params: [{ name: "query", description: "Search query", required: true }],
  },
  {
    id: "open_app_or_url",
    name: "open_app_or_url",
    builtin: true,
    risky: true,
    description:
      "Open an application, file, or URL on this computer (e.g. open a website in the browser, open Calculator, open a document).",
    params: [
      {
        name: "target",
        description: "A URL (https://…), an absolute file path, or an application name",
        required: true,
      },
    ],
  },
  {
    id: "run_shell",
    name: "run_shell",
    builtin: true,
    risky: true,
    description:
      "Run a shell command on this computer and return its output. Use for automation the other tools can't do.",
    params: [{ name: "command", description: "The shell command to execute", required: true }],
  },
  {
    id: "http_fetch",
    name: "http_fetch",
    builtin: true,
    risky: false, // non-GET methods are escalated to risky at execution time
    description: "Call an HTTP API and return the response body (for local or web services).",
    params: [
      { name: "url", description: "Full URL to request", required: true },
      { name: "method", description: "HTTP method (default GET)", required: false },
      { name: "body", description: "Request body for POST/PUT (JSON string)", required: false },
    ],
  },
];

function filePath() {
  return path.join(app.getPath("userData"), "anylm-tools.json");
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
  return "t_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// All tools with their enabled state (for the Tools manager UI).
function list() {
  const store = readStore();
  const builtins = BUILTINS.map((t) => ({ ...t, enabled: !store.disabled.includes(t.id) }));
  const custom = (store.custom || []).map((t) => ({ ...t, builtin: false }));
  return [...builtins, ...custom];
}

function enabledTools() {
  return list().filter((t) => t.enabled !== false);
}

function get(name) {
  return list().find((t) => t.name === name) || null;
}

function toggle(id, enabled) {
  const store = readStore();
  if (BUILTINS.some((t) => t.id === id)) {
    store.disabled = (store.disabled || []).filter((d) => d !== id);
    if (!enabled) store.disabled.push(id);
  } else {
    const t = (store.custom || []).find((c) => c.id === id);
    if (t) t.enabled = enabled;
  }
  writeStore(store);
  return true;
}

// Create or update a custom tool.
// tool: { id?, name, description, kind: "shell"|"http", command?, url?, method?, params: [{name, description, required}] }
function save(tool) {
  const store = readStore();
  store.custom = store.custom || [];
  const clean = {
    id: tool.id || newId(),
    name: sanitizeName(tool.name),
    description: String(tool.description || ""),
    kind: tool.kind === "http" ? "http" : "shell",
    command: String(tool.command || ""),
    url: String(tool.url || ""),
    method: String(tool.method || "GET").toUpperCase(),
    params: Array.isArray(tool.params)
      ? tool.params
          .filter((p) => p && p.name)
          .map((p) => ({
            name: sanitizeName(p.name),
            description: String(p.description || ""),
            required: !!p.required,
          }))
      : [],
    enabled: tool.enabled !== false,
    // Shell tools are always risky; HTTP tools only when non-GET.
    risky: tool.kind !== "http" || String(tool.method || "GET").toUpperCase() !== "GET",
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

function sanitizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

// Ollama /api/chat `tools` payload for all enabled tools.
function ollamaTools() {
  return enabledTools().map((t) => ({
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
  }));
}

module.exports = { list, enabledTools, get, toggle, save, remove, ollamaTools };
