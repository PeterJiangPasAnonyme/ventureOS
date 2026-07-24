import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  vector,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const copilotTypeEnum = pgEnum("copilot_type", [
  "competitive_analysis",
  "investor_prep",
  "meeting_synthesis",
  "task_management",
  "general",
]);

export const agentStepTypeEnum = pgEnum("agent_step_type", [
  "plan",
  "retrieval",
  "tool_call",
  "observation",
  "final",
  "error",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "running",
  "completed",
  "failed",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "blocked",
  "done",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const documentSourceEnum = pgEnum("document_source", [
  "upload",
  "email",
  "calendar",
  "web",
  "note",
  "meeting",
]);

export const memoryTypeEnum = pgEnum("memory_type", [
  "fact",
  "follow_up",
  "decision",
  "preference",
]);

/* ------------------------------------------------------------------ */
/* Core tenancy                                                        */
/* ------------------------------------------------------------------ */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  oneLiner: text("one_liner"),
  description: text("description"),
  stage: text("stage"),
  industry: text("industry"),
  website: text("website"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("memberships_org_idx").on(t.orgId),
    userIdx: index("memberships_user_idx").on(t.userId),
  })
);

/* ------------------------------------------------------------------ */
/* Knowledge base                                                      */
/* ------------------------------------------------------------------ */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    source: documentSourceEnum("source").notNull().default("upload"),
    mimeType: text("mime_type"),
    url: text("url"),
    content: text("content").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("documents_org_idx").on(t.orgId),
  })
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull().default(0),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("chunks_org_idx").on(t.orgId),
    docIdx: index("chunks_document_idx").on(t.documentId),
    embeddingIdx: index("chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
  })
);

/* ------------------------------------------------------------------ */
/* Market / competitive intelligence                                   */
/* ------------------------------------------------------------------ */

export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    positioning: text("positioning"),
    strengths: text("strengths"),
    weaknesses: text("weaknesses"),
    pricing: text("pricing"),
    fundingStage: text("funding_stage"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("competitors_org_idx").on(t.orgId),
  })
);

export const marketNotes = pgTable("market_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category"),
  body: text("body").notNull(),
  source: text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Priorities / OKRs                                                   */
/* ------------------------------------------------------------------ */

export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    quarter: text("quarter"),
    progress: integer("progress").notNull().default(0),
    status: text("status").notNull().default("on_track"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("objectives_org_idx").on(t.orgId),
  })
);

/* ------------------------------------------------------------------ */
/* Meetings                                                            */
/* ------------------------------------------------------------------ */

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    attendees: text("attendees"),
    startsAt: timestamp("starts_at"),
    transcript: text("transcript"),
    summary: text("summary"),
    decisions: jsonb("decisions").$type<string[]>(),
    externalId: text("external_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("meetings_org_idx").on(t.orgId),
  })
);

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    owner: text("owner"),
    dueDate: timestamp("due_date"),
    source: text("source").default("manual"),
    sourceRef: uuid("source_ref"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("tasks_org_idx").on(t.orgId),
  })
);

/* ------------------------------------------------------------------ */
/* Shared memory                                                       */
/* ------------------------------------------------------------------ */

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: memoryTypeEnum("type").notNull().default("fact"),
    content: text("content").notNull(),
    sourceRef: text("source_ref"),
    resolved: integer("resolved").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("memories_org_idx").on(t.orgId),
  })
);

/* ------------------------------------------------------------------ */
/* Integrations                                                        */
/* ------------------------------------------------------------------ */

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accountEmail: text("account_email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scopes: text("scopes"),
  status: text("status").notNull().default("disconnected"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Agent runs + steps (transparent intermediate outputs)               */
/* ------------------------------------------------------------------ */

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    copilotType: copilotTypeEnum("copilot_type").notNull().default("general"),
    input: text("input").notNull(),
    brief: text("brief"),
    status: agentRunStatusEnum("status").notNull().default("running"),
    triggeredBy: text("triggered_by").default("user"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    orgIdx: index("agent_runs_org_idx").on(t.orgId),
  })
);

export const agentSteps = pgTable(
  "agent_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    type: agentStepTypeEnum("type").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("agent_steps_run_idx").on(t.runId),
  })
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const agentRunsRelations = relations(agentRuns, ({ many }) => ({
  steps: many(agentSteps),
}));

export const agentStepsRelations = relations(agentSteps, ({ one }) => ({
  run: one(agentRuns, {
    fields: [agentSteps.runId],
    references: [agentRuns.id],
  }),
}));

export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, {
    fields: [chunks.documentId],
    references: [documents.id],
  }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type Organization = typeof organizations.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type MarketNote = typeof marketNotes.$inferSelect;
export type Objective = typeof objectives.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentStep = typeof agentSteps.$inferSelect;

export type CopilotType = (typeof copilotTypeEnum.enumValues)[number];
export type AgentStepType = (typeof agentStepTypeEnum.enumValues)[number];
