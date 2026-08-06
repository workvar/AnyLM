import Link from "next/link";
import { PRODUCT_NAME, REPO_URL } from "@/lib/config";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#capabilities", label: "Capabilities" },
  { href: "/#compare", label: "Compare" },
  { href: "/download", label: "Download" },
  { href: "/releases", label: "Releases" },
];

export default function Nav() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6">
      <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full glass-strong px-3 py-2 font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-slime)] text-sm text-black">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <path
                d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="pr-1">{PRODUCT_NAME}</span>
        </Link>

        <nav className="glass-strong hidden items-center gap-1 rounded-full px-2 py-1.5 text-sm md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-[var(--color-mist)] transition hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-3 py-1.5 text-[var(--color-mist)] transition hover:bg-white/5 hover:text-white"
          >
            GitHub
          </a>
        </nav>

        <Link
          href="/download"
          className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--color-slime)]"
        >
          Download
        </Link>
      </div>
    </header>
  );
}
