import {
  assetLabel,
  detectArch,
  detectFormat,
  detectPlatform,
  isMetadataAsset,
  type Release,
  type ReleaseAsset,
} from "./releases";
import { GITHUB_OWNER, GITHUB_REPO } from "./config";

const API = "https://api.github.com";

/** Releases change rarely. Cache for 5 minutes so we stay well inside rate limits. */
const REVALIDATE_SECONDS = 300;

interface GhAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  download_count: number;
}

interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: GhAsset[];
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function mapAsset(a: GhAsset): ReleaseAsset {
  return {
    id: a.id,
    name: a.name,
    size: a.size,
    downloadUrl: a.browser_download_url,
    downloadCount: a.download_count,
    platform: detectPlatform(a.name),
    arch: detectArch(a.name),
    format: detectFormat(a.name),
    label: assetLabel(a.name),
  };
}

function mapRelease(r: GhRelease): Release {
  return {
    id: r.id,
    tag: r.tag_name,
    version: r.tag_name.replace(/^v/, ""),
    name: r.name || r.tag_name,
    notes: r.body ?? "",
    htmlUrl: r.html_url,
    publishedAt: r.published_at,
    prerelease: r.prerelease,
    draft: r.draft,
    assets: r.assets.filter((a) => !isMetadataAsset(a.name)).map(mapAsset),
  };
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`, {
      headers: headers(),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** The newest published, non-draft release. Falls back to the newest prerelease. */
export async function getLatestRelease(): Promise<Release | null> {
  const direct = await get<GhRelease>("/releases/latest");
  if (direct) return mapRelease(direct);

  const all = await getAllReleases();
  return all[0] ?? null;
}

export async function getAllReleases(): Promise<Release[]> {
  const list = await get<GhRelease[]>("/releases?per_page=100");
  if (!list) return [];
  return list.filter((r) => !r.draft).map(mapRelease);
}

export async function getRelease(tag: string): Promise<Release | null> {
  const r = await get<GhRelease>(`/releases/tags/${encodeURIComponent(tag)}`);
  return r ? mapRelease(r) : null;
}
