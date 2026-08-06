const CHIPS = [
  { kind: "Sent", detail: "Cursor → llama3.2", meta: "chat.completions" },
  { kind: "Routed", detail: "Notes → nomic-embed", meta: "embeddings" },
  { kind: "Queued", detail: "Script → same pool", meta: "no reload" },
];

const PILLS = ["Local-only", "OpenAI-compatible", "Signed builds", "Policy-ready"];

export default function ActivityStrip() {
  return (
    <section className="px-6 pb-16">
      <div className="glass mx-auto grid max-w-6xl gap-10 rounded-[2rem] p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-12">
        <div>
          <p className="text-sm text-[var(--color-slime)]">Live pool</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight">
            Requests float in. One gauge holds the pool.
          </h2>
          <p className="mt-4 max-w-lg text-[var(--color-mist)]">
            Apps speak OpenAI; AnyLM routes them through a single resident runtime so memory stays
            sane and answers stay local.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {CHIPS.map((c) => (
              <div
                key={c.detail}
                className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur"
              >
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-slime)]">
                  {c.kind}
                </p>
                <p className="mt-1 text-sm font-medium text-white">{c.detail}</p>
                <p className="text-xs text-[var(--color-mist)]">{c.meta}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center">
          <div className="relative grid h-48 w-48 place-items-center rounded-full border border-white/10 bg-black/40">
            <svg viewBox="0 0 120 120" className="absolute inset-3" aria-hidden>
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="8"
              />
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="#7df9a6"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray="220 301"
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-mist)]">Step 01</p>
              <p className="mt-1 text-lg font-semibold">Single endpoint</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:col-span-2">
          {PILLS.map((p) => (
            <span
              key={p}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-[var(--color-mist)]"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
