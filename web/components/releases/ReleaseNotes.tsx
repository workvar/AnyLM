/**
 * Release bodies are markdown, but we only need light formatting here, so we
 * render them as preformatted text with headings and bullets left intact.
 */
export default function ReleaseNotes({ notes }: { notes: string }) {
  const trimmed = notes.trim();
  if (!trimmed) return null;

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-mist)]">
      {trimmed}
    </div>
  );
}
