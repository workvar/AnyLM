// A chat with the tools toggle off has no generate_document tool, so a model
// asked for a PDF correctly reports that it cannot create files. When the
// user's message clearly asks for a document we hand that one turn a
// document-only tool set instead of silently refusing.

const DOCUMENT_AUTO_TOOLS = new Set(["generate_document", "web_search", "http_fetch"]);

interface ToolDef {
  function?: { name?: string };
}

// Returns null when none of the document tools are available (e.g. the user
// disabled generate_document in the Tools manager — that choice is honoured).
function documentToolDefs<T extends ToolDef>(all: T[]): T[] | null {
  const defs = (all || []).filter((d) => DOCUMENT_AUTO_TOOLS.has(d?.function?.name || ""));
  if (!defs.some((d) => d.function?.name === "generate_document")) return null;
  return defs;
}

export { DOCUMENT_AUTO_TOOLS, documentToolDefs };
