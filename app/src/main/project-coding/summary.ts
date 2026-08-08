export type ToolOutcome = {
  name: string;
  args: Record<string, unknown>;
  output: string;
  denied?: boolean;
};

export function stripLargeCodeFences(
  text: string,
  opts?: { maxLines?: number; maxChars?: number }
): string {
  const maxLines = opts?.maxLines ?? 20;
  const maxChars = opts?.maxChars ?? 500;
  const re = /```[\w+-]*\n([\s\S]*?)```/g;
  return String(text || "").replace(re, (full, body: string) => {
    const lines = body.split("\n").length;
    if (lines > maxLines || body.length > maxChars) {
      return "_Code written to files (see list above)._";
    }
    return full;
  });
}

export function buildProjectSummary(opts: {
  root: string;
  outcomes: ToolOutcome[];
  docsNote?: string | null;
  modelText?: string;
}): string {
  const files: string[] = [];
  const commands: string[] = [];
  const notes: string[] = [];
  for (const o of opts.outcomes) {
    if (o.name === "write_file" && o.args.path) files.push(String(o.args.path));
    if (o.name === "create_directory" && o.args.path) files.push(`${o.args.path}/`);
    if (o.name === "run_shell") {
      const cmd = String(o.args.command || "");
      if (o.denied) notes.push(`CLI skipped (user denied): \`${cmd}\``);
      else if (/^error|failed|denied/i.test(o.output || "")) notes.push(`CLI failed: \`${cmd}\``);
      else if (cmd) commands.push(cmd);
    }
  }
  const parts = [`**Project:** \`${opts.root}\``];
  if (opts.docsNote) parts.push(opts.docsNote);
  if (commands.length) parts.push("**Commands run:**\n" + commands.map((c) => `- \`${c}\``).join("\n"));
  if (files.length) {
    const uniq = [...new Set(files)];
    parts.push("**Files created/updated:**\n" + uniq.map((f) => `- \`${f}\``).join("\n"));
  }
  for (const n of notes) parts.push(n);
  let body = parts.join("\n\n");
  if (opts.modelText) {
    const cleaned = stripLargeCodeFences(opts.modelText).trim();
    // Keep only short non-code leftover from the model (e.g. "run npm run dev")
    if (cleaned && cleaned.length < 800 && !/```/.test(cleaned)) {
      body += "\n\n" + cleaned;
    } else if (cleaned && cleaned.includes("Code written to files")) {
      body += "\n\n" + cleaned;
    }
  }
  return body;
}
