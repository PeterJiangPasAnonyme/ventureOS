import { getDb } from "@/lib/db";
import {
  agentRuns,
  agentSteps,
  competitors,
  documents,
  integrations,
  marketNotes,
  meetings,
  memories,
  objectives,
  tasks,
} from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export async function getObjectives(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(objectives)
    .where(eq(objectives.orgId, orgId))
    .orderBy(desc(objectives.createdAt));
}

export async function getMeetings(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(meetings)
    .where(eq(meetings.orgId, orgId))
    .orderBy(desc(meetings.startsAt));
}

export async function getTasks(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.orgId, orgId))
    .orderBy(desc(tasks.createdAt));
}

export async function getDocuments(orgId: string) {
  const db = getDb();
  return db
    .select({
      id: documents.id,
      title: documents.title,
      source: documents.source,
      mimeType: documents.mimeType,
      createdAt: documents.createdAt,
      chunkCount: sql<number>`(select count(*) from chunks where chunks.document_id = ${documents.id})`,
    })
    .from(documents)
    .where(eq(documents.orgId, orgId))
    .orderBy(desc(documents.createdAt));
}

export async function getCompetitors(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(competitors)
    .where(eq(competitors.orgId, orgId))
    .orderBy(desc(competitors.updatedAt));
}

export async function getMarketNotes(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(marketNotes)
    .where(eq(marketNotes.orgId, orgId))
    .orderBy(desc(marketNotes.createdAt));
}

export async function getMemories(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(memories)
    .where(eq(memories.orgId, orgId))
    .orderBy(desc(memories.createdAt));
}

export async function getIntegrations(orgId: string) {
  const db = getDb();
  return db
    .select()
    .from(integrations)
    .where(eq(integrations.orgId, orgId));
}

export async function getRecentRuns(orgId: string, limit = 8) {
  const db = getDb();
  return db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.orgId, orgId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);
}

export async function getRunWithSteps(orgId: string, runId: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.orgId, orgId)))
    .limit(1);
  if (!run) return null;
  const steps = await db
    .select()
    .from(agentSteps)
    .where(eq(agentSteps.runId, runId))
    .orderBy(agentSteps.order);
  return { run, steps };
}

export interface DashboardData {
  objectives: Awaited<ReturnType<typeof getObjectives>>;
  upcomingMeetings: Awaited<ReturnType<typeof getMeetings>>;
  followUps: Awaited<ReturnType<typeof getMemories>>;
  recentRuns: Awaited<ReturnType<typeof getRecentRuns>>;
  taskCounts: { todo: number; in_progress: number; blocked: number; done: number };
  docCount: number;
}

export async function getDashboardData(orgId: string): Promise<DashboardData> {
  const db = getDb();
  const [obj, allMeetings, mems, recentRuns, allTasks, docs] = await Promise.all(
    [
      getObjectives(orgId),
      getMeetings(orgId),
      getMemories(orgId),
      getRecentRuns(orgId, 6),
      getTasks(orgId),
      db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(eq(documents.orgId, orgId)),
    ]
  );

  const now = Date.now();
  const upcomingMeetings = allMeetings
    .filter((m) => m.startsAt && new Date(m.startsAt).getTime() >= now - 864e5)
    .slice(0, 5);

  const followUps = mems
    .filter((m) => m.type === "follow_up" && m.resolved === 0)
    .slice(0, 6);

  const taskCounts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const t of allTasks) {
    taskCounts[t.status] = (taskCounts[t.status] ?? 0) + 1;
  }

  return {
    objectives: obj,
    upcomingMeetings,
    followUps,
    recentRuns,
    taskCounts,
    docCount: Number(docs[0]?.count ?? 0),
  };
}
