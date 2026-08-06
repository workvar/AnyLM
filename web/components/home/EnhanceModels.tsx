const POINTS = [
  {
    title: "Tool calling on local models",
    body: "Ollama function calling turns a chat model into an agent that can use the tool registry — files, web, shell, docs — without leaving your machine.",
  },
  {
    title: "Skills = instructions + tools",
    body: "Enable a skill and the model gets a focused system prompt plus a curated tool bundle. Built-ins cover research and calendars; custom skills are yours.",
  },
  {
    title: "Projects with real RAG",
    body: "Attach reference docs. They are chunked, embedded, and retrieved so local answers stay grounded in your material.",
  },
  {
    title: "One shared router",
    body: "Point editors and scripts at :3227. One resident runtime serves everyone — no second copy of the same weights in RAM.",
  },
  {
    title: "Connectors that act",
    body: "Optional Google Calendar and Outlook skills let the model schedule and mail. Risky writes always ask before they run.",
  },
];

export default function EnhanceModels() {
  return (
    <section id="enhance" className="scroll-mt-28 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-sm text-[var(--color-slime)]">Enhance local models</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your weights, with hands and memory
          </h2>
          <p className="mt-4 text-[var(--color-mist)]">
            AnyLM does not replace Ollama — it makes local models more useful: tools, skills,
            retrieval, and a single endpoint your whole machine can share.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((p, i) => (
            <article
              key={p.title}
              className={`glass rounded-3xl p-6 ${i === 0 ? "md:col-span-2 lg:col-span-1" : ""}`}
            >
              <span className="font-mono text-xs text-[var(--color-slime)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-mist)]">{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
