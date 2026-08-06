import type { Metadata } from "next";
import ReleaseCard from "@/components/releases/ReleaseCard";
import { getAllReleases } from "@/lib/github";
import { RELEASES_URL } from "@/lib/config";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Releases",
  description: "Every published AnyLM version, with downloads for macOS, Windows and Linux.",
};

export default async function ReleasesPage() {
  const releases = await getAllReleases();

  return (
    <div className="relative overflow-hidden">
      <div className="nebula pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-28">
        <header className="mb-12 max-w-2xl">
          <p className="text-sm text-[var(--color-slime)]">History</p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Release history
          </h1>
          <p className="mt-3 text-[var(--color-mist)]">
            Every version built by CI, newest first. Older builds stay available, so you can roll
            back at any time.
          </p>
        </header>

        {releases.length === 0 ? (
          <div className="glass rounded-3xl border-dashed p-12 text-center">
            <p className="text-[var(--color-mist)]">
              Nothing published yet. Tag a commit with{" "}
              <code className="font-mono text-white">v0.0.0</code> and the workflow will build and
              publish the first release.
            </p>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm text-[var(--color-slime)] hover:underline"
            >
              Check GitHub Releases
            </a>
          </div>
        ) : (
          <div className="space-y-5">
            {releases.map((release, i) => (
              <ReleaseCard
                key={release.id}
                release={release}
                latest={i === 0 && !release.prerelease}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
