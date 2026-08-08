export async function lookupCodingDocs(opts: {
  text: string;
  search: (q: string) => Promise<string>;
}): Promise<{ block: string; note: string | null }> {
  const q = `official project scaffold CLI ${String(opts.text || "").slice(0, 120)} current docs`;
  try {
    const raw = await opts.search(q);
    if (!raw || /^Error:/i.test(raw) || /^No results/i.test(raw)) {
      return { block: "", note: "docs lookup skipped (offline or no results)" };
    }
    return {
      block:
        "Current docs / scaffold search results (prefer these CLI flags and versions):\n\n" + raw,
      note: null,
    };
  } catch {
    return { block: "", note: "docs lookup skipped (offline)" };
  }
}
