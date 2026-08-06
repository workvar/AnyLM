"use client";

import { motion, type MotionValue } from "framer-motion";

interface Props {
  /** Degrees the upper jaw swings open (negative rotates it up). */
  upperJaw: MotionValue<number>;
  /** Degrees the lower jaw swings open. */
  lowerJaw: MotionValue<number>;
  /** 1 = resting, >1 = mid-gulp squash. */
  bellyScale: MotionValue<number>;
  className?: string;
}

const HINGE = { transformOrigin: "340px 170px" } as const;
const CENTER = { transformOrigin: "200px 170px" } as const;

/**
 * The router monster. A circular body split into two jaws that hinge at the
 * right edge of the mouth, so it opens toward the incoming small monster.
 */
export default function BigMonster({ upperJaw, lowerJaw, bellyScale, className }: Props) {
  return (
    <svg viewBox="0 0 420 360" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="bm-body" cx="0.62" cy="0.32" r="0.85">
          <stop offset="0%" stopColor="#8ef2b4" />
          <stop offset="55%" stopColor="#3fce7f" />
          <stop offset="100%" stopColor="#1a7f4c" />
        </radialGradient>
        <radialGradient id="bm-throat" cx="0.7" cy="0.5" r="0.7">
          <stop offset="0%" stopColor="#3b0d2a" />
          <stop offset="100%" stopColor="#12030c" />
        </radialGradient>
      </defs>

      {/* throat, visible only while the jaws are apart */}
      <ellipse cx="285" cy="170" rx="80" ry="70" fill="url(#bm-throat)" />

      <motion.g style={{ scale: bellyScale, ...CENTER }}>
        {/* lower jaw */}
        <motion.g style={{ rotate: lowerJaw, ...HINGE }}>
          <path d="M60,170 A140,140 0 0 0 340,170 Z" fill="url(#bm-body)" />
          {/* bottom teeth, pointing up past the jaw line */}
          <path
            d="M92,184 H300 L284,150 L268,182 L250,144 L232,182 L214,148 L196,182 L178,142 L160,182 L142,150 L124,182 L108,154 Z"
            fill="#f6fff9"
          />
          <path d="M150,196 q60,64 120,4 q-58,26 -120,-4 Z" fill="#ff7ba8" opacity="0.9" />
          <circle cx="120" cy="250" r="12" fill="#1a7f4c" opacity="0.35" />
          <circle cx="230" cy="278" r="8" fill="#1a7f4c" opacity="0.3" />
        </motion.g>

        {/* upper jaw */}
        <motion.g style={{ rotate: upperJaw, ...HINGE }}>
          <path d="M340,170 A140,140 0 0 0 60,170 Z" fill="url(#bm-body)" />
          {/* top teeth, pointing down past the jaw line */}
          <path
            d="M92,156 H300 L284,190 L268,158 L250,196 L232,158 L214,192 L196,158 L178,198 L160,158 L142,190 L124,158 L108,186 Z"
            fill="#f6fff9"
          />
          {/* horns */}
          <path d="M132,58 l-16,-40 34,22 Z" fill="#1a7f4c" />
          <path d="M262,52 l22,-38 4,40 Z" fill="#1a7f4c" />
          {/* eyes */}
          <circle cx="150" cy="96" r="26" fill="#ffffff" />
          <circle cx="158" cy="100" r="12" fill="#0b0d14" />
          <circle cx="152" cy="93" r="4" fill="#ffffff" />
          <circle cx="238" cy="88" r="20" fill="#ffffff" />
          <circle cx="245" cy="92" r="9" fill="#0b0d14" />
          <circle cx="240" cy="85" r="3" fill="#ffffff" />
          <circle cx="286" cy="140" r="10" fill="#1a7f4c" opacity="0.35" />
        </motion.g>
      </motion.g>
    </svg>
  );
}
