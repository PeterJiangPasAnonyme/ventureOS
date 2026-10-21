import { tool } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  competitors,
  meetings,
  objectives,
  tasks,
  memories,
  metrics,
  documents,
  datasetRows,
} from "@/lib/db/schema";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { retrieveContext } from "./retrieval";
import { formatDocDate } from "@/lib/utils";
import { webSearch } from "@/lib/integrations/tavily";
import { listRecentEmails, listUpcomingEvents } from "@/lib/integrations/google";

export interface ToolContext {
  orgId: string;
  /** Google OAuth access token from the current session, if available. */
  googleAccessToken?: string;
}

export const ALL_TOOL_NAMES = [
  "retrieve_context",
  "get_metric",
  "query_dataset",
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

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

function periodKey(period: string): number {
  const q = period.match(/q([1-4])\s*(\d{4})/i);
  if (q) return Number(q[2]) * 12 + Number(q[1]) * 3;
  const m = period.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{4})/i
  );
  if (m) return Number(m[2]) * 12 + MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
  return 0;
}

/** Trailing twelve months plus the latest quarter and month for each metric. */
function snapshotRows<T extends { metric: string; period: string }>(rows: T[]): T[] {
  const byMetric = new Map<string, T[]>();
  for (const row of rows) {
    const list = byMetric.get(row.metric) ?? [];
    list.push(row);
    byMetric.set(row.metric, list);
  }
  const picked: T[] = [];
  for (const list of Array.from(byMetric.values())) {
    const ttm = list.find((r) => /twelve|ttm/i.test(r.period));
    const latest = (want: (p: string) => boolean) =>
      list.filter((r) => want(r.period)).sort((a, b) => periodKey(a.period) - periodKey(b.period)).at(-1);
    for (const row of [ttm, latest((p) => /^q[1-4]/i.test(p)), latest((p) => periodKey(p) > 0 && !/^q[1-4]/i.test(p) && !/twelve|ttm/i.test(p))]) {
      if (row && !picked.includes(row)) picked.push(row);
    }
  }
  return picked;
}

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
        "Search the company's knowledge base (notes, decks, scans, ledger, roadmap). Break the request into 1-4 short searches, one per fact or source you need, and pass them together. Every result carries its document kind and date. By default only the newest version of a versioned document (decks, competitor scans) is searched.",
      inputSchema: z.object({
        queries: z
          .array(z.string())
          .min(1)
          .max(4)
          .describe("Short, specific searches, e.g. ['October 8 supply decisions', 'school group deposit terms']"),
        include_history: z
          .boolean()
          .optional()
          .describe("Also search older versions. Set only when the request asks what an earlier deck, scan, or call said, or what changed."),
        as_of: z
          .string()
          .optional()
          .describe(
            "YYYY-MM-DD. Leave this out unless the user names a past date and asks what was known then. Search only documents dated on or before it."
          ),
      }),
      execute: async ({ queries, include_history, as_of }) => {
        let asOf = as_of ? new Date(`${as_of}T23:59:59Z`) : undefined;
        let note: string | undefined;
        if (asOf && Number.isNaN(asOf.getTime())) asOf = undefined;
        if (asOf) {
          const [{ earliest }] = await db
            .select({ earliest: sql<Date | null>`min(${documents.docDate})` })
            .from(documents)
            .where(eq(documents.orgId, ctx.orgId));
          if (!earliest || asOf < new Date(earliest)) {
            note = `as_of ${as_of} is before every document in the workspace, so it was ignored.`;
            asOf = undefined;
          }
        }
        const results = await retrieveContext(ctx.orgId, {
          queries,
          includeHistory: include_history,
          asOf,
        });
        return {
          ...(note ? { note } : {}),
          count: results.length,
          sources: results.map((r) => ({
            documentTitle: r.documentTitle,
            kind: r.docKind,
            dated: r.docDate,
            ...(r.series ? { latestInSeries: r.latestInSeries } : {}),
            source: r.source,
            similarity: Number(r.similarity.toFixed(3)),
            matchedBy: r.matchedBy,
            query: r.matchedQuery,
            excerpt: r.content.slice(0, 900),
          })),
        };
      },
    }),

    get_metric: tool({
      description:
        "Look up exact figures. Records come from the general ledger. Claims are figures stated in decks, investor calls, and competitor scans, each with its source and date. Use records for any company number you state; cite a claim only as what that file said. Leave period empty unless the user names a month or quarter.",
      inputSchema: z.object({
        metric: z.string().optional().describe("Part of the metric name, e.g. 'gross bookings', 'cash', 'subscribers', 'take rate'"),
        period: z.string().optional().describe("A named month or quarter only, e.g. 'Q4 2025' or 'Sep 2026'. Omit for trailing, current, or latest."),
        include_claims: z.boolean().optional().describe("Set true only when the user asks what a deck, call, or scan said. Defaults to false."),
      }),
      execute: async ({ metric, period, include_claims }) => {
        const namedPeriod =
          period && !/trailing|ttm|current|latest|recent|ytd|twelve|all/i.test(period)
            ? period
            : undefined;
        const snapshot = !metric && !namedPeriod;
        const headlines = [
          "gross bookings",
          "booking commission",
          "take rate (commission",
          "net revenue",
          "cash, end",
          "subscribers, end",
        ];
        const lookup = (withPeriod: boolean) => {
          const filters = [eq(metrics.orgId, ctx.orgId)];
          if (snapshot) {
            filters.push(
              or(...headlines.map((name) => ilike(metrics.metric, `%${name}%`)))!
            );
          } else if (metric) {
            filters.push(ilike(metrics.metric, `%${metric}%`));
          }
          if (withPeriod && namedPeriod) filters.push(ilike(metrics.period, `%${namedPeriod}%`));
          if (include_claims !== true) filters.push(eq(metrics.kind, "record"));
          return db
            .select({
              kind: metrics.kind,
              metric: metrics.metric,
              period: metrics.period,
              value: metrics.value,
              unit: metrics.unit,
              quote: metrics.quote,
              documentTitle: documents.title,
              docDate: documents.docDate,
              datePrecision: documents.datePrecision,
            })
            .from(metrics)
            .innerJoin(documents, eq(metrics.documentId, documents.id))
            .where(and(...filters))
            .orderBy(asc(metrics.kind), asc(metrics.metric))
            .limit(snapshot ? 200 : 60);
        };
        let rows = await lookup(true);
        let note: string | undefined;
        if (rows.length === 0 && namedPeriod) {
          rows = await lookup(false);
          if (rows.length > 0) note = `No figures for period "${namedPeriod}". Showing every period on file for this metric.`;
        }
        if (snapshot && rows.length > 0) {
          rows = snapshotRows(rows);
          note = "Ledger snapshot: trailing twelve months and the latest close. Records only. These are the company figures to state.";
        }
        const shape = (r: (typeof rows)[number]) => ({
          metric: r.metric,
          period: r.period,
          value: r.value,
          unit: r.unit,
          source: r.documentTitle,
          dated: formatDocDate(r.docDate, r.datePrecision),
          ...(r.quote ? { quote: r.quote } : {}),
        });
        const titles = Array.from(new Set(rows.map((r) => r.documentTitle)));
        return {
          ...(note ? { note } : {}),
          records: rows.filter((r) => r.kind === "record").map(shape),
          claims: rows.filter((r) => r.kind === "claim").map(shape),
          sources: titles.map((documentTitle) => ({ documentTitle })),
        };
      },
    }),

    query_dataset: tool({
      description:
        "Count, filter, or group row-level spreadsheet data (for example the users export). Values are matched case-insensitively; set normalize to also ignore spaces, hyphens, and suffixes like 'pass' so 'Epic', 'EPIC', and 'epic' group together.",
      inputSchema: z.object({
        dataset: z.string().optional().describe("Part of the document title; defaults to every dataset"),
        filters: z
          .array(
            z.object({
              column: z.string(),
              equals: z.string().optional(),
              contains: z.string().optional(),
              is_blank: z.boolean().optional(),
            })
          )
          .optional(),
        group_by: z.string().optional(),
        count_distinct: z.string().optional().describe("Column to count distinct values of, e.g. user_id for duplicates"),
        sum: z.string().optional().describe("Numeric column to total"),
        normalize: z.boolean().optional(),
      }),
      execute: async ({ dataset, filters, group_by, count_distinct, sum, normalize }) => {
        const docFilters = [eq(documents.orgId, ctx.orgId), eq(documents.docKind, "dataset")];
        if (dataset) docFilters.push(ilike(documents.title, `%${dataset}%`));
        const docs = await db
          .select({ id: documents.id, title: documents.title })
          .from(documents)
          .where(and(...docFilters));
        if (!docs.length) return { matched: 0, note: "No dataset found", sources: [] };
        const rows = await db
          .select({ data: datasetRows.data })
          .from(datasetRows)
          .where(inArray(datasetRows.documentId, docs.map((d) => d.id)));

        const canon = (v: unknown) => {
          const s = v === null || v === undefined ? "" : String(v).trim().toLowerCase();
          return normalize ? s.replace(/[\s\-_]+/g, " ").replace(/\s+pass$/, "").trim() : s;
        };
        const matched = rows
          .map((r) => r.data)
          .filter((row) =>
            (filters ?? []).every((f) => {
              const v = canon(row[f.column]);
              if (f.is_blank !== undefined) return f.is_blank ? v === "" : v !== "";
              if (f.equals !== undefined) return v === canon(f.equals);
              if (f.contains !== undefined) return v.includes(canon(f.contains));
              return true;
            })
          );
        const columns = rows.length ? Object.keys(rows[0].data) : [];
        const out: Record<string, unknown> = {
          dataset: docs.map((d) => d.title),
          columns,
          totalRows: rows.length,
          matched: matched.length,
          sources: docs.map((d) => ({ documentTitle: d.title })),
        };
        if (count_distinct) out.distinct = new Set(matched.map((r) => canon(r[count_distinct]))).size;
        if (sum) out.sum = matched.reduce((s, r) => s + (Number(r[sum]) || 0), 0);
        if (group_by) {
          const groups = new Map<string, number>();
          for (const r of matched) {
            const key = canon(r[group_by]) || "(blank)";
            groups.set(key, (groups.get(key) ?? 0) + 1);
          }
          out.groups = Object.fromEntries(Array.from(groups.entries()).sort((a, b) => b[1] - a[1]));
        }
        if (!group_by && !count_distinct && !sum) out.sample = matched.slice(0, 5);
        return out;
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
