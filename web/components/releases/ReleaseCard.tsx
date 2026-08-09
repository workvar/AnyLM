import AssetRow from "@/components/download/AssetRow";
import ReleaseNotes from "./ReleaseNotes";
import { groupByPlatform } from "@/lib/pickAsset";
import { PLATFORM_LABELS, formatDate, type Platform, type Release } from "@/lib/releases";

const ORDER: Platform[] = ["mac", "windows", "linux"];

export default function ReleaseCard({ release, latest }: { release: Release; latest: boolean }) {
  const groups = groupByPlatform(release);

  return (
    <article className="glass rounded-3xl p-6 sm:p-7">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-3 font-display text-2xl font-semibold tracking-tight">
          v{release.version}
          {latest ? (
            <span className="rounded-full bg-[var(--color-slime)] px-2.5 py-0.5 text-xs font-semibold text-black">
              latest
            </span>
          ) : null}
          {release.prerelease ? (
            <span className="rounded-full border border-[var(--color-bile)]/40 px-2.5 py-0.5 text-xs font-normal text-[var(--color-bile)]">
              pre-release
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-[var(--color-mist)]">{formatDate(release.publishedAt)}</p>
      </header>

      {release.notes ? (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-sm text-[var(--color-slime)] hover:underline">
            Release notes
          </summary>
          <div className="mt-3">
            <ReleaseNotes notes={release.notes} />
          </div>
        </details>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {ORDER.map((platform) =>
          groups[platform].length > 0 ? (
            <div key={platform}>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--color-mist)]">
                {PLATFORM_LABELS[platform]}
              </p>
              <div className="space-y-2">
                {groups[platform].map((asset) => (
                  <AssetRow key={asset.id} asset={asset} source="releases" />
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>

      {release.assets.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-mist)]">
          This release has no attached binaries.{" "}
          <a href={release.htmlUrl} target="_blank" rel="noreferrer" className="underline">
            View on GitHub
          </a>
        </p>
      ) : null}
    </article>
  );
}
