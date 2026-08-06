"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import BigMonster from "@/components/monsters/BigMonster";
import SmallMonster from "@/components/monsters/SmallMonster";
import ScrollCaption from "./ScrollCaption";

export default function MonsterScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

  // Small monster: drifts in, then is pulled into the mouth.
  const smallX = useTransform(p, [0, 0.18, 0.34, 0.56], ["-38%", "-6%", "-2%", "26%"]);
  const smallScale = useTransform(p, [0, 0.34, 0.56], [1, 0.95, 0.22]);
  const smallOpacity = useTransform(p, [0.5, 0.58], [1, 0]);
  const smallRotate = useTransform(p, [0, 0.34, 0.56], [-6, 4, 22]);

  // Jaws: open as it approaches, snap shut once it is inside.
  const upperJaw = useTransform(p, [0.16, 0.34, 0.58, 0.64], [0, -36, -36, 0]);
  const lowerJaw = useTransform(p, [0.16, 0.34, 0.58, 0.64], [0, 30, 30, 0]);
  const bellyScale = useTransform(p, [0.64, 0.7, 0.78, 0.86], [1, 1.09, 0.97, 1]);

  // The swallowed model reappears as a routed endpoint.
  const badgeOpacity = useTransform(p, [0.82, 0.92], [0, 1]);
  const badgeY = useTransform(p, [0.82, 0.92], [16, 0]);
  const bigX = useTransform(p, [0, 0.34], ["8%", "0%"]);

  if (reduced) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">One process eats the rest</h2>
        <p className="mt-4 text-[var(--color-mist)]">
          Every app on your machine loads its own copy of a model. AnyLM swallows them into a
          single resident runtime and hands every app the same endpoint.
        </p>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[420vh]" aria-label="How AnyLM absorbs duplicate models">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        <div className="pointer-events-none absolute h-[70vmin] w-[70vmin] rounded-full bg-[var(--color-slime)] opacity-[0.07] blur-3xl" />

        <div className="relative aspect-[16/9] w-[min(1040px,94vw)]">
          <motion.div
            style={{ x: smallX, scale: smallScale, opacity: smallOpacity, rotate: smallRotate }}
            className="absolute left-[6%] top-1/2 w-[13%] -translate-y-1/2"
          >
            <SmallMonster className="h-auto w-full drop-shadow-[0_0_24px_rgba(168,121,255,0.45)]" label="7B" />
          </motion.div>

          <motion.div style={{ x: bigX }} className="absolute right-[2%] top-1/2 w-[54%] -translate-y-1/2">
            <BigMonster
              upperJaw={upperJaw}
              lowerJaw={lowerJaw}
              bellyScale={bellyScale}
              className="h-auto w-full drop-shadow-[0_0_40px_rgba(125,249,166,0.28)]"
            />
            <motion.div
              style={{ opacity: badgeOpacity, y: badgeY }}
              className="absolute inset-x-0 -bottom-2 mx-auto w-fit rounded-full border border-[var(--color-slime)]/40 bg-black/60 px-4 py-1.5 font-mono text-xs text-[var(--color-slime)] backdrop-blur"
            >
              localhost:3227/v1 · 1 process
            </motion.div>
          </motion.div>

          <ScrollCaption
            progress={p}
            range={[0, 0.05, 0.16, 0.24]}
            title="Every app brings its own model"
            body="Your editor, your notes app and your terminal each spin up a separate runtime and a separate copy of the weights."
          />
          <ScrollCaption
            progress={p}
            range={[0.26, 0.36, 0.5, 0.58]}
            title="AnyLM opens wide"
            body="The router discovers what is already installed on the machine, then claims it."
          />
          <ScrollCaption
            progress={p}
            range={[0.6, 0.7, 0.78, 0.84]}
            title="Gulp"
            body="One resident process, one set of weights in memory, one queue in front of the GPU."
          />
          <ScrollCaption
            progress={p}
            range={[0.86, 0.94, 0.99, 1]}
            title="One endpoint for everything"
            body="Every app now points at the same OpenAI-compatible URL. Nothing loads twice."
          />
        </div>
      </div>
    </section>
  );
}
