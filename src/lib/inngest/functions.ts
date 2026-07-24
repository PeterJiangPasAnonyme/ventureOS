import { inngest, type AgentRunRequested } from "./client";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runAgentToCompletion } from "@/lib/ai/orchestrator";

/**
 * Durable, event-triggered agent run. Lets any part of the app (or an external
 * system) kick off a background copilot run that persists its trace + brief.
 */
export const runAgentJob = inngest.createFunction(
  {
    id: "run-agent-job",
    name: "Run agent (background)",
    triggers: [{ event: "agent/run.requested" }],
  },
  async ({ event, step }) => {
    const data = event.data as AgentRunRequested;

    // Load the org and run the agent within a single durable step so DB Date
    // fields never cross the JSON step boundary.
    const result = await step.run("load-and-run", async () => {
      const db = getDb();
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, data.orgId))
        .limit(1);
      if (!org) throw new Error(`Org ${data.orgId} not found`);
      return runAgentToCompletion({
        org,
        copilotType: data.copilotType,
        input: data.input,
        triggeredBy: data.triggeredBy ?? "inngest",
      });
    });

    return { runId: result.runId, briefLength: result.brief.length };
  }
);

/**
 * Recurring operational workflow: every weekday morning, run the Executive
 * Task Management copilot for each org to surface follow-ups into memory/tasks.
 */
export const dailyFollowupSweep = inngest.createFunction(
  {
    id: "daily-followup-sweep",
    name: "Daily follow-up sweep",
    triggers: [{ cron: "0 13 * * 1-5" }], // 13:00 UTC on weekdays
  },
  async ({ step }) => {
    const orgIds = await step.run("list-orgs", async () => {
      const db = getDb();
      const rows = await db
        .select({ id: organizations.id })
        .from(organizations);
      return rows.map((r) => r.id);
    });

    for (const orgId of orgIds) {
      await step.run(`sweep-${orgId}`, async () => {
        const db = getDb();
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, orgId))
          .limit(1);
        if (!org) return { skipped: true };
        const res = await runAgentToCompletion({
          org,
          copilotType: "task_management",
          input:
            "Review our objectives, open tasks, and recent activity. Surface follow-ups I owe, flag anything slipping or blocked, and create tasks for new action items. Save key follow-ups to memory.",
          triggeredBy: "cron:daily-followup",
        });
        return { runId: res.runId };
      });
    }

    return { orgsProcessed: orgIds.length };
  }
);

export const functions = [runAgentJob, dailyFollowupSweep];
