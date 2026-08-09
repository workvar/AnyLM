export interface Feature {
  glyph: string;
  title: string;
  body: string;
  upcoming?: boolean;
}

export const FEATURES: Feature[] = [
  {
    glyph: "⇄",
    title: "One endpoint for every app",
    body: "A local OpenAI-compatible server at a fixed port. Point your editor, your notes app or your own scripts at it and they all share the same runtime.",
  },
  {
    glyph: "◍",
    title: "Model pooling, not model copies",
    body: "AnyLM discovers what is already installed, keeps one copy resident, and queues requests instead of loading a second set of weights into memory.",
  },
  {
    glyph: "▤",
    title: "Projects with real context",
    body: "Attach reference documents to a project. They are chunked, embedded and retrieved automatically so answers stay grounded in your own material.",
  },
  {
    glyph: "≋",
    title: "Streaming chat, locally",
    body: "Token-by-token responses from local models, with conversation history stored on your machine rather than someone else's.",
  },
  {
    glyph: "⛨",
    title: "Policy and governance built in",
    body: "Organisation-level rules over which models can be used and by whom, with usage recorded per member.",
  },
  {
    glyph: "↻",
    title: "Updates that arrive on their own",
    body: "Signed builds published straight from CI. The app checks for new versions and updates itself in place.",
  },
  {
    glyph: "◈",
    title: "Multi-agent when it matters",
    body: "Simple chats stay single-agent and fast. Complex turns plan, route, and run parallel Phase 1 roles, then return one synthesized answer with an agent trail.",
  },
  {
    glyph: "⌘",
    title: "Project-first coding",
    body: "Coding requests create or update files in a real folder — CLI scaffolds when available — and finish with a file/command summary instead of pasting the whole program into chat.",
  },
  {
    glyph: "☁",
    title: "Cloud API backends",
    body: "Optional Claude, OpenAI, and similar API keys as selectable backends beside local models — same chat flow, cloud when you choose it.",
    upcoming: true,
  },
];
