export interface Feature {
  glyph: string;
  title: string;
  body: string;
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
];
