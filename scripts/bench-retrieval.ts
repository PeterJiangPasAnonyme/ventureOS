/**
 * Retrieval benchmark.
 *
 * Loads N synthetic chunks into an isolated benchmark org (the demo org is
 * untouched), then times two query shapes against it:
 *
 *   A. "expression" — the shape in src/lib/ai/retrieval.ts: ORDER BY the
 *      computed expression `1 - (embedding <=> q)` DESC. The planner cannot
 *      use an HNSW index through this, so it sorts every matching row.
 *   B. "operator"   — ORDER BY `embedding <=> q` ASC with the LIMIT pushed
 *      down to the base table, then joined. This is the form pgvector's
 *      HNSW index can serve.
 *
 * Vectors are Gaussian then L2-normalized, so they're distributed over the
 * unit sphere like real embeddings rather than bunched in one orthant.
 *
 * Run with: npx tsx scripts/bench-retrieval.ts [chunkCount] [iterations]
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const { organizations, documents, chunks } = schema;

const DIMENSIONS = 1536;
const TOP_K = 6;
const BENCH_SLUG = "bench-synthetic";
const BATCH = 500;

const CHUNK_COUNT = Number(process.argv[2] ?? 10000);
const ITERATIONS = Number(process.argv[3] ?? 50);

/** Box-Muller: one standard normal sample. */
function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A unit vector drawn uniformly from the surface of the 1536-sphere. */
function randomUnitVector(): number[] {
  const v = new Array<number>(DIMENSIONS);
  let norm = 0;
  for (let i = 0; i < DIMENSIONS; i++) {
    const g = gauss();
    v[i] = g;
    norm += g * g;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIMENSIONS; i++) v[i] /= norm;
  return v;
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

interface Summary {
  label: string;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
}

function summarize(label: string, samples: number[]): Summary {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((s, n) => s + n, 0) / samples.length;
  return {
    label,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

const ms = (n: number) => `${n.toFixed(2)} ms`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (check .env.local)");

  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql, { schema });

  console.log(
    `\nRetrieval benchmark — ${CHUNK_COUNT.toLocaleString()} synthetic chunks, ` +
      `${DIMENSIONS} dims, top-k ${TOP_K}, ${ITERATIONS} iterations per shape\n`
  );

  // ---- Load ------------------------------------------------------------
  await db.delete(organizations).where(eq(organizations.slug, BENCH_SLUG));
  const [org] = await db
    .insert(organizations)
    .values({ name: "Benchmark Org", slug: BENCH_SLUG })
    .returning();
  const [doc] = await db
    .insert(documents)
    .values({
      orgId: org.id,
      title: "Synthetic benchmark corpus",
      source: "note",
      content: "generated",
    })
    .returning();

  const loadStart = Date.now();
  let inserted = 0;
  while (inserted < CHUNK_COUNT) {
    const size = Math.min(BATCH, CHUNK_COUNT - inserted);
    const rows = Array.from({ length: size }, (_, i) => ({
      orgId: org.id,
      documentId: doc.id,
      chunkIndex: inserted + i,
      content: `Synthetic chunk ${inserted + i} for retrieval benchmarking.`,
      embedding: randomUnitVector(),
    }));
    await db.insert(chunks).values(rows);
    inserted += size;
    process.stdout.write(`\r  loaded ${inserted.toLocaleString()} / ${CHUNK_COUNT.toLocaleString()}`);
  }
  const loadSecs = (Date.now() - loadStart) / 1000;
  console.log(`\n  load + HNSW index maintenance: ${loadSecs.toFixed(1)}s\n`);

  await sql`analyze chunks`;

  const sizes = await sql<{ table_size: string; index_size: string; n: number }[]>`
    select pg_size_pretty(pg_total_relation_size('chunks')) as table_size,
           pg_size_pretty(pg_relation_size('chunks_embedding_idx')) as index_size,
           (select count(*) from chunks) as n
  `;
  console.log(
    `  chunks table: ${sizes[0].table_size} · hnsw index: ${sizes[0].index_size} · ` +
      `${Number(sizes[0].n).toLocaleString()} total rows\n`
  );

  // ---- Query shapes ----------------------------------------------------
  const runExpression = async (probe: string) => sql`
    select c.id, d.title, 1 - (c.embedding <=> ${probe}::vector) as similarity
    from chunks c
    join documents d on c.document_id = d.id
    where c.org_id = ${org.id}
      and 1 - (c.embedding <=> ${probe}::vector) > 0.05
    order by similarity desc
    limit ${TOP_K}
  `;

  const runOperator = async (probe: string) => sql`
    select t.id, d.title, 1 - t.distance as similarity
    from (
      select id, document_id, embedding <=> ${probe}::vector as distance
      from chunks
      where org_id = ${org.id}
      order by embedding <=> ${probe}::vector
      limit ${TOP_K}
    ) t
    join documents d on t.document_id = d.id
    where 1 - t.distance > 0.05
  `;

  // ---- Warm up ---------------------------------------------------------
  for (let i = 0; i < 5; i++) {
    const probe = toVectorLiteral(randomUnitVector());
    await runExpression(probe);
    await runOperator(probe);
  }

  // ---- Measure (fresh probe each iteration, interleaved) ---------------
  const exprSamples: number[] = [];
  const operSamples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const probe = toVectorLiteral(randomUnitVector());

    let t = performance.now();
    await runExpression(probe);
    exprSamples.push(performance.now() - t);

    t = performance.now();
    await runOperator(probe);
    operSamples.push(performance.now() - t);
  }

  const a = summarize("A. expression ORDER BY (current code)", exprSamples);
  const b = summarize("B. operator ORDER BY (index-friendly)", operSamples);

  for (const s of [a, b]) {
    console.log(`  ${s.label}`);
    console.log(
      `     p50 ${ms(s.p50)}   p95 ${ms(s.p95)}   p99 ${ms(s.p99)}   ` +
        `mean ${ms(s.mean)}   min ${ms(s.min)}   max ${ms(s.max)}`
    );
  }
  console.log(
    `\n  speedup at p50: ${(a.p50 / b.p50).toFixed(1)}x   ` +
      `at p95: ${(a.p95 / b.p95).toFixed(1)}x\n`
  );

  // ---- Plans -----------------------------------------------------------
  const probe = toVectorLiteral(randomUnitVector());
  const planOf = async (label: string, rows: { "QUERY PLAN": string }[]) => {
    const lines = rows.map((r) => r["QUERY PLAN"]);
    const onChunks = lines.filter((l) => /Scan.*\bchunks\b/.test(l));
    const sortNode = lines.filter((l) => /\bSort\b|Sort Method/.test(l));
    console.log(`  ${label}:`);
    for (const l of [...onChunks, ...sortNode]) console.log(`     ${l.trim()}`);
    if (onChunks.length === 0 && sortNode.length === 0) {
      console.log("     (no chunks scan or sort node found)");
    }
  };

  await planOf(
    "A plan",
    await sql`
      explain analyze
      select c.id, 1 - (c.embedding <=> ${probe}::vector) as similarity
      from chunks c join documents d on c.document_id = d.id
      where c.org_id = ${org.id} and 1 - (c.embedding <=> ${probe}::vector) > 0.05
      order by similarity desc limit ${TOP_K}
    `
  );
  await planOf(
    "B plan",
    await sql`
      explain analyze
      select t.id from (
        select id, document_id, embedding <=> ${probe}::vector as distance
        from chunks where org_id = ${org.id}
        order by embedding <=> ${probe}::vector limit ${TOP_K}
      ) t join documents d on t.document_id = d.id
    `
  );

  console.log(
    `\n  Benchmark org left in place (slug "${BENCH_SLUG}").` +
      `\n  Remove with: delete from organizations where slug = '${BENCH_SLUG}';\n`
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
