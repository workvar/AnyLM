// Human labels for tool activity. Copied from renderer rail until Task 5
// consolidates on main as the single source of truth.
const LABELS: Record<string, string> = {
  ask_user: "Asking a question",
  generate_document: "Writing a document",
  web_search: "Searching the web",
  read_file: "Reading a file",
  write_file: "Writing a file",
  list_directory: "Listing a folder",
  create_directory: "Creating a folder",
  move_path: "Moving a file",
  copy_path: "Copying a file",
  delete_path: "Deleting a file",
  find_files: "Finding files",
  http_fetch: "Calling an API",
  run_shell: "Running a command",
  open_app_or_url: "Opening something",
  get_time: "Checking the time",
};

function labelFor(name: string): string {
  return LABELS[name] || name;
}

// The one-line detail under the label, per tool.
function detailFor(name: string, args: Record<string, unknown>): string {
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
  const first = Object.values(args || {})[0];
  return first == null ? "" : String(first).slice(0, 60);
}

export { labelFor, detailFor };
