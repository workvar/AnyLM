"use client";

import Link from "next/link";
import { MdChip } from "@awc-ui/react";
import DownloadButton from "@/components/download/DownloadButton";
import { AppShot } from "./AppShowcase";
import { PRODUCT_NAME } from "@/lib/config";
import type { Release } from "@/lib/releases";

const WORKS_WITH = ["OpenAI SDK", "Ollama", "Cursor", "Continue", "Custom scripts"];

export default function Hero({ release }: { release: Release | null }) {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-28 sm:pt-32">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 70% 20%, color-mix(in srgb, var(--md-sys-color-primary) 16%, transparent), transparent 70%),
            radial-gradient(ellipse 50% 40% at 10% 80%, color-mix(in srgb, var(--md-sys-color-secondary) 12%, transparent), transparent 65%),
            var(--md-sys-color-background)
          `,
        }}
      />

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
        <div className="max-w-xl">
          <p className="font-display text-4xl font-semibold tracking-tight text-[var(--md-sys-color-primary)] sm:text-5xl">
            {PRODUCT_NAME}
          </p>

          <h1 className="font-display mt-4 text-balance text-3xl font-semibold tracking-tight text-[var(--md-sys-color-on-surface)] sm:text-4xl lg:text-5xl">
            One endpoint for every local model.
          </h1>

          <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            Local-first workspace for Ollama — projects with RAG, multi-agent chat, and a single
            OpenAI-compatible router your whole machine can share.
          </p>

          <div className="mt-8 flex flex-col items-start gap-4">
            <DownloadButton release={release} />
            <Link
              href="#product"
              className="text-sm font-medium text-[var(--md-sys-color-primary)] hover:underline"
            >
              See the new Material UI →
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-2">
            {WORKS_WITH.map((name) => (
              <MdChip key={name} label={name} variant="assist" density={-1} />
            ))}
          </div>
        </div>

        <div className="relative hero-shot-motion">
          <div
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[40px] opacity-80"
            aria-hidden
            style={{
              background:
                "radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--md-sys-color-primary) 22%, transparent), transparent 60%)",
            }}
          />
          <AppShot id="hero" />
        </div>
      </div>
    </section>
  );
}
