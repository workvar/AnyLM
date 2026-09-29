"use client";

import type { ReactNode } from "react";

/**
 * Framed product UI mockups that mirror the AWC/MD3 desktop chrome.
 * Used as landing-page screenshots (and as the visual source for gallery exports).
 */

export type ShotId = "hero" | "projects" | "agents" | "models" | "endpoint";

const SHOTS: Record<
  ShotId,
  { title: string; caption: string; body: ReactNode }
> = {
  hero: {
    title: "Chat workspace",
    caption: "Projects, RAG, and a shared local endpoint — Material You chrome.",
    body: <ChatShot />,
  },
  projects: {
    title: "Projects + RAG",
    caption: "Attach docs; chunks retrieve into every turn automatically.",
    body: <ProjectsShot />,
  },
  agents: {
    title: "Multi-agent trail",
    caption: "Orchestrator plans, routes, and synthesizes with a visible trail.",
    body: <AgentsShot />,
  },
  models: {
    title: "Models pool",
    caption: "Every Ollama weight on disk, one resident runtime.",
    body: <ModelsShot />,
  },
  endpoint: {
    title: "OpenAI-compatible :3227",
    caption: "Editors and scripts share the same local router.",
    body: <EndpointShot />,
  },
};

function WindowChrome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="shot-window overflow-hidden rounded-[28px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">
          {title}
        </span>
      </div>
      <div className="min-h-[320px] bg-[var(--md-sys-color-background)]">{children}</div>
    </div>
  );
}

function Rail() {
  return (
    <aside className="flex w-[200px] shrink-0 flex-col gap-3 border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3">
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--md-sys-color-primary)] text-[10px] font-bold text-[var(--md-sys-color-on-primary)]">
          ●
        </span>
        <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">AnyLM</span>
      </div>
      <div className="rounded-full bg-[var(--md-sys-color-primary)] px-3 py-2 text-center text-xs font-medium text-[var(--md-sys-color-on-primary)]">
        + New chat
      </div>
      <div className="space-y-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        <p className="px-2 text-[10px] uppercase tracking-wide">Chats</p>
        {["Local router design", "RAG for notes", "Ollama setup"].map((t, i) => (
          <div
            key={t}
            className={`rounded-xl px-2 py-1.5 ${i === 0 ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]" : ""}`}
          >
            {t}
          </div>
        ))}
      </div>
    </aside>
  );
}

function ChatShot() {
  return (
    <div className="flex h-full min-h-[340px]">
      <Rail />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">Local router design</p>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">llama3.2 · tools on</p>
          </div>
          <span className="rounded-full bg-[var(--md-sys-color-primary-container)] px-2.5 py-1 text-[10px] text-[var(--md-sys-color-on-primary-container)]">
            :3227 live
          </span>
        </div>
        <div className="flex-1 space-y-3 p-4">
          <div className="ml-auto max-w-[75%] rounded-[20px] rounded-br-md bg-[var(--md-sys-color-primary-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-primary-container)]">
            Pool every local model behind one OpenAI endpoint.
          </div>
          <div className="max-w-[80%] rounded-[20px] rounded-bl-md bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface)]">
            Done. Cursor, Continue, and scripts can all hit{" "}
            <span className="font-mono text-[var(--md-sys-color-primary)]">127.0.0.1:3227/v1</span> —
            one resident runtime, zero duplication.
          </div>
        </div>
        <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
          <div className="flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-highest)] px-3 py-2">
            <span className="flex-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Message AnyLM…
            </span>
            <span className="rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1 text-[10px] font-medium text-[var(--md-sys-color-on-primary)]">
              Send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectsShot() {
  return (
    <div className="flex min-h-[340px]">
      <Rail />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">Notes · Project</p>
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          {["architecture.md", "api-contract.md", "rag-eval.json", "launch-checklist.md"].map(
            (f, i) => (
              <div
                key={f}
                className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3"
              >
                <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">{f}</p>
                <p className="mt-1 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  {i % 2 === 0 ? "12 chunks · embedded" : "8 chunks · embedded"}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--md-sys-color-surface-container-highest)]">
                  <div
                    className="h-full rounded-full bg-[var(--md-sys-color-primary)]"
                    style={{ width: `${60 + i * 8}%` }}
                  />
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function AgentsShot() {
  return (
    <div className="flex min-h-[340px]">
      <Rail />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">Working</p>
        {[
          { agent: "Planner", detail: "Split research + implement" },
          { agent: "Research", detail: "Fetched Ollama tool docs" },
          { agent: "Coder", detail: "Wrote endpoint adapter" },
          { agent: "Synthesize", detail: "Merged final answer" },
        ].map((row, i) => (
          <div
            key={row.agent}
            className="flex items-center gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-3 py-2"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--md-sys-color-secondary-container)] text-[10px] font-semibold text-[var(--md-sys-color-on-secondary-container)]">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">{row.agent}</p>
              <p className="truncate text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                {row.detail}
              </p>
            </div>
            <span className="text-[10px] text-[var(--md-sys-color-primary)]">done</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelsShot() {
  return (
    <div className="flex min-h-[340px]">
      <Rail />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">Models</p>
        {[
          { name: "llama3.2", meta: "chat · resident" },
          { name: "nomic-embed-text", meta: "embeddings · ready" },
          { name: "qwen2.5-coder", meta: "chat · available" },
        ].map((m) => (
          <div
            key={m.name}
            className="flex items-center justify-between rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] px-4 py-3"
          >
            <div>
              <p className="font-mono text-xs text-[var(--md-sys-color-on-surface)]">{m.name}</p>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{m.meta}</p>
            </div>
            <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-primary)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointShot() {
  return (
    <div className="flex min-h-[340px] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[28px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--md-sys-color-primary)]">
          Local API
        </p>
        <p className="mt-2 font-mono text-lg text-[var(--md-sys-color-on-surface)]">
          http://127.0.0.1:3227/v1
        </p>
        <p className="mt-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          OpenAI-compatible. Point Cursor, Continue, or any SDK at the resident pool.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["OpenAI SDK", "Cursor", "Continue", "Scripts"].map((t) => (
            <span
              key={t}
              className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-3 py-1 text-[10px] text-[var(--md-sys-color-on-secondary-container)]"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppShot({ id }: { id: ShotId }) {
  const shot = SHOTS[id];
  return <WindowChrome title={`AnyLM · ${shot.title}`}>{shot.body}</WindowChrome>;
}

export function shotMeta(id: ShotId) {
  return SHOTS[id];
}

export const SHOT_ORDER: ShotId[] = ["hero", "projects", "agents", "models", "endpoint"];

export default function AppShowcase() {
  return (
    <section id="product" className="scroll-mt-28 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-sm text-[var(--md-sys-color-primary)]">Product</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[var(--md-sys-color-on-surface)] sm:text-4xl">
            Material Design 3, local-first.
          </h2>
          <p className="mt-4 text-[var(--md-sys-color-on-surface-variant)]">
            The desktop app is rebuilt on AWC UI — the same Material You components across auth,
            sidebar, and chat — so the screenshots below match what you install.
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          {SHOT_ORDER.map((id) => {
            const meta = shotMeta(id);
            return (
              <figure key={id} className="space-y-4">
                <AppShot id={id} />
                <figcaption>
                  <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    {meta.title}
                  </p>
                  <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                    {meta.caption}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
