"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Decorative background for the hero.
 *
 * Two rules keep it from fighting the copy:
 *  - every node lives in the OUTER margins, because the centre column belongs
 *    to the headline and the CTA;
 *  - the hub sits in the empty band just above the "Works with" rule, so its
 *    glow reads as a horizon under the section rather than a bright patch
 *    behind the download button.
 *
 * The lines and nodes are laid out inside `.constellation-field`, which is
 * anchored a fixed distance above the bottom of the section rather than at a
 * percentage of it. The section is `min-h-[92dvh]`, so on short content the
 * section is taller than the copy; a percentage-positioned hub drifts below
 * the "Works with" rule on those viewports, while a bottom-anchored one does
 * not. `.constellation` additionally fades the whole layer out across the
 * centre column (see globals.css).
 */
const NODES = [
  { id: "a", x: 10, y: 36, label: "llama3.2", sub: "Ollama" },
  { id: "b", x: 15, y: 62, label: "nomic-embed", sub: "RAG" },
  { id: "c", x: 90, y: 36, label: "Cursor", sub: "Editor" },
  { id: "d", x: 85, y: 62, label: "Scripts", sub: "OpenAI SDK" },
  { id: "e", x: 93, y: 84, label: "Notes", sub: "App" },
];

const CX = 50;
const CY = 100;

export default function Constellation() {
  const reduced = useReducedMotion();

  return (
    <div className="constellation pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="nebula absolute inset-0" />

      <div className="constellation-field absolute inset-x-0 top-0 bottom-[9.5rem]">
        <div className="absolute left-1/2 top-full h-[300px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-slime)]/12 blur-[120px]" />

        {/* Lines only. `preserveAspectRatio="none"` maps the viewBox 1:1 onto
            percentage positions, so the HTML dots and labels land exactly on
            the line ends. The shapes are drawn in HTML instead, because a
            stretched viewBox would squash any circle into an ellipse. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full opacity-80"
        >
          {NODES.map((n) => (
            <line
              key={`l-${n.id}`}
              x1={n.x}
              y1={n.y}
              x2={CX}
              y2={CY}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-slime)]"
          style={{ left: `${CX}%`, top: `${CY}%` }}
        />

        {NODES.map((n, i) => (
          <div
            key={n.id}
            className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 ${
              reduced ? "" : "pulse-node"
            }`}
            style={{
              left: `${n.x}%`,
              top: `${n.y}%`,
              animationDelay: reduced ? undefined : `${i * 0.35}s`,
            }}
          />
        ))}

        {NODES.map((n) => (
          <div
            key={`label-${n.id}`}
            className="absolute hidden whitespace-nowrap rounded-full border border-white/12 bg-black/60 px-2.5 py-1 text-xs text-[var(--color-mist)] backdrop-blur lg:block"
            style={{ left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%, -180%)" }}
          >
            <span className="font-medium text-white">{n.label}</span>
            <span className="ml-1.5">{n.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
