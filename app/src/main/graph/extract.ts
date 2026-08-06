// Pull entities and relations out of one exchange, using the local model.
// Everything here fails soft: a malformed reply just means no graph update.
import * as ollama from "./../ollama";

const MAX_INPUT = 6000;

const PROMPT = `Extract the durable facts from this exchange as JSON.

Return only JSON of this shape, with no commentary:
{"entities":[{"name":"...","type":"person|project|company|file|tool|decision|date|topic"}],
 "relations":[{"from":"...","rel":"short_verb_phrase","to":"..."}]}

Rules:
- Only things that stay true beyond this message. Skip pleasantries and questions.
- Names must be the literal names used in the text.
- Every relation's "from" and "to" must appear in "entities".
- At most 8 entities and 8 relations. Return empty arrays when there is nothing durable.

Exchange:
`;

interface Extraction {
  entities: Array<{ name: string; type?: string }>;
  relations: Array<{ from: string; rel: string; to: string }>;
}

const EMPTY: Extraction = { entities: [], relations: [] };

// Models like to wrap JSON in prose or fences; take the outermost object.
function parseJson(raw: string): Extraction {
  const text = String(raw || "").replace(/```(json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return EMPTY;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return {
      entities: Array.isArray(parsed.entities) ? parsed.entities.slice(0, 8) : [],
      relations: Array.isArray(parsed.relations) ? parsed.relations.slice(0, 8) : [],
    };
  } catch {
    return EMPTY;
  }
}

async function extract(
  model: string,
  userText: string,
  assistantText: string
): Promise<Extraction> {
  if (!model) return EMPTY;
  const body = `User: ${userText || ""}\nAssistant: ${assistantText || ""}`.slice(0, MAX_INPUT);
  if (!body.trim()) return EMPTY;
  try {
    return parseJson(await ollama.generate(model, PROMPT + body));
  } catch {
    return EMPTY;
  }
}

export { extract };
export type { Extraction };
