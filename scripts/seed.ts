/**
 * Seeds the demo workspace: a fictional startup "Northwind AI" with a full
 * knowledge base, competitors, objectives, meetings, tasks, and memory.
 *
 * Run with: npm run db:seed
 * Uses relative imports so it runs under tsx without path-alias config.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { embedTexts } from "../src/lib/ai/embeddings";

const {
  organizations,
  documents,
  chunks,
  competitors,
  marketNotes,
  objectives,
  meetings,
  tasks,
  memories,
} = schema;

const CHUNK_SIZE = 1200;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const paras = clean.split(/\n\n+/);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > CHUNK_SIZE && cur) {
      out.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

const DOCS: { title: string; content: string }[] = [
  {
    title: "Company Overview — Northwind AI",
    content: `Northwind AI is building an AI analyst that turns raw product and revenue data into decisions for early-stage B2B SaaS teams.

Mission: give every founder a data team on day one.

Product: Users connect their warehouse (Postgres, Snowflake, BigQuery) and Northwind's agents proactively surface insights — churn risks, expansion opportunities, funnel drop-offs — and draft the exact next actions. Unlike dashboards, Northwind is proactive: it monitors metrics and pings founders in Slack when something needs attention.

Stage: Seed. Founded 2025. Team of 6 (2 founders, 3 engineers, 1 design). Based in Chicago.

Business model: $500-$2,000/mo per company, tiered by data volume and seats.`,
  },
  {
    title: "Traction & Metrics — Q2 2026",
    content: `Northwind AI Q2 2026 metrics.

- MRR: $42,000 (up from $18,000 in Q1 — 133% QoQ growth)
- Paying customers: 47 (from 22 in Q1)
- Net revenue retention: 118%
- Logo churn: 2.1% monthly
- CAC: $1,900; payback period: ~4 months
- Weekly active teams: 39 of 47 (83%)
- Pipeline: $210k in qualified opportunities

Key wins: closed two design partners into paid ($1.5k/mo each). Shipped the Slack proactive-alerts feature which drove WAU from 61% to 83%.

Burn: $95k/mo. Runway: 14 months. Raising a $3M seed to extend to 24 months and scale go-to-market.`,
  },
  {
    title: "Fundraising Memo — Seed Round",
    content: `Northwind AI is raising a $3M seed round at a $15M post-money cap.

Use of funds: 60% engineering (agent quality, more warehouse connectors), 25% go-to-market (first two AEs), 15% G&A/runway.

Why now: We have found early product-market fit signals — 118% NRR, 83% WAU, and inbound from PLG. The proactive-alerts wedge differentiates us from passive dashboards (Metabase, Looker) and generic AI-analytics (competitors below).

The ask: lead check of $1.5-2M. We are targeting a close by end of Q3 2026. Target investors: seed funds with strong B2B SaaS and data infra portfolios.

Risks & mitigations: (1) Incumbent BI tools add AI — we win on proactivity and founder-centric workflows. (2) Data security concerns — SOC 2 Type I in progress, read-only warehouse access.`,
  },
  {
    title: "Market Analysis — AI Analytics for SaaS",
    content: `The market for analytics tooling is large and shifting from dashboards to autonomous analysis.

TAM: $30B+ analytics/BI market. SAM: early-stage and mid-market B2B SaaS teams (~120k companies globally) who lack dedicated data teams.

Trend: LLM agents are collapsing the gap between "data" and "decision." Buyers increasingly want answers and actions, not charts. Founders are the initial buyer at seed/Series A before a data hire.

Wedge: proactive monitoring + recommended actions delivered where founders already work (Slack). This creates a daily-active habit that dashboards never achieve.`,
  },
  {
    title: "Product Roadmap — H2 2026",
    content: `Northwind AI roadmap for the second half of 2026.

Q3:
- Snowflake + BigQuery connectors (currently Postgres-only)
- Multi-metric anomaly detection with root-cause hypotheses
- Investor-update auto-draft from metrics

Q4:
- Expansion-opportunity scoring per account
- Role-based views (founder, growth, finance)
- SOC 2 Type II kickoff

North star metric: weekly actions taken on Northwind recommendations.`,
  },
];

const COMPETITORS = [
  {
    name: "Metabase",
    website: "https://metabase.com",
    positioning: "Open-source BI dashboards",
    strengths: "Free tier, huge adoption, flexible SQL",
    weaknesses: "Passive dashboards, no proactive insights or actions",
    pricing: "Free / $85+ per month hosted",
    fundingStage: "Series B",
  },
  {
    name: "Hex",
    website: "https://hex.tech",
    positioning: "Collaborative notebooks + AI for data teams",
    strengths: "Powerful for analysts, strong AI notebook features",
    weaknesses: "Built for data teams, not founders; steep for non-technical users",
    pricing: "$24+ per seat per month",
    fundingStage: "Series B",
  },
  {
    name: "Pigment/Generic AI-analytics startup",
    website: "https://example.com",
    positioning: "AI chat over your data",
    strengths: "Natural-language querying",
    weaknesses: "Reactive chat only; no monitoring or recommended actions",
    pricing: "Undisclosed",
    fundingStage: "Seed",
  },
];

const MARKET_NOTES = [
  {
    title: "Buyers want actions, not charts",
    category: "Trend",
    body: "Interviews with 20 seed-stage founders: 17 said they rarely open BI dashboards but would pay for something that tells them what changed and what to do.",
    source: "Customer discovery",
  },
  {
    title: "Incumbents adding AI copilots",
    category: "Threat",
    body: "Looker and Power BI shipping AI Q&A. Our defensibility is the proactive Slack habit + founder-specific workflows, not just NL querying.",
    source: "Competitive scan",
  },
];

const OBJECTIVES = [
  {
    title: "Close $3M seed round",
    description: "Lead + fill the round at $15M cap by end of Q3.",
    quarter: "Q3 2026",
    progress: 45,
    status: "on_track",
  },
  {
    title: "Reach $75k MRR",
    description: "Scale from $42k via PLG + first AE.",
    quarter: "Q3 2026",
    progress: 56,
    status: "on_track",
  },
  {
    title: "Ship Snowflake + BigQuery connectors",
    description: "Unlock mid-market deals blocked on warehouse support.",
    quarter: "Q3 2026",
    progress: 30,
    status: "at_risk",
  },
];

async function main() {
  console.log("Seeding VentureOS demo workspace…");

  // Ensure pgvector is available (no-op if already enabled).
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  // Reset existing demo org (cascades to child rows)
  await db.delete(organizations).where(eq(organizations.slug, "ventureos"));

  const [org] = await db
    .insert(organizations)
    .values({
      name: "Northwind AI",
      slug: "ventureos",
      oneLiner: "An AI analyst that turns product & revenue data into decisions.",
      description:
        "Northwind AI proactively monitors an early-stage SaaS team's metrics and recommends the next action — delivered in Slack.",
      stage: "Seed",
      industry: "B2B SaaS / Data & AI",
      website: "https://northwind.ai",
    })
    .returning();
  console.log("  • org:", org.name);

  // Documents + chunks + embeddings
  for (const d of DOCS) {
    const [doc] = await db
      .insert(documents)
      .values({
        orgId: org.id,
        title: d.title,
        content: d.content,
        source: "upload",
        mimeType: "text/markdown",
      })
      .returning();
    const pieces = chunkText(d.content);
    const embeddings = await embedTexts(pieces);
    await db.insert(chunks).values(
      pieces.map((content, i) => ({
        orgId: org.id,
        documentId: doc.id,
        chunkIndex: i,
        content,
        embedding: embeddings[i],
      }))
    );
    console.log(`  • document: ${d.title} (${pieces.length} chunks)`);
  }

  await db
    .insert(competitors)
    .values(COMPETITORS.map((c) => ({ ...c, orgId: org.id })));
  console.log(`  • ${COMPETITORS.length} competitors`);

  await db
    .insert(marketNotes)
    .values(MARKET_NOTES.map((m) => ({ ...m, orgId: org.id })));
  console.log(`  • ${MARKET_NOTES.length} market notes`);

  await db
    .insert(objectives)
    .values(OBJECTIVES.map((o) => ({ ...o, orgId: org.id })));
  console.log(`  • ${OBJECTIVES.length} objectives`);

  const day = 86400000;
  await db.insert(meetings).values([
    {
      orgId: org.id,
      title: "Product sync — proactive alerts v2",
      attendees: "Founders + eng",
      startsAt: new Date(Date.now() - 2 * day),
      transcript:
        "Discussed rollout of anomaly detection. Agreed to prioritize root-cause hypotheses over more alert types. Debated Slack vs email delivery — Slack wins for now. Action: define anomaly thresholds; action: draft docs; open question: how to handle noisy metrics.",
      summary:
        "Team aligned on shipping root-cause hypotheses next, delivered via Slack. Thresholds and docs to follow.",
      decisions: [
        "Prioritize root-cause hypotheses over new alert types",
        "Deliver alerts via Slack, not email, for v2",
      ],
    },
    {
      orgId: org.id,
      title: "Sequoia partner meeting",
      attendees: "CEO, Partner @ Sequoia",
      startsAt: new Date(Date.now() + 3 * day),
      summary: "Upcoming: seed pitch. Prepare metrics, narrative, and Q&A.",
    },
    {
      orgId: org.id,
      title: "Weekly go-to-market review",
      attendees: "CEO, Growth",
      startsAt: new Date(Date.now() + 1 * day),
      summary: "Pipeline review and PLG experiments.",
    },
  ]);
  console.log("  • 3 meetings");

  await db.insert(tasks).values([
    {
      orgId: org.id,
      title: "Finalize seed deck v4",
      priority: "urgent",
      status: "in_progress",
      owner: "CEO",
      dueDate: new Date(Date.now() + 2 * day),
      source: "manual",
    },
    {
      orgId: org.id,
      title: "Define anomaly detection thresholds",
      priority: "high",
      status: "todo",
      owner: "Eng",
      source: "meeting",
    },
    {
      orgId: org.id,
      title: "Draft investor update for June",
      priority: "medium",
      status: "todo",
      owner: "CEO",
      source: "manual",
    },
    {
      orgId: org.id,
      title: "SOC 2 Type I evidence collection",
      priority: "medium",
      status: "blocked",
      owner: "Ops",
      source: "manual",
    },
    {
      orgId: org.id,
      title: "Close Acme design partner into paid",
      priority: "high",
      status: "done",
      owner: "Growth",
      source: "manual",
    },
  ]);
  console.log("  • 5 tasks");

  await db.insert(memories).values([
    {
      orgId: org.id,
      type: "follow_up",
      content: "Send Sequoia partner the updated metrics before Thursday's meeting.",
      sourceRef: "seed",
    },
    {
      orgId: org.id,
      type: "decision",
      content: "Alerts ship via Slack (not email) for v2.",
      sourceRef: "seed",
    },
    {
      orgId: org.id,
      type: "fact",
      content: "Target seed raise: $3M at $15M post-money cap.",
      sourceRef: "seed",
    },
  ]);
  console.log("  • 3 memories");

  console.log("Done. Sign in with demo mode and explore.");
  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
