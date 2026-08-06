import Link from "next/link";
import { PRODUCT_NAME, REPO_URL } from "@/lib/config";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 text-sm text-[var(--color-mist)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {PRODUCT_NAME}. Runs entirely on your machine.
        </p>
        <div className="flex flex-wrap items-center gap-6">
          <Link href="/download" className="transition hover:text-white">
            Download
          </Link>
          <Link href="/releases" className="transition hover:text-white">
            Releases
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition hover:text-white">
            Source
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 transition hover:border-[var(--color-slime)]/40 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.8 1.8 2.8 2.3.8-1.2 1.6-1.5 1.8-1.7-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.2 4.3 4.3 0 0 1 .1-3.2s1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0C17.4 4.4 18.4 4.7 18.4 4.7a4.3 4.3 0 0 1 .1 3.2 4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.5 6 .5.4 1.4 1.4 1.4 3v2.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
