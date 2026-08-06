"use client";

interface Props {
  className?: string;
  /** Text on the little monster's chest, e.g. a model name. */
  label?: string;
}

/** A single model process: cute, hungry for RAM, soon to be absorbed. */
export default function SmallMonster({ className, label }: Props) {
  return (
    <svg viewBox="0 0 140 150" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="sm-body" cx="0.4" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#d9c2ff" />
          <stop offset="60%" stopColor="#a879ff" />
          <stop offset="100%" stopColor="#6c3fd1" />
        </radialGradient>
      </defs>

      <path d="M70,10 l-6,-10 14,4 Z" fill="#a879ff" />
      <circle cx="70" cy="6" r="6" fill="#ffd166" />

      <path
        d="M70,18 C104,18 122,44 122,76 C122,108 100,128 70,128 C40,128 18,108 18,76 C18,44 36,18 70,18 Z"
        fill="url(#sm-body)"
      />

      <circle cx="54" cy="66" r="15" fill="#ffffff" />
      <circle cx="58" cy="69" r="7" fill="#0b0d14" />
      <circle cx="55" cy="64" r="2.5" fill="#ffffff" />
      <circle cx="92" cy="64" r="12" fill="#ffffff" />
      <circle cx="95" cy="67" r="6" fill="#0b0d14" />
      <circle cx="92" cy="62" r="2" fill="#ffffff" />

      <path d="M56,96 q14,14 30,0" stroke="#3a1c6e" strokeWidth="4" fill="none" strokeLinecap="round" />

      <path d="M20,84 q-14,10 -8,24" stroke="#6c3fd1" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M120,84 q14,10 8,24" stroke="#6c3fd1" strokeWidth="7" fill="none" strokeLinecap="round" />
      <rect x="48" y="128" width="14" height="14" rx="6" fill="#6c3fd1" />
      <rect x="78" y="128" width="14" height="14" rx="6" fill="#6c3fd1" />

      {label ? (
        <text
          x="70"
          y="116"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="#1b0b3a"
          opacity="0.75"
        >
          {label}
        </text>
      ) : null}
    </svg>
  );
}
