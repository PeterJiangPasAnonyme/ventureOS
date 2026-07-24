import { generateText, streamText, stepCountIs } from "ai";
import { getDb } from "@/lib/db";
import { agentRuns, agentSteps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AgentStepType, CopilotType, Organization } from "@/lib/db/schema";
import { chatModel, hasOpenAI } from "./provider";
import { buildTools } from "./tools";
import { systemPromptFor } from "./prompts";
import { copilotByType } from "@/lib/constants";
import { retrieveContext } from "./retrieval";

export interface RunAgentArgs {
  org: Organization;
  copilotType: CopilotType;
  input: string;
  googleAccessToken?: string;
  triggeredBy?: string;
}

export type AgentEvent =
  | { type: "run"; runId: string }
  | {
      type: "step";
      step: {
        order: number;
        type: AgentStepType;
        title: string;
        payload?: Record<string, unknown>;
      };
    }
  | { type: "token"; text: string }
  | { type: "final"; runId: string; brief: string }
  | { type: "error"; message: string };

const MAX_STEPS = 6;

async function persistStep(
  runId: string,
  order: number,
  type: AgentStepType,
  title: string,
  payload?: Record<string, unknown>
) {
  const db = getDb();
  await db.insert(agentSteps).values({ runId, order, type, title, payload });
}

/**
 * The heart of VentureOS: a multi-step agent loop.
 * plan -> retrieve context -> invoke tools -> synthesize a brief, emitting every
 * intermediate step as an AgentEvent (persisted + streamed to the UI trace).
 */
export async function* runAgent(args: RunAgentArgs): AsyncGenerator<AgentEvent> {
  const db = getDb();
  const meta = copilotByType(args.copilotType);
  const allowedTools = meta?.tools ?? ["retrieve_context"];

  const [run] = await db
    .insert(agentRuns)
    .values({
      orgId: args.org.id,
      copilotType: args.copilotType,
      input: args.input,
      status: "running",
      triggeredBy: args.triggeredBy ?? "user",
    })
    .returning();

  yield { type: "run", runId: run.id };

  let order = 0;
  let brief = "";

  try {
    if (hasOpenAI()) {
      brief = yield* realRun(args, run.id, allowedTools, () => order++);
    } else {
      brief = yield* mockRun(args, run.id, allowedTools, () => order++);
    }

    await db
      .update(agentRuns)
      .set({ status: "completed", brief, completedAt: new Date() })
      .where(eq(agentRuns.id, run.id));

    yield { type: "final", runId: run.id, brief };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await persistStep(run.id, order++, "error", "Run failed", { message });
    await db
      .update(agentRuns)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
    yield { type: "error", message };
  }
}

/* ---------------- Real LLM path (Vercel AI SDK, tool calling) ------------- */

async function* realRun(
  args: RunAgentArgs,
  runId: string,
  allowedTools: string[],
  nextOrder: () => number
): AsyncGenerator<AgentEvent, string> {
  const system = systemPromptFor(args.copilotType, args.org);
  const tools = buildTools(
    { orgId: args.org.id, googleAccessToken: args.googleAccessToken },
    allowedTools
  );

  // 1) Explicit planning step for a transparent trace.
  const planRes = await generateText({
    model: chatModel(),
    system:
      "You are a planning module. Given a founder request, output 2-5 short numbered steps describing how you'll answer using the available tools. Steps only, no preamble.",
    prompt: `Available tools: ${allowedTools.join(", ")}\n\nRequest: ${args.input}`,
  });
  const planText = planRes.text.trim();
  {
    const step = {
      order: nextOrder(),
      type: "plan" as const,
      title: "Decomposed the request",
      payload: { plan: planText },
    };
    await persistStep(runId, step.order, step.type, step.title, step.payload);
    yield { type: "step", step };
  }

  // 2) Main tool-calling loop with streaming synthesis.
  const result = streamText({
    model: chatModel(),
    system,
    prompt: args.input,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
  });

  let brief = "";
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "tool-call": {
        const step = {
          order: nextOrder(),
          type: (part.toolName === "retrieve_context"
            ? "retrieval"
            : "tool_call") as AgentStepType,
          title: `Called ${part.toolName}`,
          payload: { tool: part.toolName, args: part.input },
        };
        await persistStep(
          runId,
          step.order,
          step.type,
          step.title,
          step.payload
        );
        yield { type: "step", step };
        break;
      }
      case "tool-result": {
        const step = {
          order: nextOrder(),
          type: "observation" as const,
          title: `Result from ${part.toolName}`,
          payload: { tool: part.toolName, result: part.output },
        };
        await persistStep(
          runId,
          step.order,
          step.type,
          step.title,
          step.payload
        );
        yield { type: "step", step };
        break;
      }
      case "text-delta": {
        brief += part.text;
        yield { type: "token", text: part.text };
        break;
      }
      case "tool-error": {
        const err = (part as { error?: unknown }).error;
        throw err instanceof Error ? err : new Error(String(err));
      }
      default:
        break;
    }
  }

  const finalStep = {
    order: nextOrder(),
    type: "final" as const,
    title: "Synthesized brief",
    payload: { chars: brief.length },
  };
  await persistStep(
    runId,
    finalStep.order,
    finalStep.type,
    finalStep.title,
    finalStep.payload
  );
  yield { type: "step", step: finalStep };

  return brief.trim();
}

/* ---------------- Offline mock path (no OPENAI_API_KEY) ------------------- */

async function* mockRun(
  args: RunAgentArgs,
  runId: string,
  allowedTools: string[],
  nextOrder: () => number
): AsyncGenerator<AgentEvent, string> {
  const meta = copilotByType(args.copilotType);

  // Plan
  const plan = [
    "1. Interpret the request and identify what company context is needed",
    "2. Retrieve relevant knowledge from the workspace",
    `3. Use ${meta?.name ?? "copilot"} tools to gather supporting data`,
    "4. Synthesize a structured brief with next steps",
  ].join("\n");
  {
    const step = {
      order: nextOrder(),
      type: "plan" as const,
      title: "Decomposed the request",
      payload: { plan },
    };
    await persistStep(runId, step.order, step.type, step.title, step.payload);
    yield { type: "step", step };
  }

  // Retrieval (real, works offline via fallback embeddings)
  const retrieved = await retrieveContext(args.org.id, args.input, 6);
  {
    const step = {
      order: nextOrder(),
      type: "retrieval" as const,
      title: "Retrieved company context",
      payload: {
        tool: "retrieve_context",
        result: {
          count: retrieved.length,
          sources: retrieved.map((r) => ({
            documentTitle: r.documentTitle,
            source: r.source,
            similarity: Number(r.similarity.toFixed(3)),
            excerpt: r.content.slice(0, 300),
          })),
        },
      },
    };
    await persistStep(runId, step.order, step.type, step.title, step.payload);
    yield { type: "step", step };
  }

  // One representative tool call for this copilot
  const extraTool = allowedTools.find((t) => t !== "retrieve_context");
  if (extraTool) {
    const tools = buildTools({ orgId: args.org.id }, [extraTool]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (tools as any)[extraTool];
    if (t?.execute) {
      let result: unknown = null;
      try {
        result = await t.execute(
          extraTool === "web_search" ? { query: args.input } : {},
          { toolCallId: "mock", messages: [] }
        );
      } catch {
        result = { note: "tool unavailable in demo" };
      }
      const step = {
        order: nextOrder(),
        type: "tool_call" as const,
        title: `Called ${extraTool}`,
        payload: { tool: extraTool, result },
      };
      await persistStep(runId, step.order, step.type, step.title, step.payload);
      yield { type: "step", step };
    }
  }

  // Synthesize a deterministic brief from retrieved context
  const brief = buildMockBrief(args, retrieved);
  const finalStep = {
    order: nextOrder(),
    type: "final" as const,
    title: "Synthesized brief",
    payload: { mock: true },
  };
  await persistStep(
    runId,
    finalStep.order,
    finalStep.type,
    finalStep.title,
    finalStep.payload
  );
  yield { type: "step", step: finalStep };

  // Stream the brief out as tokens for a realistic feel
  for (const tokenChunk of brief.match(/\S+\s*/g) ?? [brief]) {
    yield { type: "token", text: tokenChunk };
  }

  return brief;
}

function buildMockBrief(
  args: RunAgentArgs,
  retrieved: { documentTitle: string; content: string }[]
): string {
  const meta = copilotByType(args.copilotType);
  const sources =
    retrieved.length > 0
      ? retrieved
          .slice(0, 4)
          .map((r) => `- ${r.documentTitle}: ${r.content.slice(0, 140).trim()}…`)
          .join("\n")
      : "- (No indexed context found yet — upload documents in Knowledge.)";

  return [
    `## ${meta?.name ?? "Brief"} — response`,
    "",
    `> Demo mode (no OPENAI_API_KEY set). This brief is assembled deterministically from your workspace context. Add an OpenAI key to enable full LLM reasoning.`,
    "",
    `**Request:** ${args.input}`,
    "",
    `**Grounded in ${retrieved.length} source${retrieved.length === 1 ? "" : "s"} from your knowledge base:**`,
    sources,
    "",
    "**Suggested next steps:**",
    "1. Review the cited sources in the Agent Trace panel.",
    "2. Connect integrations (Gmail, Calendar, Tavily) for richer, live context.",
    "3. Add an OpenAI API key to unlock full multi-step reasoning and synthesis.",
  ].join("\n");
}

/* ---------------- Non-streaming helper (used by Inngest jobs) ------------- */

export async function runAgentToCompletion(
  args: RunAgentArgs
): Promise<{ runId: string; brief: string }> {
  let runId = "";
  let brief = "";
  for await (const ev of runAgent(args)) {
    if (ev.type === "run") runId = ev.runId;
    if (ev.type === "final") brief = ev.brief;
  }
  return { runId, brief };
}
