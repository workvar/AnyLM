"use client";

import { useMemo, useState } from "react";
import {
  CAPABILITY_TABS,
  PLATFORM,
  SKILLS,
  TOOLS,
  type CapabilityItem,
  type CapabilityTab,
} from "./capabilities.data";

function itemsFor(tab: CapabilityTab): CapabilityItem[] {
  if (tab === "skills") return SKILLS;
  if (tab === "tools") return TOOLS;
  return PLATFORM;
}

export default function Capabilities() {
  const [tab, setTab] = useState<CapabilityTab>("skills");
  const items = useMemo(() => itemsFor(tab), [tab]);
  const groups = useMemo(() => {
    const map = new Map<string, CapabilityItem[]>();
    for (const item of items) {
      const key = item.group || "General";
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <section id="capabilities" className="scroll-mt-28 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-sm text-[var(--color-slime)]">Catalog</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Skills, tools, and platform features
          </h2>
          <p className="mt-4 text-[var(--color-mist)]">
            Everything the desktop app can offer a local model — from filesystem tools to connector
            skills and the background router itself.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Capability categories"
          className="glass mt-10 inline-flex flex-wrap gap-1 rounded-full p-1.5"
        >
          {CAPABILITY_TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`cap-tab-${t.id}`}
                aria-controls={`cap-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  selected
                    ? "bg-white text-black"
                    : "text-[var(--color-mist)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`cap-panel-${tab}`}
          aria-labelledby={`cap-tab-${tab}`}
          className="mt-8 space-y-8"
        >
          {groups.map(([group, list]) => (
            <div key={group}>
              {tab === "tools" || tab === "skills" ? (
                <h3 className="mb-3 text-xs uppercase tracking-[0.16em] text-[var(--color-mist)]">
                  {group}
                </h3>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((item) => (
                  <article key={item.name} className="glass rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-mono text-sm font-medium text-white">{item.name}</h4>
                      {item.upcoming ? (
                        <span className="shrink-0 rounded-full border border-[var(--color-slime)]/35 px-2 py-0.5 text-[10px] text-[var(--color-slime)]">
                          Coming soon
                        </span>
                      ) : item.risky ? (
                        <span className="shrink-0 rounded-full border border-[var(--color-bile)]/35 px-2 py-0.5 text-[10px] text-[var(--color-bile)]">
                          confirms
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-mist)]">
                      {item.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
