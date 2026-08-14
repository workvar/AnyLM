import Link from "next/link";
import DownloadButton from "@/components/download/DownloadButton";
import Constellation from "./Constellation";
import { PRODUCT_NAME } from "@/lib/config";
import type { Release } from "@/lib/releases";

const WORKS_WITH = ["OpenAI SDK", "Ollama", "Cursor", "Continue", "Custom scripts"];

export default function Hero({ release }: { release: Release | null }) {
  // A flex column, not a plain block: when the copy is shorter than 92dvh the
  // leftover space is absorbed by the content's auto margins instead of piling
  // up under the "Works with" rule. That keeps the rule pinned to the bottom of
  // the section at every viewport height, which is what the constellation hub
  // is positioned against.
  return (
    <section className="relative flex min-h-[92dvh] flex-col overflow-hidden px-6 pb-16 pt-28 text-center sm:pt-36">
      <Constellation />

      {/* Full-width scrim behind the whole text column, sized to the content
          rather than tucked inside it, so the CTA at the bottom is covered too. */}
      <div
        className="hero-scrim pointer-events-none absolute inset-x-0 top-0 bottom-24 -z-0"
        aria-hidden
      />

      <div className="relative z-10 mx-auto my-auto w-full max-w-3xl">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/40 px-3 py-1 text-xs text-[var(--color-mist)] backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-slime)]" />
          Local-first · nothing leaves your machine
          <span aria-hidden>→</span>
        </p>

        <h1 className="font-display text-balance text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          One endpoint for every local model.
          <span className="mt-2 block text-[var(--color-slime)]">Zero duplication.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-mist)]">
          {PRODUCT_NAME} runs quietly in the background, pools every LLM already installed on your
          computer, and gives all your apps a single OpenAI-compatible endpoint to talk to.
        </p>

        {/* Primary action and its metadata are one group; "Discover more" is a
            separate, lower-priority action and is spaced apart to say so. */}
        <div className="mt-10 flex flex-col items-center">
          <DownloadButton release={release} />

          <Link href="#insights" className="btn-ghost mt-10 text-sm">
            Discover more
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              <path
                d="M7 10l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>

      <div className="relative z-10 mx-auto mt-20 flex w-full max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-white/10 pt-8 text-xs uppercase tracking-[0.18em] text-[var(--color-mist)]">
        <span className="normal-case tracking-normal text-white/70">Works with</span>
        {WORKS_WITH.map((name) => (
          <span key={name} className="text-white/80">
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
