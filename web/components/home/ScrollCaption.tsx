"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";

interface Props {
  progress: MotionValue<number>;
  /** [fadeInStart, fullyIn, startFadeOut, fullyOut] in scroll progress. */
  range: [number, number, number, number];
  title: string;
  body: string;
}

export default function ScrollCaption({ progress, range, title, body }: Props) {
  const opacity = useTransform(progress, range, [0, 1, 1, 0]);
  const y = useTransform(progress, range, [24, 0, 0, -24]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="pointer-events-none absolute inset-x-0 bottom-6 mx-auto max-w-xl px-6 text-center"
    >
      <h3 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h3>
      <p className="mt-2 text-sm text-[var(--color-mist)] sm:text-base">{body}</p>
    </motion.div>
  );
}
