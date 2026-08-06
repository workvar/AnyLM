import {
  COMPARISON_COLUMNS,
  COMPARISON_ROWS,
  type Cell,
  type ComparisonRow,
} from "./comparison.data";

function mark(cell: Cell) {
  if (cell === "yes") {
    return { label: "Yes", className: "text-[var(--color-slime)]" };
  }
  if (cell === "partial") {
    return { label: "Partial", className: "text-[var(--color-bile)]" };
  }
  return { label: "—", className: "text-white/35" };
}

function cellOf(row: ComparisonRow, key: (typeof COMPARISON_COLUMNS)[number]["key"]): Cell {
  return row[key];
}

export default function Comparison() {
  return (
    <section id="compare" className="scroll-mt-28 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-sm text-[var(--color-slime)]">Compare</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            How AnyLM sits next to the usual desktop stack
          </h2>
          <p className="mt-4 text-[var(--color-mist)]">
            Ollama and LM Studio remain excellent runtimes and chat GUIs. AnyLM&apos;s wedge is a
            shared endpoint, pooled weights, projects, and governance — often alongside Ollama, not
            instead of it.
          </p>
        </div>

        <div className="glass mt-10 overflow-x-auto rounded-3xl">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="sticky left-0 z-10 bg-[rgba(10,12,16,0.92)] px-5 py-4 font-medium text-[var(--color-mist)] backdrop-blur">
                  Capability
                </th>
                {COMPARISON_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-4 font-semibold ${
                      col.key === "anylm" ? "text-[var(--color-slime)]" : "text-white"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.axis} className="border-b border-white/5 last:border-0">
                  <th className="sticky left-0 z-10 bg-[rgba(10,12,16,0.92)] px-5 py-4 text-left font-medium text-white backdrop-blur">
                    {row.axis}
                  </th>
                  {COMPARISON_COLUMNS.map((col) => {
                    const m = mark(cellOf(row, col.key));
                    return (
                      <td
                        key={col.key}
                        className={`px-4 py-4 ${m.className} ${
                          col.key === "anylm" ? "bg-[var(--color-slime)]/[0.04]" : ""
                        }`}
                      >
                        {m.label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-[var(--color-mist)]">
          Based on typical public product positioning; features change. Partial means available with
          limits, toggles, or a different workflow.
        </p>
      </div>
    </section>
  );
}
