/** Whether to send Ollama `think: true` for this model name. */
export function modelSupportsThink(model: string): boolean {
  return /r1|reason|think|qwen3|deepseek|magistral|gpt-oss|openthinker/i.test(
    String(model || "")
  );
}
