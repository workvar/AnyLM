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
import type { AgentStep, StepResult } from "./types";

const RETRIEVE_CHAR_CAP = 6000;
const MAX_TOOL_ROUNDS = 3;

export interface WorkersDeps {
  project: Project | null;
  threadId?: string | null;
  /** Model used for the tool-calling mini-loop (agents.models.toolExecutor, falls back to chat model). */
  toolModel: string;
  toolDefs: OllamaToolDef[] | null;
  skillToolAllow: Set<string> | null;
  confirm: (tool: { name: string; description: string }, args: Record<string, unknown>) => Promise<unknown>;
  ask: (payload: { question: string; options?: string[] }) => Promise<unknown>;
  act: (event: ActivityEvent) => void;
  isCancelled: () => boolean;
  /** Surfaces generated documents as file cards, same as the single-agent loop. */
  onFile?: (file: GeneratedFile) => void;
  /** Bumps the outer handler's toolsRun counter so the final summary stays accurate. */
  onToolCall?: () => void;
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

async function runTool(step: AgentStep, deps: WorkersDeps): Promise<string> {
  const chat = deps.chat || ollama.chatStream;
  const execTool = deps.execTool || toolsExec.execute;
  const execSkill = deps.execSkill || skillsExec.execute;
  const ownsSkill = deps.ownsSkill || skillsExec.owns;
  const recover = deps.recover || recoverToolCalls;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a worker agent completing one step of a larger task on behalf of another " +
        "assistant. Use tools when they help, then report your findings concisely.",
    },
    { role: "user", content: step.goal },
  ];

  let lastText = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (deps.isCancelled()) break;

    const result = await chat(deps.toolModel, messages, () => {}, deps.toolDefs);
    lastText = result.text || lastText;
    let calls = result.toolCalls || [];

    // Small models often paste tool JSON in the reply instead of emitting
    // structured tool_calls — recover those, same as the single-agent loop.
    if (deps.toolDefs && !calls.length && result.text) {
      const allowed = deps.toolDefs.map((d) => d.function.name);
      const recovered = recover(result.text, allowed);
      if (recovered.calls.length) {
        calls = recovered.calls;
        lastText = recovered.cleanedText;
      }
    }

    if (!deps.toolDefs || !calls.length) break;

    messages.push({ role: "assistant", content: result.text, tool_calls: calls });
    for (const call of calls) {
      const fname = call.function?.name || "";
      const fargs = call.function?.arguments || {};
      const label = labelFor(fname);
      const detail = detailFor(fname, fargs);
      deps.act({ kind: "tool", name: fname, label, detail, args: fargs, status: "running" });

      const output = ownsSkill(fname)
        ? await execSkill(fname, fargs, deps.confirm)
        : await execTool(fname, fargs, deps.confirm, deps.skillToolAllow, {
            projectId: deps.project ? deps.project.id : null,
            onFile: deps.onFile || (() => {}),
            ask: deps.ask,
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
  }

  return lastText || "(no output)";
}

/** Builds a runStep function for `runOrchestratedTurn`, dispatching each
 *  AgentStep to the memory / retrieve / tool worker by its kind. */
export function makeWorkers(deps: WorkersDeps): (step: AgentStep) => Promise<StepResult> {
  return async function runStep(step: AgentStep): Promise<StepResult> {
    try {
      let output: string;
      switch (step.kind) {
        case "memory":
          output = await runMemory(step, deps);
          break;
        case "retrieve":
          output = await runRetrieve(step, deps);
          break;
        default:
          output = await runTool(step, deps);
          break;
      }
      return { id: step.id, ok: true, output };
    } catch (err) {
      return { id: step.id, ok: false, output: "", error: errMessage(err) };
    }
  };
}
