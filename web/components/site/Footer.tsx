import Link from "next/link";
import { PRODUCT_NAME, REPO_URL } from "@/lib/config";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 text-sm text-[var(--color-mist)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {PRODUCT_NAME}. Runs entirely on your machine.
        </p>
        <div className="flex gap-6">
          <Link href="/download" className="hover:text-white">
            Download
          </Link>
          <Link href="/releases" className="hover:text-white">
            Release history
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-white">
            Source
          </a>
        </div>
      </div>
    </footer>
  );
}
