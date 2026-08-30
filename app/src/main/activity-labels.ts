// Human labels for tool activity: what the model is DOING, in the user's
// words, not the tool's name. Phrased as an intent ("Running a command on
// your computer") so the chat flow reads as a narrative of the work.
const LABELS: Record<string, string> = {
  ask_user: "Asking you a question",
  generate_document: "Writing a document",
  web_search: "Searching the web",
  read_file: "Reading a file",
  list_directory: "Looking through a folder",
  find_files: "Searching your files",
  write_file: "Writing a file",
  create_directory: "Creating a folder",
  create_project: "Creating a project",
  move_path: "Moving a file",
  copy_path: "Copying a file",
  delete_path: "Moving a file to the trash",
  http_fetch: "Calling an API",
  run_shell: "Running a command on your computer",
  open_app_or_url: "Opening something on your computer",
  get_time: "Checking the time",
};

// A tool's family, used for icons and for grouping in the trail.
const KINDS: Record<string, string> = {
  read_file: "read",
  list_directory: "read",
  find_files: "search",
  web_search: "search",
  http_fetch: "network",
  write_file: "write",
  create_directory: "write",
  create_project: "write",
  move_path: "write",
  copy_path: "write",
  delete_path: "delete",
  generate_document: "document",
  run_shell: "shell",
  open_app_or_url: "shell",
  ask_user: "ask",
  get_time: "clock",
};

function labelFor(name: string): string {
  return LABELS[name] || `Using ${String(name || "a tool").replace(/_/g, " ")}`;
}

function kindFor(name: string): string {
  return KINDS[name] || "tool";
}

// The one-line detail under the label, per tool. Clamped so a long path or
// command never pushes the trail row into a wall of text.
const MAX_DETAIL = 60;

function detailFor(name: string, args: Record<string, unknown>): string {
  return clamp(rawDetail(name, args));
}

function clamp(s: string): string {
  return s.length > MAX_DETAIL ? s.slice(0, MAX_DETAIL) : s;
}

function rawDetail(name: string, args: Record<string, unknown>): string {
  const pick = (key: string) => String((args && args[key]) || "").trim();
  if (name === "ask_user") return pick("question");
  if (name === "generate_document") {
    const title = pick("title");
    const format = pick("format").toUpperCase();
    return title && format ? `${title}.${format.toLowerCase()}` : title || format;
  }
  if (name === "web_search") return pick("query");
  if (name === "run_shell") return pick("command");
  if (name === "http_fetch") return pick("url");
  if (name === "create_project") return pick("name");
  if (name === "write_file" || name === "create_directory" || name === "delete_path")
    return pick("path");
  if (name === "read_file" || name === "list_directory") return pick("path");
  if (name === "find_files") return pick("query");
  if (name === "move_path" || name === "copy_path") {
    const from = pick("from");
    const to = pick("to");
    return from && to ? `${from} → ${to}` : from || to;
  }
  const first = Object.values(args || {})[0];
  return first == null ? "" : String(first);
}

export { labelFor, detailFor, kindFor };
