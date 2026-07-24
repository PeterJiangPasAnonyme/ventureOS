import { tool } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  competitors,
  meetings,
  objectives,
  tasks,
  memories,
} from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { retrieveContext } from "./retrieval";
import { webSearch } from "@/lib/integrations/tavily";
import { listRecentEmails, listUpcomingEvents } from "@/lib/integrations/google";

export interface ToolContext {
  orgId: string;
  /** Google OAuth access token from the current session, if available. */
  googleAccessToken?: string;
}

export const ALL_TOOL_NAMES = [
  "retrieve_context",
  "web_search",
  "list_competitors",
  "list_meetings",
  "read_calendar",
  "read_email",
  "list_objectives",
  "list_tasks",
  "create_task",
  "save_memory",
] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];

/**
 * Builds the tool set available to an agent run, filtered to `allowed`.
 * Every tool is org-scoped and returns plain JSON so the orchestrator can
 * render it in the transparent Agent Trace panel.
 */
export function buildTools(ctx: ToolContext, allowed: readonly string[]) {
  const db = getDb();

  const registry = {
    retrieve_context: tool({
      description:
        "Semantic search over the company's knowledge base (docs, notes, meetings). Use this first to ground answers in company context.",
      inputSchema: z.object({
        query: z.string().describe("What to look up in company context"),
        k: z.number().int().min(1).max(12).optional(),
      }),
      execute: async ({ query, k }) => {
        const results = await retrieveContext(ctx.orgId, query, k ?? 6);
        return {
          count: results.length,
          sources: results.map((r) => ({
            documentTitle: r.documentTitle,
            source: r.source,
            similarity: Number(r.similarity.toFixed(3)),
            excerpt: r.content.slice(0, 600),
          })),
        };
      },
    }),

    web_search: tool({
      description:
        "Search the public web for external research (competitors, market trends, news).",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const { results, configured } = await webSearch(query);
        return { configured, results };
      },
    }),

    list_competitors: tool({
      description: "List tracked competitors with positioning and notes.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(competitors)
          .where(eq(competitors.orgId, ctx.orgId));
        return { competitors: rows };
      },
    }),

    list_meetings: tool({
      description:
        "List recent and upcoming meetings with their summaries and decisions.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      execute: async ({ limit }) => {
        const rows = await db
          .select()
          .from(meetings)
          .where(eq(meetings.orgId, ctx.orgId))
          .orderBy(desc(meetings.startsAt))
          .limit(limit ?? 8);
        return { meetings: rows };
      },
    }),

    read_calendar: tool({
      description:
        "Read upcoming calendar events. Uses connected Google Calendar when available.",
      inputSchema: z.object({}),
      execute: async () => {
        if (ctx.googleAccessToken) {
          try {
            const events = await listUpcomingEvents(ctx.googleAccessToken);
            return { source: "google_calendar", events };
          } catch (err) {
            console.error("read_calendar google failed:", err);
          }
        }
        // Fallback to meetings stored in the workspace.
        const rows = await db
          .select()
          .from(meetings)
          .where(eq(meetings.orgId, ctx.orgId))
          .orderBy(desc(meetings.startsAt))
          .limit(8);
        return {
          source: "workspace",
          note: "Google Calendar not connected; using scheduled meetings from the workspace.",
          events: rows.map((m) => ({
            id: m.id,
            title: m.title,
            start: m.startsAt,
            attendees: m.attendees,
          })),
        };
      },
    }),

    read_email: tool({
      description:
        "Read recent emails from the connected Gmail inbox to surface follow-ups.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      execute: async ({ limit }) => {
        if (ctx.googleAccessToken) {
          try {
            const emails = await listRecentEmails(
              ctx.googleAccessToken,
              limit ?? 8
            );
            return { source: "gmail", emails };
          } catch (err) {
            console.error("read_email google failed:", err);
          }
        }
        return {
          source: "demo",
          note: "Gmail not connected. Connect Google in Integrations to read the live inbox.",
          emails: [],
        };
      },
    }),

    list_objectives: tool({
      description: "List company priorities / OKRs with progress.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(objectives)
          .where(eq(objectives.orgId, ctx.orgId));
        return { objectives: rows };
      },
    }),

    list_tasks: tool({
      description: "List tasks, optionally filtered by status.",
      inputSchema: z.object({
        status: z
          .enum(["todo", "in_progress", "blocked", "done"])
          .optional(),
      }),
      execute: async ({ status }) => {
        const where = status
          ? and(eq(tasks.orgId, ctx.orgId), eq(tasks.status, status))
          : eq(tasks.orgId, ctx.orgId);
        const rows = await db
          .select()
          .from(tasks)
          .where(where)
          .orderBy(desc(tasks.createdAt))
          .limit(50);
        return { tasks: rows };
      },
    }),

    create_task: tool({
      description:
        "Create a task/action item. Use for follow-ups and action items surfaced from meetings or email.",
      inputSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        owner: z.string().optional(),
        dueDate: z
          .string()
          .describe("ISO date string, optional")
          .optional(),
      }),
      execute: async ({ title, description, priority, owner, dueDate }) => {
        const [row] = await db
          .insert(tasks)
          .values({
            orgId: ctx.orgId,
            title,
            description,
            priority: priority ?? "medium",
            owner,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            source: "agent",
          })
          .returning();
        return { created: row };
      },
    }),

    save_memory: tool({
      description:
        "Persist an important fact, decision, or follow-up to shared org memory so future agent runs remember it.",
      inputSchema: z.object({
        content: z.string(),
        type: z
          .enum(["fact", "follow_up", "decision", "preference"])
          .optional(),
      }),
      execute: async ({ content, type }) => {
        const [row] = await db
          .insert(memories)
          .values({
            orgId: ctx.orgId,
            content,
            type: type ?? "fact",
            sourceRef: "agent",
          })
          .returning();
        return { saved: row };
      },
    }),
  };

  const filtered: Partial<typeof registry> = {};
  for (const name of allowed) {
    if (name in registry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (filtered as any)[name] = (registry as any)[name];
    }
  }
  return filtered as typeof registry;
}
