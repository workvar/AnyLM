"use client";

import { useReducedMotion } from "framer-motion";

const NODES = [
  { id: "a", x: 18, y: 58, label: "llama3.2", sub: "Ollama" },
  { id: "b", x: 28, y: 86, label: "nomic-embed", sub: "RAG" },
  { id: "c", x: 82, y: 56, label: "Cursor", sub: "Editor" },
  { id: "d", x: 72, y: 88, label: "Scripts", sub: "OpenAI SDK" },
  { id: "e", x: 50, y: 48, label: "Notes", sub: "App" },
];

const CX = 50;
const CY = 72;

export default function Constellation() {
  const reduced = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="nebula absolute inset-0" />
      <div className="absolute left-1/2 top-[58%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[var(--color-slime)]/10 blur-[110px]" />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full opacity-70"
      >
        <defs>
          <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7df9a6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7df9a6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {NODES.map((n) => (
          <line
            key={`l-${n.id}`}
            x1={n.x}
            y1={n.y}
            x2={CX}
            y2={CY}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.15"
          />
        ))}

        <circle cx={CX} cy={CY} r="10" fill="url(#hubGlow)" />
        <circle
          cx={CX}
          cy={CY}
          r="2.2"
          fill="#7df9a6"
          className={reduced ? undefined : "pulse-node"}
        />

        {NODES.map((n, i) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r="0.9"
              fill="rgba(255,255,255,0.85)"
              className={reduced ? undefined : "pulse-node"}
              style={reduced ? undefined : { animationDelay: `${i * 0.35}s` }}
            />
          </g>
        ))}
      </svg>

      {NODES.map((n) => (
        <div
          key={`label-${n.id}`}
          className="absolute hidden rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] text-white/80 backdrop-blur sm:block"
          style={{ left: `${n.x}%`, top: `${n.y}%`, transform: "translate(-50%, -140%)" }}
        >
          <span className="font-medium text-white">{n.label}</span>
          <span className="ml-1 text-[var(--color-mist)]">{n.sub}</span>
        </div>
      ))}

      <div className="absolute left-1/2 top-[72%] hidden -translate-x-1/2 translate-y-6 rounded-full border border-[var(--color-slime)]/35 bg-black/50 px-3 py-1.5 text-xs font-medium text-[var(--color-slime)] backdrop-blur sm:block">
        AnyLM · :3227
      </div>
    </div>
  );
}
