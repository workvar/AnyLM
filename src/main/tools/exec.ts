// Tool execution. Every result is a string handed back to the model.
// Risky tools (shell, app launches, non-GET HTTP) go through `confirm`,
// an async callback that asks the user before running.
import { shell } from "electron";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as registry from "./registry";
import * as fsTools from "./fs-tools";
import * as webSearch from "./web-search";
import * as documents from "../documents";

const MAX_OUTPUT = 20_000; // chars returned to the model
const SHELL_TIMEOUT = 15_000;

function clip(s) {
  const str = String(s == null ? "" : s);
  return str.length > MAX_OUTPUT ? str.slice(0, MAX_OUTPUT) + "\n…(truncated)" : str;
}

function shellEscape(v) {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

function runShell(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: SHELL_TIMEOUT, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) return resolve(`Error: ${err.message}`);
      resolve(clip([stdout, stderr].filter(Boolean).join("\n")) || "(no output)");
    });
  });
}

async function httpFetch(url: string, method = "GET", body?: unknown): Promise<string> {
  // Tools hand us either a ready-made string or a plain object; normalise so
  // an object body is not stringified as "[object Object]".
  const payload =
    body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  try {
    const res = await fetch(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload,
    });
    const text = await res.text();
    return clip(`HTTP ${res.status}\n${text}`);
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
}

// Whether this specific call needs confirmation.
function isRisky(tool, args) {
  if (tool.name === "http_fetch")
    return String(args.method || "GET").toUpperCase() !== "GET";
  if (!tool.builtin && tool.kind === "http")
    return String(tool.method || "GET").toUpperCase() !== "GET";
  return !!tool.risky;
}

async function execBuiltin(tool, args, context) {
  switch (tool.name) {
    case "generate_document": {
      if (!context || !context.projectId)
        return "Error: documents can only be generated inside a project chat. Ask the user to open a project first.";
      try {
        const file = await documents.generate(context.projectId, args);
        if (context.onFile) context.onFile(file);
        return `Created "${file.name}" in the project folder. Tell the user it is ready; do not repeat the document content in your reply.`;
      } catch (e) {
        return `Error: ${e.message}`;
      }
    }
    case "get_time":
      return new Date().toString();
    case "read_file": {
      const p = String(args.path || "");
      if (!p) return "Error: path required";
      try {
        const abs = fsTools.resolveRead(p);
        const stat = fs.statSync(abs);
        if (stat.size > 512 * 1024) return "Error: file larger than 512KB";
        return clip(fs.readFileSync(abs, "utf8"));
      } catch (e) {
        return `Error: ${e.message}`;
      }
    }
    case "list_directory":
      try {
        return clip(fsTools.listDirectory(args));
      } catch (e) {
        return `Error: ${e.message}`;
      }
    case "write_file":
      return fsTools.writeFile(args);
    case "create_directory":
      return fsTools.createDirectory(args);
    case "move_path":
      return fsTools.movePath(args);
    case "copy_path":
      return fsTools.copyPath(args);
    case "delete_path":
      return await fsTools.deletePath(args);
    case "find_files":
      return clip(fsTools.findFiles(args));
    case "web_search":
      return clip(await webSearch.search(String(args.query || "")));
    case "open_app_or_url": {
      const target = String(args.target || "").trim();
      if (!target) return "Error: target required";
      if (/^https?:\/\//i.test(target)) {
        await shell.openExternal(target);
        return `Opened ${target} in the browser.`;
      }
      if (path.isAbsolute(target)) {
        const err = await shell.openPath(target);
        return err ? `Error: ${err}` : `Opened ${target}.`;
      }
      // Application by name (macOS `open -a`, Windows `start`, Linux best-effort).
      const cmd =
        process.platform === "darwin"
          ? `open -a ${shellEscape(target)}`
          : process.platform === "win32"
          ? `start "" ${shellEscape(target)}`
          : `${shellEscape(target.toLowerCase())} &`;
      const out = await runShell(cmd);
      return String(out).startsWith("Error") ? out : `Launched ${target}.`;
    }
    case "run_shell":
      return runShell(String(args.command || ""));
    case "http_fetch":
      return httpFetch(String(args.url || ""), String(args.method || "GET").toUpperCase(), args.body);
    default:
      return `Error: unknown builtin "${tool.name}"`;
  }
}

async function execCustom(tool, args) {
  if (tool.kind === "http") {
    let url = tool.url;
    for (const p of tool.params || []) {
      url = url.replaceAll(`{${p.name}}`, encodeURIComponent(String(args[p.name] ?? "")));
    }
    return httpFetch(url, tool.method || "GET");
  }
  // Shell tool: substitute {param} placeholders with escaped values.
  let cmd = tool.command;
  for (const p of tool.params || []) {
    cmd = cmd.replaceAll(`{${p.name}}`, shellEscape(String(args[p.name] ?? "")));
  }
  return runShell(cmd);
}

// Execute a tool call from the model.
// confirm(tool, args) → Promise<boolean>; only invoked for risky calls.
// allow: optional Set of names permitted even when globally disabled
// (tools referenced by an enabled skill).
// context: { projectId, onFile } — chat context for tools that write project files.
async function execute(name, args, confirm, allow, context) {
  const tool = registry.get(name);
  const allowed = tool && (tool.enabled !== false || (allow && allow.has(name)));
  if (!allowed) return `Error: tool "${name}" is not available`;
  const parsedArgs = args && typeof args === "object" ? args : {};
  if (isRisky(tool, parsedArgs)) {
    const ok = await confirm(tool, parsedArgs);
    if (!ok) return "The user declined to run this tool.";
  }
  try {
    return tool.builtin
      ? await execBuiltin(tool, parsedArgs, context)
      : await execCustom(tool, parsedArgs);
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

export { execute, isRisky };

