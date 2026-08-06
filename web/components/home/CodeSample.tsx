const SNIPPET = `from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3227/v1",
    api_key="anylm-local",
)

client.chat.completions.create(
    model="llama3.2",
    messages=[{"role": "user", "content": "ship it"}],
    stream=True,
)`;

export default function CodeSample() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-28">
      <div className="glass grid items-center gap-10 rounded-[2rem] p-8 lg:grid-cols-2 lg:p-12">
        <div>
          <p className="text-sm text-[var(--color-slime)]">Drop-in</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight">
            Works with anything already speaking OpenAI
          </h2>
          <p className="mt-4 text-[var(--color-mist)]">
            Change the base URL and you are done. Same request shape, same streaming format, same
            client libraries. The router decides which local model answers and makes sure it is
            only loaded once.
          </p>
        </div>

        <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/55 p-5 font-mono text-[13px] leading-relaxed text-[var(--color-slime)]">
          <code>{SNIPPET}</code>
        </pre>
      </div>
    </section>
  );
}
