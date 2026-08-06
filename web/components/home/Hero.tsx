import Link from "next/link";
import DownloadButton from "@/components/download/DownloadButton";
import Constellation from "./Constellation";
import { PRODUCT_NAME } from "@/lib/config";
import type { Release } from "@/lib/releases";

const WORKS_WITH = ["OpenAI SDK", "Ollama", "Cursor", "Continue", "Custom scripts"];

export default function Hero({ release }: { release: Release | null }) {
  return (
    <section className="relative min-h-[92dvh] overflow-hidden px-6 pb-16 pt-28 text-center sm:pt-36">
      <Constellation />

      <div className="relative mx-auto max-w-3xl">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--color-mist)] backdrop-blur">
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

        <div className="mt-10 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <DownloadButton release={release} />
          </div>
          <Link href="#insights" className="btn-ghost text-sm">
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

      <div className="relative mx-auto mt-20 flex max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-white/5 pt-8 text-xs uppercase tracking-[0.18em] text-[var(--color-mist)]">
        <span className="normal-case tracking-normal text-white/50">Works with</span>
        {WORKS_WITH.map((name) => (
          <span key={name} className="text-white/55">
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
