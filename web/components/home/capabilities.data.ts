export type CapabilityTab = "skills" | "tools" | "platform";

export interface CapabilityItem {
  name: string;
  description: string;
  group?: string;
  risky?: boolean;
  upcoming?: boolean;
}

export const CAPABILITY_TABS: { id: CapabilityTab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "tools", label: "Tools" },
  { id: "platform", label: "Platform" },
];

export const SKILLS: CapabilityItem[] = [
  {
    name: "Web research",
    description: "Search the web and fetch page contents for live URLs or current facts.",
    group: "Built-in",
  },
  {
    name: "Google Calendar",
    description: "Read and create events on the user's primary Google Calendar.",
    group: "Connector",
  },
  {
    name: "Outlook",
    description: "Read calendar and mail, and send mail via Microsoft 365.",
    group: "Connector",
  },
  {
    name: "Custom skills",
    description: "Bundle your own instructions with any tool picks; enable per chat.",
    group: "User-defined",
  },
  {
    name: "Project-first coding",
    description:
      "On coding turns, scaffold and write files in a working folder, research docs when online, and reply with a short summary — not a full source dump.",
    group: "Built-in",
  },
  {
    name: "Research specialist",
    description:
      "Phase 2 multi-agent research role that plans deeper web + doc passes on complex questions.",
    group: "Built-in",
  },
  {
    name: "Slack",
    description:
      "Read channels and post messages in workspaces the user connects (confirm on send).",
    group: "Connector",
    upcoming: true,
  },
  {
    name: "Shared team skills",
    description: "Publish a skill once and enable it across an organisation's members.",
    group: "User-defined",
    upcoming: true,
  },
  {
    name: "Skill marketplace",
    description: "Browse and install community skills without hand-writing instruction bundles.",
    group: "User-defined",
    upcoming: true,
  },
];

export const TOOLS: CapabilityItem[] = [
  { name: "read_file", description: "Read a text file from the working folder.", group: "Filesystem" },
  {
    name: "list_directory",
    description: "List files and folders with sizes and modified dates.",
    group: "Filesystem",
  },
  {
    name: "write_file",
    description: "Create or overwrite a text file inside the working folder.",
    group: "Filesystem",
  },
  {
    name: "create_directory",
    description: "Create a folder and any missing parents.",
    group: "Filesystem",
  },
  {
    name: "move_path",
    description: "Move or rename a file or folder in the working folder.",
    group: "Filesystem",
  },
  {
    name: "copy_path",
    description: "Copy a file or folder inside the working folder.",
    group: "Filesystem",
  },
  {
    name: "delete_path",
    description: "Move a path to the system trash (recoverable).",
    group: "Filesystem",
    risky: true,
  },
  {
    name: "find_files",
    description: "Search recursively by name substring or glob.",
    group: "Filesystem",
  },
  {
    name: "web_search",
    description: "DuckDuckGo search with URLs and snippets.",
    group: "Web",
  },
  {
    name: "http_fetch",
    description: "Call an HTTP API and return the response body.",
    group: "Web",
  },
  {
    name: "get_time",
    description: "Current date and time on this computer.",
    group: "System",
  },
  {
    name: "open_app_or_url",
    description: "Open an application, file, or URL on this computer.",
    group: "System",
    risky: true,
  },
  {
    name: "run_shell",
    description: "Run a shell command and return its output.",
    group: "System",
    risky: true,
  },
  {
    name: "ask_user",
    description: "Ask one clarifying question and wait for an answer.",
    group: "UX",
  },
  {
    name: "generate_document",
    description: "Write pdf, docx, pptx, or md from markdown content.",
    group: "Docs",
  },
  {
    name: "gcal_list_events",
    description: "List primary Google Calendar events in a time window.",
    group: "Connectors",
  },
  {
    name: "gcal_create_event",
    description: "Create a Google Calendar event (confirm first).",
    group: "Connectors",
    risky: true,
  },
  {
    name: "outlook_list_events",
    description: "List Outlook calendar events.",
    group: "Connectors",
  },
  {
    name: "outlook_create_event",
    description: "Create an Outlook calendar event (confirm first).",
    group: "Connectors",
    risky: true,
  },
  {
    name: "outlook_list_mail",
    description: "List recent Outlook inbox messages.",
    group: "Connectors",
  },
  {
    name: "outlook_send_mail",
    description: "Send mail from Outlook (confirm first).",
    group: "Connectors",
    risky: true,
  },
];

export const PLATFORM: CapabilityItem[] = [
  {
    name: "Local OpenAI proxy",
    description: "Fixed endpoint at http://127.0.0.1:3227/v1 for every app.",
  },
  {
    name: "Model pooling",
    description: "Discover installed models; keep one resident copy; queue requests.",
  },
  {
    name: "Streaming chat",
    description: "Token-by-token local replies with history stored on-device.",
  },
  {
    name: "Projects + RAG",
    description: "Chunk, embed, and retrieve attached reference documents.",
  },
  {
    name: "Governance",
    description: "Org-level model policy and per-member usage recording.",
  },
  {
    name: "Auto-updates",
    description: "Signed CI builds; the app updates itself in place.",
  },
  {
    name: "Multi-agent orchestration",
    description:
      "On complex turns, plan and run specialized Phase 1 roles in parallel (within maxParallel), then synthesize one reply with an expandable agent trail.",
  },
  {
    name: "Load protection",
    description:
      "Soft-stop the active turn and cap parallel agents when system RAM used stays over a configurable threshold (default 90%).",
  },
  {
    name: "Ollama setup + boot splash",
    description:
      "Guided install/start when Ollama is missing or stopped, plus a splash so login never flashes before the real screen.",
  },
  {
    name: "Artifacts explorer",
    description:
      "Browse and open generated documents across standalone and project folders; generate docs without requiring a project.",
  },
  {
    name: "Tools toggle + model lock",
    description:
      "Labeled Tools control with project-wide persistence; locked model picker after the first message with a clear explanation.",
  },
  {
    name: "Activity + reasoning strip",
    description:
      "Live thought / tool / reasoning status for the current turn; only the active phase stays live.",
  },
  {
    name: "Document research quality",
    description:
      "Research-then-write guidance and thin-content rejection so generated PDFs/DOCX/MD stay substantive.",
  },
];
