const BARS = [28, 46, 38, 72, 55, 88, 64, 42, 76, 58, 90, 48];

export default function Insights() {
  return (
    <section id="insights" className="scroll-mt-28 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-sm text-[var(--color-slime)]">Insights</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            One resident runtime. Every app benefits.
          </h2>
          <p className="mt-4 text-[var(--color-mist)]">
            Illustrative view of how AnyLM sits between your tools and the models already on disk —
            no second copy of the weights, no cloud round-trip for inference.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
          <article className="glass rounded-3xl p-6 sm:col-span-1 lg:row-span-2">
            <p className="text-sm text-[var(--color-mist)]">Shared resident runtime</p>
            <p className="font-display mt-6 text-6xl font-semibold tracking-tight text-white">1</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-mist)]">
              Model process pooled for editors, scripts, and the desktop chat — queued instead of
              duplicated.
            </p>
            <div className="mt-8 space-y-2">
              {["Editor → llama3.2", "Notes → embed", "CLI → same pool"].map((line) => (
                <div
                  key={line}
                  className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-xs text-white/80"
                >
                  {line}
                </div>
              ))}
            </div>
          </article>

          <article className="glass rounded-3xl p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--color-mist)]">Model pool activity</p>
                <h3 className="mt-1 text-lg font-semibold">Liquidity of local weights</h3>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--color-mist)]">
                illustrative
              </span>
            </div>
            <div className="mt-8 flex h-32 items-end gap-1.5">
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-[var(--color-slime-deep)]/40 to-[var(--color-slime)]"
                  style={{ height: `${h}%`, opacity: 0.45 + (i % 5) * 0.1 }}
                />
              ))}
            </div>
          </article>

          <article className="glass rounded-3xl p-6">
            <p className="text-sm text-[var(--color-mist)]">Cloud round-trips for inference</p>
            <p className="font-display mt-4 text-5xl font-semibold text-[var(--color-slime)]">0</p>
            <p className="mt-2 text-sm text-[var(--color-mist)]">
              Tokens stay on-device. Connectors are opt-in and explicit.
            </p>
          </article>

          <article className="glass rounded-3xl p-6">
            <p className="text-sm text-[var(--color-mist)]">Projects + RAG</p>
            <p className="font-display mt-4 text-4xl font-semibold">Docs → chunks</p>
            <p className="mt-2 text-sm text-[var(--color-mist)]">
              Attach references; retrieve grounded context automatically.
            </p>
          </article>

          <article className="glass rounded-3xl p-6 lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--color-mist)]">Governance peek</p>
                <h3 className="mt-1 text-lg font-semibold">Policy-ready for teams</h3>
                <p className="mt-2 max-w-md text-sm text-[var(--color-mist)]">
                  Organisation rules over which models can be used, with usage recorded per member.
                </p>
              </div>
              <div className="flex gap-2">
                {[
                  { label: "Allowed", value: "llama3.2" },
                  { label: "Usage", value: "local" },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-left"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-[var(--color-mist)]">
                      {c.label}
                    </p>
                    <p className="mt-1 font-mono text-sm text-white">{c.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
