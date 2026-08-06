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
    <div className="mx-auto max-w-6xl px-6 py-20">
      <header className="mb-12 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">Release history</h1>
        <p className="mt-3 text-[var(--color-mist)]">
          Every version built by CI, newest first. Older builds stay available, so you can roll
          back at any time.
        </p>
      </header>

      {releases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 p-12 text-center">
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
        <div className="space-y-6">
          {releases.map((release, i) => (
            <ReleaseCard key={release.id} release={release} latest={i === 0 && !release.prerelease} />
          ))}
        </div>
      )}
    </div>
  );
}
