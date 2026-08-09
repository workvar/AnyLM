import Link from "next/link";
import type { Metadata } from "next";
import PlatformCards from "@/components/download/PlatformCards";
import ReleaseNotes from "@/components/releases/ReleaseNotes";
import { getLatestRelease } from "@/lib/github";
import { formatDate } from "@/lib/releases";
import { RELEASES_URL } from "@/lib/config";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Download",
  description: "Download the latest AnyLM build for macOS, Windows or Linux.",
};

export default async function DownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="relative overflow-hidden">
      <div className="nebula pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-28">
        <header className="mb-12 max-w-2xl">
          <p className="text-sm text-[var(--color-slime)]">Latest release</p>
          <h1 className="font-display mt-2 flex flex-wrap items-baseline gap-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            {release ? `AnyLM v${release.version}` : "AnyLM"}
            {release?.prerelease ? (
              <span className="rounded-full border border-[var(--color-bile)]/40 px-2.5 py-0.5 text-xs text-[var(--color-bile)]">
                pre-release
              </span>
            ) : null}
          </h1>
          <p className="mt-3 text-[var(--color-mist)]">
            {release
              ? `Published ${formatDate(release.publishedAt)}.`
              : "No release has been published yet. Push a version tag to trigger the build."}
          </p>
        </header>

        <PlatformCards release={release} />

        {release?.notes ? (
          <section className="glass mt-14 rounded-3xl p-6 sm:p-8">
            <h2 className="mb-3 text-lg font-semibold">What changed</h2>
            <ReleaseNotes notes={release.notes} />
          </section>
        ) : null}

        <div className="mt-12 flex flex-wrap gap-6 text-sm">
          <Link href="/releases" className="text-[var(--color-slime)] hover:underline">
            Looking for an older version? →
          </Link>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-mist)] hover:text-white"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
