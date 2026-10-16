/**
 * Verifies that the query Drizzle builds in src/lib/ai/retrieval.ts resolves to
 * an HNSW Index Scan rather than a Seq Scan + Sort.
 *
 * Rebuilds the exact query shape with relative imports (tsx has no path-alias
 * config here), prints the generated SQL, and runs EXPLAIN ANALYZE against the
 * synthetic benchmark org.
 *
 * Run with: npx tsx scripts/verify-retrieval-plan.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, cosineDistance, eq, gt, sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const { organizations, chunks, documents } = schema;
const DIMENSIONS = 1536;
const MIN_SIMILARITY = 0.05;

function randomUnitVector(): number[] {
  const v = new Array<number>(DIMENSIONS);
  let norm = 0;
  for (let i = 0; i < DIMENSIONS; i++) {
    let u = 0;
    let w = 0;
    while (u === 0) u = Math.random();
    while (w === 0) w = Math.random();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
    v[i] = g;
    norm += g * g;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIMENSIONS; i++) v[i] /= norm;
  return v;
}

async function main() {
  const sqlClient = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(sqlClient, { schema });

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "bench-synthetic"))
    .limit(1);
  if (!org) throw new Error("benchmark org not found — run bench-retrieval.ts first");

  const queryEmbedding = randomUnitVector();
  const k = 6;

  // Identical construction to retrieveContext().
  const distance = cosineDistance(chunks.embedding, queryEmbedding);
  const nearest = db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      content: chunks.content,
      distance: sql<number>`${distance}`.as("distance"),
    })
    .from(chunks)
    .where(eq(chunks.orgId, org.id))
    .orderBy(asc(distance))
    .limit(k)
    .as("nearest");

  const similarity = sql<number>`1 - ${nearest.distance}`;

  const query = db
    .select({
      chunkId: nearest.chunkId,
      documentId: nearest.documentId,
      documentTitle: documents.title,
      source: documents.source,
      content: nearest.content,
      similarity,
    })
    .from(nearest)
    .innerJoin(documents, eq(nearest.documentId, documents.id))
    .where(gt(similarity, MIN_SIMILARITY))
    .orderBy(asc(nearest.distance));

  const { sql: text, params } = query.toSQL();
  console.log("\nGenerated SQL (vector literal elided):\n");
  console.log("  " + text.replace(/\$1/g, "<1536-dim vector>") + "\n");
  console.log(`  bound params: ${params.length}\n`);

  const t = performance.now();
  const rows = await query;
  const elapsed = performance.now() - t;
  console.log(`  returned ${rows.length} rows in ${elapsed.toFixed(2)} ms\n`);

  const plan = await sqlClient.unsafe(`explain analyze ${text}`, params as never[]);
  console.log("EXPLAIN ANALYZE:\n");
  for (const row of plan) {
    const line = (row as Record<string, string>)["QUERY PLAN"];
    if (/vector\)\)\) DESC|'\[/.test(line)) continue; // skip giant vector literals
    console.log("  " + line);
  }
  console.log("");

  await sqlClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
