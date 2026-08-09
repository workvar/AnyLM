# Web UI Polish, SEO, and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix download/home marketing UX (markdown notes, asset rows, symmetric Features/Skills with Coming soon, multi-color Drop-in), and ship env-gated SEO/OG/icons plus GA4 + Clarity on the `web/` site.

**Architecture:** Stay on Next.js App Router. Pure data/helpers for upcoming flags and code tokens; `react-markdown` + `remark-gfm` for release bodies; Metadata API + `public/` assets for SEO; a single client `Analytics` component that no-ops when env IDs are empty.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, `react-markdown`, `remark-gfm`, `next/script`. Verification via Node built-in `node:test` for pure helpers + `npm run typecheck` / `npm run build` in `web/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-web-ui-seo-analytics-design.md`
- Scope: `web/` only — no Electron/`app/` changes
- Upcoming cards must show a visible **Coming soon** badge; never claim Phase 2+ / cloud backends as shipped
- Analytics + search verification load **only** when env IDs are non-empty
- `SITE_URL` from `NEXT_PUBLIC_SITE_URL`, fallback `https://anylm.app`
- Token colors for Drop-in: pink keywords, lime names, orange strings, off-white punctuation, white plain — not all slime green
- Commit steps run only when the user explicitly asks to commit (user rule); otherwise skip commits and leave changes unstaged

## File map

| File | Responsibility |
|------|----------------|
| `web/lib/seo.ts` | `SITE_URL`, default description, keywords, verification helpers, JSON-LD builder |
| `web/lib/seo.test.ts` | Unit tests for seo helpers |
| `web/lib/config.ts` | Keep product/GitHub constants; re-export or leave `SITE_URL` in `seo.ts` only |
| `web/components/releases/ReleaseNotes.tsx` | Render markdown with GFM |
| `web/components/download/AssetRow.tsx` | Full filename, size under name, download icon |
| `web/app/download/page.tsx` | Drop “Built by GitHub Actions” from subtitle |
| `web/components/home/features.data.ts` | +1 upcoming feature; `upcoming?: boolean` |
| `web/components/home/Features.tsx` | Coming soon badge + new icon |
| `web/components/home/features.data.test.ts` | Assert 9 features, multiples of 3 upcoming pad |
| `web/components/home/CodeSample.tsx` | Hand-tokenized Python spans |
| `web/components/home/code-sample.tokens.ts` | Token array + color map |
| `web/components/home/code-sample.tokens.test.ts` | Assert token kinds present |
| `web/components/home/capabilities.data.ts` | Pad Skills groups with upcoming |
| `web/components/home/Capabilities.tsx` | Coming soon badge |
| `web/components/home/capabilities.data.test.ts` | Assert Skills groups size % 3 === 0 |
| `web/components/site/Analytics.tsx` | GA4 + Clarity via `next/script` |
| `web/components/site/JsonLd.tsx` | SoftwareApplication JSON-LD script |
| `web/app/layout.tsx` | Full metadata, icons, verification, Analytics |
| `web/app/robots.ts` | Allow all; point to sitemap |
| `web/app/sitemap.ts` | `/`, `/download`, `/releases` |
| `web/app/page.tsx` | Mount JsonLd |
| `web/public/favicon.ico`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og.png` | Brand assets |
| `web/.env.example` | Document public env keys (empty values) |
| `web/package.json` | deps + `test` script |

Paths below are relative to `web/` unless noted.

---

### Task 1: Dependencies, SEO helpers, env example

**Files:**
- Modify: `package.json`
- Create: `lib/seo.ts`
- Create: `lib/seo.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `SITE_URL: string` — trimmed, no trailing slash
  - `DEFAULT_DESCRIPTION: string`
  - `DEFAULT_KEYWORDS: string[]`
  - `getVerification(): { google?: string; other?: { 'msvalidate.01': string } }` — omit empty
  - `buildSoftwareJsonLd(): Record<string, unknown>`

- [ ] **Step 1: Install markdown deps and add test script**

```bash
cd web
npm install react-markdown remark-gfm
```

Add to `package.json` scripts:

```json
"test": "node --import tsx --test lib/**/*.test.ts components/**/*.test.ts"
```

If `tsx` is not present, install it as a devDependency: `npm install -D tsx`. Prefer Node 22+ `node --experimental-strip-types --test` only if the repo already uses that pattern; otherwise use `tsx`.

- [ ] **Step 2: Write failing seo tests**

```typescript
// lib/seo.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SITE_URL, getVerification, buildSoftwareJsonLd, DEFAULT_DESCRIPTION } from "./seo";

describe("seo", () => {
  it("SITE_URL has no trailing slash", () => {
    assert.equal(SITE_URL.endsWith("/"), false);
    assert.match(SITE_URL, /^https?:\/\//);
  });

  it("getVerification omits empty ids", () => {
    const v = getVerification();
    if (!process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION) {
      assert.equal(v.google, undefined);
    }
    if (!process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION) {
      assert.equal(v.other, undefined);
    }
  });

  it("buildSoftwareJsonLd includes name and url", () => {
    const ld = buildSoftwareJsonLd();
    assert.equal(ld["@type"], "SoftwareApplication");
    assert.equal(ld.name, "AnyLM");
    assert.equal(ld.url, SITE_URL);
    assert.ok(typeof DEFAULT_DESCRIPTION === "string" && DEFAULT_DESCRIPTION.length > 20);
  });
});
```

- [ ] **Step 3: Run tests — expect fail (module missing)**

Run: `cd web && npm test -- lib/seo.test.ts`  
Expected: FAIL cannot find module `./seo`

- [ ] **Step 4: Implement `lib/seo.ts`**

```typescript
import { PRODUCT_NAME, TAGLINE } from "./config";

const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://anylm.app";
export const SITE_URL = raw.replace(/\/$/, "");

export const DEFAULT_DESCRIPTION =
  "AnyLM is a background router for local LLMs. It pools every model already installed on your machine behind one OpenAI-compatible endpoint, so no app ever loads the same weights twice.";

export const DEFAULT_KEYWORDS = [
  "AnyLM",
  "local LLM",
  "OpenAI compatible",
  "Ollama",
  "model router",
  "desktop AI",
];

export function getVerification(): {
  google?: string;
  other?: { "msvalidate.01": string };
} {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();
  const out: { google?: string; other?: { "msvalidate.01": string } } = {};
  if (google) out.google = google;
  if (bing) out.other = { "msvalidate.01": bing };
  return out;
}

export function buildSoftwareJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PRODUCT_NAME,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    slogan: TAGLINE,
  };
}
```

- [ ] **Step 5: Update `.env.example`** — append (keep existing GitHub keys; do not paste real secrets):

```bash
# Public site origin (no trailing slash). Used for metadataBase, sitemap, OG.
NEXT_PUBLIC_SITE_URL=https://anylm.app

# Analytics — leave empty to disable scripts locally
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_CLARITY_ID=

# Search Console / Bing Webmaster meta verification
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_BING_SITE_VERIFICATION=
```

- [ ] **Step 6: Re-run tests — expect pass**

Run: `cd web && npm test -- lib/seo.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit** (only if user asked)

```bash
git add web/package.json web/package-lock.json web/lib/seo.ts web/lib/seo.test.ts web/.env.example
git commit -m "$(cat <<'EOF'
feat(web): add seo helpers and markdown deps

EOF
)"
```

---

### Task 2: Release notes markdown

**Files:**
- Modify: `components/releases/ReleaseNotes.tsx`

**Interfaces:**
- Consumes: `notes: string`
- Produces: same default export; renders GFM HTML via `react-markdown`

- [ ] **Step 1: Replace `ReleaseNotes` implementation**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ReleaseNotes({ notes }: { notes: string }) {
  const trimmed = notes.trim();
  if (!trimmed) return null;

  return (
    <div className="release-notes text-sm leading-relaxed text-[var(--color-mist)] [&_a]:text-[var(--color-slime)] [&_a:hover]:underline [&_strong]:text-white [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:my-2 [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/55 [&_pre]:p-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npm run typecheck`  
Expected: PASS

- [ ] **Step 3: Manual smoke** — `npm run dev`, open `/download` and `/releases`, confirm `#` / `###` / `- **bold**` render as headings/lists/bold (not raw markdown).

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add web/components/releases/ReleaseNotes.tsx
git commit -m "$(cat <<'EOF'
fix(web): render release notes as markdown

EOF
)"
```

---

### Task 3: Download asset rows + heading copy

**Files:**
- Modify: `components/download/AssetRow.tsx`
- Modify: `app/download/page.tsx` (subtitle only)

**Interfaces:**
- Consumes: `ReleaseAsset` (`label`, `name`, `size`, `downloadUrl`, `format` unused in UI)
- Produces: full-width download link with icon affordance

- [ ] **Step 1: Rewrite `AssetRow.tsx`**

```tsx
import { formatSize, type ReleaseAsset } from "@/lib/releases";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AssetRow({ asset }: { asset: ReleaseAsset }) {
  return (
    <a
      href={asset.downloadUrl}
      className="group flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 transition hover:border-[var(--color-slime)]/50 hover:bg-black/45"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{asset.label}</p>
        <p className="mt-0.5 break-all font-mono text-[11px] leading-snug text-[var(--color-mist)]">
          {asset.name}
        </p>
        <p className="mt-1 text-[11px] text-[var(--color-mist)]">{formatSize(asset.size)}</p>
      </div>
      <span
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--color-mist)] transition group-hover:text-[var(--color-slime)]"
        aria-hidden
      >
        <DownloadIcon className="h-4 w-4" />
      </span>
      <span className="sr-only">Download {asset.format}</span>
    </a>
  );
}
```

- [ ] **Step 2: Update download subtitle in `app/download/page.tsx`**

Replace the release branch string with:

```tsx
{release
  ? `Published ${formatDate(release.publishedAt)}.`
  : "No release has been published yet. Push a version tag to trigger the build."}
```

- [ ] **Step 3: Typecheck + visual check**

Run: `cd web && npm run typecheck`  
Manual: `/download` — full filenames visible; size under name; hover greens the icon; no “Built by GitHub Actions”.

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add web/components/download/AssetRow.tsx web/app/download/page.tsx
git commit -m "$(cat <<'EOF'
fix(web): clarify download rows and drop CI subtitle

EOF
)"
```

---

### Task 4: Features grid — Coming soon pad to 9

**Files:**
- Modify: `components/home/features.data.ts`
- Modify: `components/home/Features.tsx`
- Create: `components/home/features.data.test.ts`

**Interfaces:**
- Extends `Feature` with `upcoming?: boolean`
- Produces: `FEATURES.length === 9` with exactly one `upcoming: true`

- [ ] **Step 1: Write failing data test**

```typescript
// components/home/features.data.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FEATURES } from "./features.data";

describe("FEATURES", () => {
  it("has nine cards for a full 3-column desktop grid", () => {
    assert.equal(FEATURES.length, 9);
    assert.equal(FEATURES.length % 3, 0);
  });

  it("marks cloud backends as upcoming only", () => {
    const upcoming = FEATURES.filter((f) => f.upcoming);
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].title, "Cloud API backends");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `cd web && npm test -- components/home/features.data.test.ts`  
Expected: FAIL length 8 ≠ 9

- [ ] **Step 3: Extend data + UI**

In `features.data.ts` add to interface:

```ts
upcoming?: boolean;
```

Append:

```ts
{
  glyph: "☁",
  title: "Cloud API backends",
  body: "Optional Claude, OpenAI, and similar API keys as selectable backends beside local models — same chat flow, cloud when you choose it.",
  upcoming: true,
},
```

In `Features.tsx`, add icon path for `"☁"` (simple cloud outline), and on each card when `f.upcoming`:

```tsx
{f.upcoming ? (
  <span className="rounded-full border border-[var(--color-slime)]/35 px-2 py-0.5 text-[10px] text-[var(--color-slime)]">
    Coming soon
  </span>
) : null}
```

Place badge in a flex row with the title or top-right of the card.

- [ ] **Step 4: Re-run test + typecheck**

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add web/components/home/features.data.ts web/components/home/Features.tsx web/components/home/features.data.test.ts
git commit -m "$(cat <<'EOF'
feat(web): pad features grid with coming-soon cloud backends

EOF
)"
```

---

### Task 5: Drop-in multi-color code sample

**Files:**
- Create: `components/home/code-sample.tokens.ts`
- Create: `components/home/code-sample.tokens.test.ts`
- Modify: `components/home/CodeSample.tsx`

**Interfaces:**
- Produces:
  - `type TokenKind = "keyword" | "name" | "string" | "punct" | "plain"`
  - `SNIPPET_TOKENS: { text: string; kind: TokenKind }[]`
  - `TOKEN_CLASS: Record<TokenKind, string>`

- [ ] **Step 1: Write failing token test**

```typescript
// components/home/code-sample.tokens.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SNIPPET_TOKENS } from "./code-sample.tokens";

describe("SNIPPET_TOKENS", () => {
  it("includes all token kinds", () => {
    const kinds = new Set(SNIPPET_TOKENS.map((t) => t.kind));
    for (const k of ["keyword", "name", "string", "punct", "plain"] as const) {
      assert.ok(kinds.has(k), `missing kind ${k}`);
    }
  });

  it("reconstructs the OpenAI snippet", () => {
    const joined = SNIPPET_TOKENS.map((t) => t.text).join("");
    assert.match(joined, /from openai import OpenAI/);
    assert.match(joined, /base_url=/);
    assert.match(joined, /localhost:3227/);
  });

  it("does not mark the whole file as one green blob", () => {
    assert.ok(SNIPPET_TOKENS.length > 20);
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement tokens + `CodeSample`**

Color map (Tailwind arbitrary or inline):

```ts
export const TOKEN_CLASS = {
  keyword: "text-[#ff6b9d]", // pink/magenta
  name: "text-[#b8f778]", // lime
  string: "text-[#e8b86d]", // orange/tan
  punct: "text-[#d7dbe7]", // off-white
  plain: "text-white",
} as const;
```

Hand-split the existing Python snippet into spans (keywords: `from`, `import`; names: `OpenAI`, `chat`, `completions`, `create`; strings: quoted literals; punct: `()[]{},:=.`; rest plain).

`CodeSample.tsx`:

```tsx
import { SNIPPET_TOKENS, TOKEN_CLASS } from "./code-sample.tokens";

// ... left copy unchanged ...

<pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/55 p-5 font-mono text-[13px] leading-relaxed">
  <code>
    {SNIPPET_TOKENS.map((t, i) => (
      <span key={i} className={TOKEN_CLASS[t.kind]}>
        {t.text}
      </span>
    ))}
  </code>
</pre>
```

Remove the old all-slime `text-[var(--color-slime)]` on `<pre>`.

- [ ] **Step 4: Tests + typecheck + visual check of Drop-in section**

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add web/components/home/code-sample.tokens.ts web/components/home/code-sample.tokens.test.ts web/components/home/CodeSample.tsx
git commit -m "$(cat <<'EOF'
feat(web): multi-token syntax colors for drop-in sample

EOF
)"
```

---

### Task 6: Skills catalog — fill rows + Coming soon

**Files:**
- Modify: `components/home/capabilities.data.ts`
- Modify: `components/home/Capabilities.tsx`
- Create: `components/home/capabilities.data.test.ts`

**Interfaces:**
- Extends `CapabilityItem` with `upcoming?: boolean`
- Skills groups Built-in / Connector / User-defined each length `% 3 === 0`

- [ ] **Step 1: Write failing test**

```typescript
// components/home/capabilities.data.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SKILLS } from "./capabilities.data";

describe("SKILLS", () => {
  it("pads each group to a multiple of 3 for desktop rows", () => {
    const byGroup = new Map<string, number>();
    for (const s of SKILLS) {
      const g = s.group || "General";
      byGroup.set(g, (byGroup.get(g) || 0) + 1);
    }
    for (const [g, n] of byGroup) {
      assert.equal(n % 3, 0, `${g} has ${n} items`);
    }
  });

  it("labels roadmap items as upcoming", () => {
    const upcoming = SKILLS.filter((s) => s.upcoming);
    assert.ok(upcoming.length >= 4);
    assert.ok(upcoming.every((s) => s.upcoming === true));
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Extend interface and data**

```ts
upcoming?: boolean;
```

Add (Coming soon):

| Group | Name | Description |
|-------|------|-------------|
| Built-in | Research specialist | Phase 2+ multi-agent research role that plans deeper web + doc passes on complex questions. |
| Connector | Slack | Read channels and post messages in workspaces the user connects (confirm on send). |
| User-defined | Shared team skills | Publish a skill once and enable it across an organisation’s members. |
| User-defined | Skill marketplace | Browse and install community skills without hand-writing instruction bundles. |

Keep existing five shipped skills.

- [ ] **Step 4: Badge in `Capabilities.tsx`**

Next to `risky` badge:

```tsx
{item.upcoming ? (
  <span className="shrink-0 rounded-full border border-[var(--color-slime)]/35 px-2 py-0.5 text-[10px] text-[var(--color-slime)]">
    Coming soon
  </span>
) : null}
```

Do not show both `risky` and `upcoming` on the same item.

- [ ] **Step 5: Tests + typecheck + visual Skills tab**

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add web/components/home/capabilities.data.ts web/components/home/Capabilities.tsx web/components/home/capabilities.data.test.ts
git commit -m "$(cat <<'EOF'
feat(web): fill skills catalog with coming-soon roadmap cards

EOF
)"
```

---

### Task 7: Favicon, app icons, OG image

**Files:**
- Create: `public/favicon.ico`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`
- Create: `public/apple-touch-icon.png`
- Create: `public/og.png` (1200×630)

**Interfaces:**
- Static assets only; referenced by Task 8 metadata

- [ ] **Step 1: Generate brand assets**

Visual: near-black `#030405` background, slime `#7df9a6` accent mark (simple “A” monogram or hex/router glyph), white “AnyLM” wordmark on OG only.

Options (pick one during implementation):

1. Use Cursor `GenerateImage` for `og.png` and square icons, then convert/resize.
2. Or write a small Node canvas/sharp script under `web/scripts/gen-icons.mjs` and run once; commit outputs, not the script unless useful.

Requirements:

- `og.png`: 1200×630, product name + tagline (“One router. Every model. Zero duplication.”), dark + slime — no purple, no stock photo
- `icon-512.png` / `icon-192.png` / `apple-touch-icon.png` (180×180): same monogram on dark
- `favicon.ico`: 32×32 (and/or multi-size) derived from the monogram

- [ ] **Step 2: Verify files exist**

```bash
cd web && ls -la public/favicon.ico public/icon-192.png public/icon-512.png public/apple-touch-icon.png public/og.png
```

Expected: all present, `og.png` roughly ≥ 50KB (not empty stub)

- [ ] **Step 3: Commit** (only if user asked)

```bash
git add web/public/
git commit -m "$(cat <<'EOF'
feat(web): add favicon, app icons, and og image

EOF
)"
```

---

### Task 8: Metadata, robots, sitemap, JSON-LD

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Create: `components/site/JsonLd.tsx`
- Modify: `app/page.tsx`
- Optionally tighten page metadata on `app/download/page.tsx` and `app/releases/page.tsx` descriptions

**Interfaces:**
- Consumes: `SITE_URL`, `DEFAULT_DESCRIPTION`, `DEFAULT_KEYWORDS`, `getVerification`, `buildSoftwareJsonLd` from `lib/seo.ts`

- [ ] **Step 1: `robots.ts`**

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 2: `sitemap.ts`**

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/download", "/releases"];
  return paths.map((path) => ({
    url: `${SITE_URL}${path || "/"}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "daily",
    priority: path === "" ? 1 : 0.8,
  }));
}
```

- [ ] **Step 3: `JsonLd.tsx`**

```tsx
import { buildSoftwareJsonLd } from "@/lib/seo";

export default function JsonLd() {
  const data = buildSoftwareJsonLd();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

Mount in `app/page.tsx` at the top of the fragment.

- [ ] **Step 4: Expand `app/layout.tsx` metadata**

```ts
import {
  SITE_URL,
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  getVerification,
} from "@/lib/seo";
import { PRODUCT_NAME, TAGLINE } from "@/lib/config";
import Analytics from "@/components/site/Analytics"; // wired in Task 9; stub null export first if needed

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${PRODUCT_NAME} — ${TAGLINE}`,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  applicationName: PRODUCT_NAME,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} — ${TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: PRODUCT_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME} — ${TAGLINE}`,
    description: DEFAULT_DESCRIPTION,
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  verification: getVerification(),
};
```

If `getVerification()` returns `{}`, Next accepts empty verification.

- [ ] **Step 5: Typecheck + curl local routes after `next build`**

```bash
cd web && npm run typecheck && npm run build
```

Expected: PASS; build emits `/robots.txt` and `/sitemap.xml` routes.

- [ ] **Step 6: Commit** (only if user asked)

```bash
git add web/app/layout.tsx web/app/robots.ts web/app/sitemap.ts web/components/site/JsonLd.tsx web/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(web): add metadata, robots, sitemap, and JSON-LD

EOF
)"
```

---

### Task 9: GA4 + Clarity analytics

**Files:**
- Create: `components/site/Analytics.tsx`
- Modify: `app/layout.tsx` (mount `<Analytics />` in `<body>`)

**Interfaces:**
- Reads `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_CLARITY_ID`
- Renders `null` when both empty

- [ ] **Step 1: Implement client Analytics**

```tsx
"use client";

import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID?.trim();

export default function Analytics() {
  if (!GA_ID && !CLARITY_ID) return null;

  return (
    <>
      {GA_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}</Script>
        </>
      ) : null}
      {CLARITY_ID ? (
        <Script id="ms-clarity" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "${CLARITY_ID}");
        `}</Script>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Mount in root layout**

```tsx
<body className="grain min-h-dvh antialiased">
  <Analytics />
  <Nav />
  <main>{children}</main>
  <Footer />
</body>
```

- [ ] **Step 3: Verify empty-env safety**

With unset IDs: `npm run build` succeeds; view-source has no `gtag` / `clarity` scripts.

Optionally set dummy IDs in `.env.local` and confirm scripts appear (do not commit `.env.local`).

- [ ] **Step 4: Commit** (only if user asked)

```bash
git add web/components/site/Analytics.tsx web/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(web): add env-gated GA4 and Clarity

EOF
)"
```

---

### Task 10: Final verification

**Files:** none new — regression gate

- [ ] **Step 1: Run all automated checks**

```bash
cd web
npm test
npm run typecheck
npm run build
```

Expected: all PASS

- [ ] **Step 2: Manual checklist against the spec**

| Check | Pass? |
|-------|-------|
| `/download` notes render as markdown | |
| Filenames fully visible; size under name; green download icon on hover | |
| No “Built by GitHub Actions” | |
| Features: 9 cards, Coming soon on Cloud API backends | |
| Skills groups fill 3 columns; Coming soon badges visible | |
| Drop-in uses pink/lime/orange/white tokens | |
| Favicon + OG tags present in document head | |
| `/robots.txt` and `/sitemap.xml` resolve | |
| No analytics scripts without env IDs | |

- [ ] **Step 3: Spec coverage self-check** — confirm every Goals/Non-goals item in `2026-08-09-web-ui-seo-analytics-design.md` is handled or explicitly out of scope.

- [ ] **Step 4: Final commit** (only if user asked) — single squash or leave task commits as-is per user preference.

---

## Plan self-review

1. **Spec coverage:** Download notes, asset rows, subtitle, Features pad, Drop-in colors, Skills pad, SEO/OG/icons, robots/sitemap/JSON-LD, GA/Clarity/verification env — each has a task. Non-goals (account creation, real secrets, Electron) excluded.
2. **Placeholders:** None remaining; token colors, upcoming titles, env key names, and file paths are concrete.
3. **Type consistency:** `upcoming?: boolean` on Feature and CapabilityItem; `SITE_URL` / `getVerification` / `buildSoftwareJsonLd` names match across Tasks 1, 8, 9.
