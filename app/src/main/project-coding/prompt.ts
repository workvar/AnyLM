export function projectFirstPromptBlock(): string {
  return [
    "Project-first coding mode is ON for this turn.",
    "1. Prefer official CLI scaffolds via run_shell when creating a new project (npm create, cargo new, django-admin startproject, etc.).",
    "2. Use create_directory and write_file for application code and edits inside the working folder.",
    "3. Read existing files before editing them. Keep modules small.",
    "4. NEVER paste full source files into your chat reply. Put code only in tool calls.",
    "5. After tools finish, reply with a short summary only: project path, commands run, files created/updated, and how to run — no code fences with full programs.",
    "If the user denied a shell command, continue with file tools only.",
  ].join("\n");
}
