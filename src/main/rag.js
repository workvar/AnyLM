// RAG primitives: chunking, cosine similarity, and top-k retrieval.

// Split text into overlapping chunks, breaking on paragraph/sentence where possible.
function chunkText(text, size = 900, overlap = 150) {
  const clean = (text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // Prefer a natural break (paragraph, then sentence, then space) near the end.
      const slice = clean.slice(start, end);
      const brk = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". ")
      );
      if (brk > size * 0.5) end = start + brk + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// items: [{ vector, ...meta }]. Returns top-k items with a score, highest first.
function topK(queryVec, items, k = 4) {
  return items
    .filter((it) => Array.isArray(it.vector) && it.vector.length)
    .map((it) => ({ ...it, score: cosine(queryVec, it.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

module.exports = { chunkText, cosine, topK };
