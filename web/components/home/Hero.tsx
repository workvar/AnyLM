import DownloadButton from "@/components/download/DownloadButton";
import { PRODUCT_NAME } from "@/lib/config";
import type { Release } from "@/lib/releases";

export default function Hero({ release }: { release: Release | null }) {
  return (
    <section className="relative overflow-hidden px-6 pt-24 pb-20 text-center sm:pt-32">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[var(--color-slime)] opacity-[0.09] blur-[120px]" />

      <div className="relative mx-auto max-w-3xl">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--color-mist)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-slime)]" />
          Local-first · nothing leaves your machine
        </p>

        <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
          One router. Every model.
          <span className="block text-[var(--color-slime)]">Zero duplication.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--color-mist)]">
          {PRODUCT_NAME} runs quietly in the background, pools every LLM already installed on your
          computer, and gives all your apps a single OpenAI-compatible endpoint to talk to.
        </p>

        <div className="mt-10">
          <DownloadButton release={release} />
        </div>
      </div>
    </section>
  );
}
