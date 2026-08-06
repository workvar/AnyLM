import { FEATURES } from "./features.data";

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything the router does
        </h2>
        <p className="mt-4 text-[var(--color-mist)]">
          A background service with a desktop app on top. Install it once and every other tool on
          the machine gets a well-behaved model server for free.
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="rounded-2xl border border-white/8 bg-[var(--color-void-soft)] p-6 transition hover:border-[var(--color-slime)]/35"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-slime)]/12 text-lg text-[var(--color-slime)]">
              {f.glyph}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-mist)]">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
