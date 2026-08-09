import { describe, expect, test } from "bun:test";
import { makeWorkers, type WorkersDeps } from "./workers";
import type { AgentStep } from "./types";
import { specialistPrompt } from "./specialists/prompts";

function baseDeps(overrides: Partial<WorkersDeps> = {}): WorkersDeps {
  return {
    project: null,
    threadId: null,
    toolModel: "test-model",
    toolDefs: null,
    skillToolAllow: null,
    confirm: async () => true,
    ask: async () => null,
    act: () => {},
    isCancelled: () => false,
    ...overrides,
  };
}

const step = (kind: AgentStep["kind"], goal = "do the thing"): AgentStep => ({
  id: "s1",
  goal,
  dependsOn: [],
  kind,
});

describe("makeWorkers: memory", () => {
  test("returns placeholder when no project", async () => {
    const runStep = makeWorkers(baseDeps());
    const r = await runStep(step("memory"));
    expect(r.ok).toBe(true);
    expect(r.output).toBe("(no project memory)");
  });

  test("returns recalled memory for a project", async () => {
    const runStep = makeWorkers(
      baseDeps({
        project: { id: "p1" } as Project,
        recall: async () => "prior decision: use dark mode",
      })
    );
    const r = await runStep(step("memory"));
    expect(r.output).toBe("prior decision: use dark mode");
  });
});

describe("makeWorkers: retrieve", () => {
  test("joins project + general excerpts and caps length", async () => {
    const runStep = makeWorkers(
      baseDeps({
        project: { id: "p1" } as Project,
        retrieveContext: async () => [{ name: "doc1", text: "x".repeat(4000), score: 1 }],
        searchGeneral: async () => [{ name: "general", text: "y".repeat(4000), score: 1 }],
      })
    );
    const r = await runStep(step("retrieve"));
    expect(r.ok).toBe(true);
    expect(r.output.length).toBeLessThanOrEqual(6001); // cap + ellipsis
    expect(r.output).toContain("[doc1]");
    expect(r.output).toContain("[general]");
  });

  test("returns placeholder when nothing found", async () => {
    const runStep = makeWorkers(
      baseDeps({ retrieveContext: async () => [], searchGeneral: async () => [] })
    );
    const r = await runStep(step("retrieve"));
    expect(r.output).toBe("(no relevant context found)");
  });
});

describe("makeWorkers: tool", () => {
  test("returns model text when no tool calls", async () => {
    const runStep = makeWorkers(
      baseDeps({
        chat: async () => ({ text: "final answer", promptTokens: 1, completionTokens: 1, toolCalls: [] }),
      })
    );
    const r = await runStep(step("tool"));
    expect(r.ok).toBe(true);
    expect(r.output).toBe("final answer");
  });

  test("executes tool calls via toolsExec and stops after MAX rounds", async () => {
    let calls = 0;
    const toolEvents: string[] = [];
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          { type: "function", function: { name: "web_search", description: "", parameters: { type: "object", properties: {}, required: [] } } },
        ],
        chat: async () => {
          calls += 1;
          return {
            text: "",
            promptTokens: 1,
            completionTokens: 1,
            toolCalls: [{ function: { name: "web_search", arguments: { query: "x" } } }],
          };
        },
        execTool: async () => "search results",
        ownsSkill: () => false,
        act: (e) => toolEvents.push(e.kind),
      })
    );
    const r = await runStep(step("tool"));
    expect(r.ok).toBe(true);
    expect(calls).toBe(3); // MAX_TOOL_ROUNDS
    expect(toolEvents.filter((k) => k === "tool").length).toBe(6); // running+done per round
    expect(r.promptTokens).toBe(3); // 1 per round
    expect(r.completionTokens).toBe(3);
  });

  test("prepends toolSystemPrompt (skills/workspace instructions) when provided", async () => {
    const seenMessages: ChatMessage[][] = [];
    const runStep = makeWorkers(
      baseDeps({
        toolSystemPrompt: "Use the workspace folder at /tmp/proj.",
        chat: async (_model, messages) => {
          seenMessages.push(messages as ChatMessage[]);
          return { text: "ok", promptTokens: 0, completionTokens: 0, toolCalls: [] };
        },
      })
    );
    await runStep(step("tool"));
    expect(seenMessages[0][0]).toEqual({
      role: "system",
      content: "Use the workspace folder at /tmp/proj.",
    });
  });

  test("uses skillsExec when ownsSkill is true", async () => {
    let usedSkill = false;
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          { type: "function", function: { name: "gcal_create", description: "", parameters: { type: "object", properties: {}, required: [] } } },
        ],
        chat: async () => ({
          text: "",
          promptTokens: 1,
          completionTokens: 1,
          toolCalls: [{ function: { name: "gcal_create", arguments: {} } }],
        }),
        ownsSkill: () => true,
        execSkill: async () => {
          usedSkill = true;
          return "event created";
        },
      })
    );
    await runStep(step("tool"));
    expect(usedSkill).toBe(true);
  });

  test("recovers pasted tool JSON when structured calls are absent", async () => {
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          { type: "function", function: { name: "web_search", description: "", parameters: { type: "object", properties: {}, required: [] } } },
        ],
        chat: async () => ({
          text: '{"name":"web_search","arguments":{"query":"x"}}',
          promptTokens: 1,
          completionTokens: 1,
          toolCalls: [],
        }),
        execTool: async () => "recovered result",
        ownsSkill: () => false,
      })
    );
    const r = await runStep(step("tool"));
    expect(r.ok).toBe(true);
  });

  test("stops between rounds when cancelled", async () => {
    let calls = 0;
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          { type: "function", function: { name: "web_search", description: "", parameters: { type: "object", properties: {}, required: [] } } },
        ],
        isCancelled: () => calls >= 1,
        chat: async () => {
          calls += 1;
          return {
            text: "",
            promptTokens: 1,
            completionTokens: 1,
            toolCalls: [{ function: { name: "web_search", arguments: {} } }],
          };
        },
        execTool: async () => "result",
        ownsSkill: () => false,
      })
    );
    await runStep(step("tool"));
    expect(calls).toBe(1);
  });
});

describe("makeWorkers: confirm/ask serialization", () => {
  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  test("confirm() calls from parallel tool workers never overlap", async () => {
    let active = 0;
    let maxActive = 0;
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          {
            type: "function",
            function: { name: "risky_tool", description: "", parameters: { type: "object", properties: {}, required: [] } },
          },
        ],
        chat: async () => ({
          text: "",
          promptTokens: 0,
          completionTokens: 0,
          toolCalls: [{ function: { name: "risky_tool", arguments: {} } }],
        }),
        ownsSkill: () => false,
        execTool: async (_name, _args, confirm) => {
          await confirm({ name: "risky_tool", description: "" }, {});
          return "done";
        },
        confirm: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await delay(10);
          active -= 1;
          return true;
        },
      })
    );

    await Promise.all([
      runStep({ id: "a", goal: "step a", dependsOn: [], kind: "tool" }),
      runStep({ id: "b", goal: "step b", dependsOn: [], kind: "tool" }),
    ]);
    expect(maxActive).toBe(1);
  });

  test("ask() calls from parallel tool workers never overlap", async () => {
    let active = 0;
    let maxActive = 0;
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          {
            type: "function",
            function: { name: "ask_user", description: "", parameters: { type: "object", properties: {}, required: [] } },
          },
        ],
        chat: async () => ({
          text: "",
          promptTokens: 0,
          completionTokens: 0,
          toolCalls: [{ function: { name: "ask_user", arguments: {} } }],
        }),
        ownsSkill: () => false,
        execTool: async (_name, _args, _confirm, _allow, ctx) => {
          await (ctx as { ask: (p: { question: string }) => Promise<unknown> }).ask({ question: "q?" });
          return "answered";
        },
        ask: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await delay(10);
          active -= 1;
          return "yes";
        },
      })
    );

    await Promise.all([
      runStep({ id: "a", goal: "step a", dependsOn: [], kind: "tool" }),
      runStep({ id: "b", goal: "step b", dependsOn: [], kind: "tool" }),
      runStep({ id: "c", goal: "step c", dependsOn: [], kind: "tool" }),
    ]);
    expect(maxActive).toBe(1);
  });

  test("a confirm queued behind the mutex resolves false (not deps.confirm) once cancelled", async () => {
    let confirmCalls = 0;
    let cancelled = false;
    let releaseFirst: (() => void) | null = null;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const approvals: boolean[] = [];
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          {
            type: "function",
            function: { name: "risky_tool", description: "", parameters: { type: "object", properties: {}, required: [] } },
          },
        ],
        chat: async () => ({
          text: "",
          promptTokens: 0,
          completionTokens: 0,
          toolCalls: [{ function: { name: "risky_tool", arguments: {} } }],
        }),
        ownsSkill: () => false,
        execTool: async (_name, _args, confirm) => {
          approvals.push(!!(await confirm({ name: "risky_tool", description: "" }, {})));
          return "done";
        },
        isCancelled: () => cancelled,
        confirm: async () => {
          confirmCalls += 1;
          // First caller holds the lock until we've simulated Stop and
          // queued the second worker's confirm behind it.
          await firstGate;
          return true;
        },
      })
    );

    const first = runStep({ id: "a", goal: "step a", dependsOn: [], kind: "tool" });
    // Give the first confirm() a tick to register and take the lock.
    await delay(1);
    const second = runStep({ id: "b", goal: "step b", dependsOn: [], kind: "tool" });
    // User hits Stop while the second worker's confirm is still queued
    // behind the first (no token registered for it yet).
    cancelled = true;
    releaseFirst?.();

    await Promise.all([first, second]);
    expect(confirmCalls).toBe(1); // deps.confirm never called for the queued (cancelled) one
    expect(approvals).toEqual([true, false]); // first (in-flight) approved, second (queued) auto-denied
  });

  test("non-interactive tool execution still runs in parallel (no serialization)", async () => {
    let active = 0;
    let maxActive = 0;
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          { type: "function", function: { name: "web_search", description: "", parameters: { type: "object", properties: {}, required: [] } } },
        ],
        chat: async () => ({
          text: "",
          promptTokens: 0,
          completionTokens: 0,
          toolCalls: [{ function: { name: "web_search", arguments: {} } }],
        }),
        ownsSkill: () => false,
        execTool: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await delay(10);
          active -= 1;
          return "result";
        },
      })
    );

    await Promise.all([
      runStep({ id: "a", goal: "step a", dependsOn: [], kind: "tool" }),
      runStep({ id: "b", goal: "step b", dependsOn: [], kind: "tool" }),
    ]);
    expect(maxActive).toBe(2);
  });
});

describe("makeWorkers: knowledge specialists", () => {
  test("summarize uses modelForKind, null tools, and specialist system prompt", async () => {
    let seenModel = "";
    let seenTools: OllamaToolDef[] | null | undefined;
    const seenMessages: ChatMessage[][] = [];
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          {
            type: "function",
            function: { name: "web_search", description: "", parameters: { type: "object", properties: {}, required: [] } },
          },
        ],
        modelForKind: (kind) => (kind === "summarize" ? "summarize-model" : "test-model"),
        chat: async (model, messages, _onChunk, tools) => {
          seenModel = model;
          seenTools = tools;
          seenMessages.push(messages as ChatMessage[]);
          return { text: "summary", promptTokens: 1, completionTokens: 1, toolCalls: [] };
        },
      })
    );
    const r = await runStep(step("summarize"));
    expect(r.ok).toBe(true);
    expect(seenModel).toBe("summarize-model");
    expect(seenTools).toBeNull();
    const systemContents = seenMessages[0].filter((m) => m.role === "system").map((m) => m.content);
    expect(systemContents).toContain(specialistPrompt("summarize"));
  });

  test("research passes filtered tool defs containing only allowlisted names", async () => {
    let seenTools: OllamaToolDef[] | null | undefined;
    const runStep = makeWorkers(
      baseDeps({
        toolDefs: [
          {
            type: "function",
            function: { name: "web_search", description: "", parameters: { type: "object", properties: {}, required: [] } },
          },
          {
            type: "function",
            function: { name: "http_fetch", description: "", parameters: { type: "object", properties: {}, required: [] } },
          },
          {
            type: "function",
            function: { name: "generate_document", description: "", parameters: { type: "object", properties: {}, required: [] } },
          },
        ],
        chat: async (_model, _messages, _onChunk, tools) => {
          seenTools = tools;
          return { text: "research done", promptTokens: 1, completionTokens: 1, toolCalls: [] };
        },
      })
    );
    await runStep(step("research"));
    expect(seenTools).not.toBeNull();
    const names = seenTools!.map((d) => d.function.name).sort();
    expect(names).toEqual(["http_fetch", "web_search"]);
  });
});

describe("makeWorkers: error handling", () => {
  test("catches thrown errors and returns ok:false", async () => {
    const runStep = makeWorkers(
      baseDeps({
        project: { id: "p1" } as Project,
        recall: async () => {
          throw new Error("chroma down");
        },
      })
    );
    const r = await runStep(step("memory"));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("chroma down");
  });
});
