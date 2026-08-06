import type { ReactNode } from "react";
import { FEATURES } from "./features.data";

const ICONS: Record<string, ReactNode> = {
  "⇄": (
    <path
      d="M7 8h10M17 8l-3-3M17 8l-3 3M17 16H7M7 16l3-3M7 16l3 3"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "◍": (
    <>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </>
  ),
  "▤": (
    <path
      d="M5 7h14M5 12h14M5 17h9"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  ),
  "≋": (
    <path
      d="M4 9c2-2 4-2 6 0s4 2 6 0M4 15c2-2 4-2 6 0s4 2 6 0"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  ),
  "⛨": (
    <path
      d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
  ),
  "↻": (
    <path
      d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export default function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-24">
      <div className="max-w-2xl">
        <p className="text-sm text-[var(--color-slime)]">Platform</p>
        <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything the router does
        </h2>
        <p className="mt-4 text-[var(--color-mist)]">
          A background service with a desktop app on top. Install it once and every other tool on
          the machine gets a well-behaved model server for free.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="glass rounded-3xl p-6 transition hover:border-[var(--color-slime)]/35"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-slime)]/12 text-[var(--color-slime)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                {ICONS[f.glyph] ?? (
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
                )}
              </svg>
            </span>
            <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-mist)]">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
