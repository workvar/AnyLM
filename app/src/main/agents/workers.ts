// Multi-agent worker execution: turns a planner's AgentStep into a
// StepResult by dispatching on step.kind. Reuses the exact same memory /
// retrieval / tool-calling primitives as the single-agent chat loop in
// ipc.ts so behavior (confirms, skill routing, tool recovery) stays
// consistent between the two paths.
import * as memory from "../memory";
import * as context from "../context";
import * as vectorstore from "../vectorstore";
import * as toolsExec from "../tools/exec";
import * as skillsExec from "../skills/exec";
import { recoverToolCalls } from "../tools/recover-tool-calls";
import { labelFor, detailFor } from "../activity-labels";
import * as ollama from "../ollama";
import { createMutex } from "./mutex";
import { allowlistFor, filterToolDefs } from "./specialists/allowlists";
import { specialistPrompt } from "./specialists/prompts";
import type { AgentStep, AgentStepKind, StepResult } from "./types";
import {
  DOCUMENT_GENERATE_NUDGE,
  recordToolRound,
  shouldNudgeDocumentGenerate,
  type DocNudgeState,
} from "../documents/doc-nudge";

const RETRIEVE_CHAR_CAP = 6000;
const MAX_TOOL_ROUNDS = 3;

function formatPriorOutputs(prior: StepResult[]): string {
  if (!prior.length) return "";
  const lines = prior.map((r) => {
    const body = r.ok ? r.output : r.error || "(error)";
    return `[step ${r.id}]: ${body}`;
  });
  return `Prior step outputs:\n${lines.join("\n")}\n\n`;
}

function userContentForStep(step: AgentStep, prior: StepResult[]): string {
  const prefix = formatPriorOutputs(prior);
  return prefix ? prefix + step.goal : step.goal;
}

const GENERIC_WORKER_SYSTEM =
  "You are a worker agent completing one step of a larger task on behalf of another " +
  "assistant. Use tools when they help, then report your findings concisely.";

type ConfirmFn = (
  tool: { name: string; description: string },
  args: Record<string, unknown>
) => Promise<unknown>;
type AskFn = (payload: { question: string; options?: string[] }) => Promise<unknown>;

export interface WorkersDeps {
  project: Project | null;
  threadId?: string | null;
  /** Model used for the tool-calling mini-loop (agents.models.toolExecutor, falls back to chat model). */
  toolModel: string;
  /** Per-step model resolver; defaults to toolModel when omitted (ipc wires this in Task 8). */
  modelForKind?: (kind: AgentStepKind) => string;
  toolDefs: OllamaToolDef[] | null;
  skillToolAllow: Set<string> | null;
  /** Same skills-instructions / workspace / follow-up blocks the single-agent
   *  loop prepends when tools are on, so worker tool calls get the same
   *  guidance. Null/omitted when tools are off or there's nothing to add. */
  toolSystemPrompt?: string | null;
  confirm: ConfirmFn;
  ask: AskFn;
  act: (event: ActivityEvent) => void;
  isCancelled: () => boolean;
  /** Surfaces generated documents as file cards, same as the single-agent loop. */
  onFile?: (file: GeneratedFile) => void;
  /** Bumps the outer handler's toolsRun counter so the final summary stays accurate. */
  onToolCall?: () => void;
  /** Format the user explicitly named this turn; overrules the model's own
   *  `format` arg inside generate_document. Null when none was named. */
  wantedFormat?: string | null;
  // Injectable seams for tests; default to the real modules.
  recall?: typeof memory.recall;
  retrieveContext?: typeof context.retrieve;
  searchGeneral?: typeof vectorstore.search;
  chat?: typeof ollama.chatStream;
  execTool?: typeof toolsExec.execute;
  execSkill?: typeof skillsExec.execute;
  ownsSkill?: typeof skillsExec.owns;
  recover?: typeof recoverToolCalls;
}

interface ToolRunOutput {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runMemory(step: AgentStep, deps: WorkersDeps): Promise<string> {
  if (!deps.project) return "(no project memory)";
  const recall = deps.recall || memory.recall;
  const mem = await recall({
    projectId: deps.project.id,
    threadId: deps.threadId,
    query: step.goal,
  });
  return mem || "(no project memory)";
}

async function runRetrieve(step: AgentStep, deps: WorkersDeps): Promise<string> {
  const retrieveContext = deps.retrieveContext || context.retrieve;
  const searchGeneral = deps.searchGeneral || vectorstore.search;
  const parts: string[] = [];

  if (deps.project) {
    const hits = await retrieveContext(deps.project, step.goal);
    for (const h of hits) parts.push(`[${h.name}] ${h.text}`);
  }
  const gen = await searchGeneral(step.goal, 4);
  for (const g of gen) parts.push(`[${g.name}] ${g.text}`);

  if (!parts.length) return "(no relevant context found)";
  let joined = parts.join("\n\n");
  if (joined.length > RETRIEVE_CHAR_CAP) joined = joined.slice(0, RETRIEVE_CHAR_CAP) + "…";
  return joined;
}

// `confirm`/`ask` are pre-serialized by makeWorkers (one interactive prompt
// across the whole turn at a time) before they reach here.
async function runTool(
  step: AgentStep,
  deps: WorkersDeps,
  confirm: ConfirmFn,
  ask: AskFn,
  opts: {
    model: string;
    toolDefs: OllamaToolDef[] | null;
    specialistSystem: string;
    prior?: StepResult[];
  }
): Promise<ToolRunOutput> {
  const chat = deps.chat || ollama.chatStream;
  const execTool = deps.execTool || toolsExec.execute;
  const execSkill = deps.execSkill || skillsExec.execute;
  const ownsSkill = deps.ownsSkill || skillsExec.owns;
  const recover = deps.recover || recoverToolCalls;

  const messages: ChatMessage[] = [];
  // Same tool-usage guidance (skills instructions, workspace folder,
  // follow-up nudge) the single-agent loop gives the model — without it the
  // worker only knows tools exist, not how the app expects them to be used.
  if (deps.toolSystemPrompt) {
    messages.push({ role: "system", content: deps.toolSystemPrompt });
  }
  messages.push({
    role: "system",
    content: opts.specialistSystem,
  });
  messages.push({
    role: "user",
    content: userContentForStep(step, opts.prior || []),
  });

  let lastText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const fetchedUrls = new Set<string>();
  const searchedQueries = new Set<string>();
  const kindAllow =
    step.kind === "research" ||
    step.kind === "fact_check" ||
    step.kind === "summarize" ||
    step.kind === "document"
      ? allowlistFor(step.kind)
      : null;
  const wantsDocument =
    step.kind === "document" || (!!kindAllow && kindAllow.includes("generate_document"));
  let docNudge: DocNudgeState = {
    documentIntent: wantsDocument,
    researchOnlyRounds: 0,
    attemptedGenerate: false,
    nudged: false,
  };
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (deps.isCancelled()) break;

    const result = await chat(opts.model, messages, () => {}, opts.toolDefs);
    promptTokens += result.promptTokens || 0;
    completionTokens += result.completionTokens || 0;
    lastText = result.text || lastText;
    let calls = result.toolCalls || [];

    // Small models often paste tool JSON in the reply instead of emitting
    // structured tool_calls — recover those, same as the single-agent loop.
    if (opts.toolDefs && !calls.length && result.text) {
      const allowed = opts.toolDefs.map((d) => d.function.name);
      const recovered = recover(result.text, allowed);
      if (recovered.calls.length) {
        calls = recovered.calls;
        lastText = recovered.cleanedText;
      }
    }

    if (!opts.toolDefs || !calls.length) break;

    messages.push({ role: "assistant", content: result.text, tool_calls: calls });
    for (const call of calls) {
      const fname = call.function?.name || "";
      const fargs = call.function?.arguments || {};
      const label = labelFor(fname);
      const detail = detailFor(fname, fargs);
      deps.act({ kind: "tool", name: fname, label, detail, args: fargs, status: "running" });

      const output = ownsSkill(fname)
        ? await execSkill(fname, fargs, confirm)
        : await execTool(fname, fargs, confirm, deps.skillToolAllow, {
            projectId: deps.project ? deps.project.id : null,
            onFile: deps.onFile || (() => {}),
            ask,
            fetchedUrls,
            searchedQueries,
            wantedFormat: deps.wantedFormat ?? null,
          });
      deps.onToolCall?.();

      deps.act({
        kind: "tool",
        name: fname,
        label,
        detail,
        args: fargs,
        status: "done",
        output: String(output).slice(0, 400),
      });
      messages.push({ role: "tool", content: String(output), tool_name: fname });
    }
    // Soft nudge after research-only rounds on document specialists (once).
    docNudge = recordToolRound(
      docNudge,
      calls.map((c) => c.function?.name || "")
    );
    if (shouldNudgeDocumentGenerate(docNudge)) {
      messages.push({ role: "system", content: DOCUMENT_GENERATE_NUDGE });
      docNudge = { ...docNudge, nudged: true };
    }
  }

  return { text: lastText || "(no output)", promptTokens, completionTokens };
}

/** Builds a runStep function for `runOrchestratedTurn`, dispatching each
 *  AgentStep to the memory / retrieve / tool worker by its kind.
 *
 *  Interactive `confirm`/`ask` calls are serialized across every step this
 *  runStep is used for (i.e. per turn): the orchestrator runs up to
 *  `maxParallel` "tool" steps concurrently, but only one of them may prompt
 *  the user at a time — others queue on the same lock instead of firing a
 *  second confirm/ask the renderer (which tracks one pending prompt) can't
 *  surface. Non-interactive tool execution still runs fully in parallel. */
export function makeWorkers(deps: WorkersDeps): (step: AgentStep, prior?: StepResult[]) => Promise<StepResult> {
  const modelForKind = deps.modelForKind ?? ((k: AgentStepKind) => deps.toolModel);
  const lock = createMutex();
  // Re-check isCancelled() after acquiring the lock, not just before queuing:
  // a confirm/ask queued behind another worker's prompt has no token yet
  // when the user hits Stop, so rejectPendingForChat (ipc.ts) can't reach it.
  // Without this, the queued prompt fires for real once the lock frees up —
  // surfacing a confirm dialog after the turn was already cancelled.
  const serialConfirm: ConfirmFn = (tool, args) =>
    lock(() => (deps.isCancelled() ? Promise.resolve(false) : deps.confirm(tool, args)));
  const serialAsk: AskFn = (payload) =>
    lock(() => (deps.isCancelled() ? Promise.resolve(null) : deps.ask(payload)));

  return async function runStep(step: AgentStep, prior: StepResult[] = []): Promise<StepResult> {
    try {
      let output = "";
      let promptTokens = 0;
      let completionTokens = 0;
      switch (step.kind) {
        case "memory":
          output = await runMemory(step, deps);
          break;
        case "retrieve":
          output = await runRetrieve(step, deps);
          break;
        case "research":
        case "fact_check":
        case "summarize":
        case "document": {
          const allow = allowlistFor(step.kind);
          const toolDefs = filterToolDefs(deps.toolDefs, allow);
          const usePrior =
            prior.length > 0 &&
            (step.kind === "fact_check" ||
              step.kind === "summarize" ||
              ((step.kind === "document" || step.kind === "research") && step.dependsOn.length > 0));
          const r = await runTool(step, deps, serialConfirm, serialAsk, {
            model: modelForKind(step.kind),
            toolDefs,
            specialistSystem: specialistPrompt(step.kind),
            prior: usePrior ? prior : undefined,
          });
          output = r.text;
          promptTokens = r.promptTokens;
          completionTokens = r.completionTokens;
          break;
        }
        default: {
          const r = await runTool(step, deps, serialConfirm, serialAsk, {
            model: modelForKind("tool"),
            toolDefs: deps.toolDefs,
            specialistSystem: GENERIC_WORKER_SYSTEM,
          });
          output = r.text;
          promptTokens = r.promptTokens;
          completionTokens = r.completionTokens;
          break;
        }
      }
      return { id: step.id, ok: true, output, promptTokens, completionTokens };
    } catch (err) {
      return { id: step.id, ok: false, output: "", error: errMessage(err) };
    }
  };
}
