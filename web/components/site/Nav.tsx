import Link from "next/link";
import { PRODUCT_NAME, REPO_URL } from "@/lib/config";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/download", label: "Download" },
  { href: "/releases", label: "Releases" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[var(--color-void)]/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-slime)] text-sm text-black">
            ◕
          </span>
          {PRODUCT_NAME}
        </Link>

        <div className="flex items-center gap-6 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[var(--color-mist)] hover:text-white">
              {l.label}
            </Link>
          ))}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden text-[var(--color-mist)] hover:text-white sm:inline"
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
