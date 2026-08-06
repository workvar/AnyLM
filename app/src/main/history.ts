// Keeps the whole conversation in play.
//
// The full message list is sent as-is while it fits the model's context
// window. Past that point the oldest turns are folded into one summary block
// instead of being dropped, so early decisions survive into later replies.
import * as ollama from "./ollama";

// Share of the window left for the reply and the system blocks.
const RESERVE = 0.35;
// Never fold away the most recent turns, however long they are.
const KEEP_RECENT = 6;

function tokensOf(messages: ChatMessage[]): number {
  const chars = messages.reduce((n, m) => n + (m.content ? m.content.length : 0), 0);
  return Math.round(chars / 4);
}

function transcript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content || ""}`)
    .join("\n\n");
}

async function summarize(model: string, messages: ChatMessage[]): Promise<string> {
  const prompt =
    "Summarize the earlier part of this conversation. Preserve names, decisions, " +
    "numbers, file names, and open questions; drop pleasantries. Reply with the " +
    "summary only.\n\n---\n" +
    transcript(messages);
  const out = await ollama.generate(model, prompt);
  return out.trim();
}

// fit(model, messages, ctx, systemTokens) → { messages, folded }
// `folded` is the number of messages replaced by the summary (0 when the
// conversation fit as-is).
async function fit(
  model: string,
  messages: ChatMessage[],
  ctx: number,
  systemTokens = 0
): Promise<{ messages: ChatMessage[]; folded: number }> {
  const budget = Math.max(512, Math.floor(ctx * (1 - RESERVE)) - systemTokens);
  if (messages.length <= KEEP_RECENT || tokensOf(messages) <= budget) {
    return { messages, folded: 0 };
  }

  // Grow the recent window back from the end until it fills the budget.
  let keep = KEEP_RECENT;
  while (keep < messages.length - 1 && tokensOf(messages.slice(-(keep + 1))) <= budget) keep++;
  const older = messages.slice(0, messages.length - keep);
  const recent = messages.slice(messages.length - keep);
  if (!older.length) return { messages, folded: 0 };

  try {
    const summary = await summarize(model, older);
    if (!summary) return { messages, folded: 0 };
    return {
      messages: [
        {
          role: "system",
          content: `Earlier in this conversation (${older.length} messages, summarized):\n\n${summary}`,
        } as ChatMessage,
        ...recent,
      ],
      folded: older.length,
    };
  } catch {
    // Summarizing failed — send everything and let the model handle it.
    return { messages, folded: 0 };
  }
}

export { fit, tokensOf };
