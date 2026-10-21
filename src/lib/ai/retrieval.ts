import { getDb } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { and, asc, cosineDistance, desc, eq, inArray, sql } from "drizzle-orm";
import { embedTexts } from "./embeddings";
import { formatDocDate } from "@/lib/utils";
import type { DocKind } from "@/lib/db/schema";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  source: string;
  docKind: DocKind;
  docDate: string;
  series: string | null;
  /** False when a newer document in the same series exists. */
  latestInSeries: boolean;
  content: string;
  similarity: number;
  matchedQuery: string;
  matchedBy: "vector" | "keyword" | "both";
}

export interface RetrieveOptions {
  /** One or more short searches; results are merged. */
  queries: string[];
  /** Total chunks returned across all queries. */
  k?: number;
  /** Return older versions in a series as well as the newest. */
  includeHistory?: boolean;
  /** Only documents dated on or before this; newest version as of then. */
  asOf?: Date;
}

/** Chunks scoring below this cosine similarity are treated as irrelevant. */
const MIN_SIMILARITY = 0.05;
/** A vector hit is kept only if it is within this distance of the query's best hit. */
const SIMILARITY_GAP = 0.06;
const CANDIDATES = 24;
const KEYWORD_CANDIDATES = 8;
const PER_QUERY = 6;
const PER_DOCUMENT = 3;
const DEFAULT_K = 14;
const RRF_K = 60;
/** Every hit must reach this share of the best similarity across all queries. */
const RELATIVE_FLOOR = 0.85;
/** Terms in more than this share of chunks carry no signal for keyword search. */
const COMMON_TERM_SHARE = 0.25;
/** A term in at most this many chunks is rare enough to admit a keyword hit on its own. */
const RARE_TERM_CHUNKS = 2;
const TERM_STATS_TTL_MS = 5 * 60 * 1000;


interface TermStats {
  chunks: number;
  df: Map<string, number>;
  at: number;
}
const termStatsCache = new Map<string, TermStats>();

/** Chunk frequency of every lexeme in the org's knowledge base. */
async function termStats(orgId: string): Promise<TermStats> {
  const cached = termStatsCache.get(orgId);
  if (cached && Date.now() - cached.at < TERM_STATS_TTL_MS) return cached;
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chunks)
    .where(eq(chunks.orgId, orgId));
  const rows = await db.execute<{ word: string; ndoc: number }>(
    sql`select word, ndoc from ts_stat(${`select to_tsvector('english', content) from chunks where org_id = '${orgId.replace(/'/g, "")}'`})`
  );
  const stats: TermStats = {
    chunks: n,
    df: new Map(Array.from(rows as Iterable<{ word: string; ndoc: number }>).map((r) => [r.word, Number(r.ndoc)])),
    at: Date.now(),
  };
  termStatsCache.set(orgId, stats);
  return stats;
}

interface KeywordQuery {
  tsquery: string;
  rare: string[];
}

/** Stemmed query terms, minus those common across the corpus, OR-ed together. */
async function keywordQuery(orgId: string, q: string): Promise<KeywordQuery | null> {
  const db = getDb();
  const rows = await db.execute<{ lexeme: string }>(
    sql`select lexeme from unnest(to_tsvector('english', ${q}))`
  );
  const lexemes = Array.from(rows as Iterable<{ lexeme: string }>)
    .map((r) => r.lexeme)
    .filter((l) => /^[a-z0-9.]+$/.test(l) && l.length >= 2);
  if (!lexemes.length) return null;
  const stats = await termStats(orgId);
  const useful = lexemes.filter((l) => (stats.df.get(l) ?? 0) <= stats.chunks * COMMON_TERM_SHARE);
  if (!useful.length) return null;
  return {
    tsquery: useful.join(" | "),
    rare: useful.filter((l) => {
      const df = stats.df.get(l) ?? 0;
      return df > 0 && df <= RARE_TERM_CHUNKS;
    }),
  };
}

interface DocInfo {
  id: string;
  title: string;
  source: string;
  docKind: DocKind;
  docDate: Date | null;
  datePrecision: string;
  series: string | null;
}

/** Which documents are eligible, and which are the newest in their series. */
async function eligibleDocuments(orgId: string, opts: RetrieveOptions) {
  const db = getDb();
  const docs: DocInfo[] = await db
    .select({
      id: documents.id,
      title: documents.title,
      source: documents.source,
      docKind: documents.docKind,
      docDate: documents.docDate,
      datePrecision: documents.datePrecision,
      series: documents.series,
    })
    .from(documents)
    .where(eq(documents.orgId, orgId));

  const asOf = opts.asOf?.getTime();
  const inWindow = docs.filter((d) => asOf === undefined || !d.docDate || d.docDate.getTime() <= asOf);

  const newest = new Map<string, DocInfo>();
  for (const d of inWindow) {
    if (!d.series) continue;
    const cur = newest.get(d.series);
    if (!cur || (d.docDate?.getTime() ?? 0) > (cur.docDate?.getTime() ?? 0)) newest.set(d.series, d);
  }
  const latestOverall = new Map<string, DocInfo>();
  for (const d of docs) {
    if (!d.series) continue;
    const cur = latestOverall.get(d.series);
    if (!cur || (d.docDate?.getTime() ?? 0) > (cur.docDate?.getTime() ?? 0)) latestOverall.set(d.series, d);
  }

  const eligible = inWindow.filter(
    (d) => opts.includeHistory || !d.series || newest.get(d.series)?.id === d.id
  );
  const byId = new Map(docs.map((d) => [d.id, d]));
  return {
    ids: eligible.map((d) => d.id),
    byId,
    isLatest: (d: DocInfo) => !d.series || latestOverall.get(d.series)?.id === d.id,
  };
}

interface Candidate {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
  score: number;
  matchedQuery: string;
  matchedBy: "vector" | "keyword" | "both";
  /** Matched a term that appears in only a couple of chunks. */
  rareTerm: boolean;
}

async function searchOne(
  orgId: string,
  docIds: string[],
  query: string,
  embedding: number[]
): Promise<Candidate[]> {
  const db = getDb();
  const scope = and(eq(chunks.orgId, orgId), inArray(chunks.documentId, docIds));
  const distance = cosineDistance(chunks.embedding, embedding);

  const vectorRows = await db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      content: chunks.content,
      distance: sql<number>`${distance}`.as("distance"),
    })
    .from(chunks)
    .where(scope)
    .orderBy(asc(distance))
    .limit(CANDIDATES);

  const kw = await keywordQuery(orgId, query);
  const rareQuery = kw?.rare.length ? kw.rare.join(" | ") : null;
  const keywordRows = kw
    ? await db
        .select({
          chunkId: chunks.id,
          documentId: chunks.documentId,
          content: chunks.content,
          distance: sql<number>`${distance}`.as("distance"),
          rank: sql<number>`ts_rank(to_tsvector('english', ${chunks.content}), to_tsquery('simple', ${kw.tsquery}))`.as("rank"),
          rare: rareQuery
            ? sql<boolean>`to_tsvector('english', ${chunks.content}) @@ to_tsquery('simple', ${rareQuery})`.as("rare")
            : sql<boolean>`false`.as("rare"),
        })
        .from(chunks)
        .where(and(scope, sql`to_tsvector('english', ${chunks.content}) @@ to_tsquery('simple', ${kw.tsquery})`))
        .orderBy(desc(sql`rank`))
        .limit(KEYWORD_CANDIDATES)
    : [];

  const best = vectorRows.length ? 1 - Number(vectorRows[0].distance) : 0;
  const merged = new Map<string, Candidate>();

  vectorRows.forEach((row, rank) => {
    const similarity = 1 - Number(row.distance);
    if (similarity < MIN_SIMILARITY || similarity < best - SIMILARITY_GAP) return;
    merged.set(row.chunkId, {
      chunkId: row.chunkId,
      documentId: row.documentId,
      content: row.content,
      similarity,
      score: 1 / (RRF_K + rank),
      matchedQuery: query,
      matchedBy: "vector",
      rareTerm: false,
    });
  });

  keywordRows.forEach((row, rank) => {
    const prior = merged.get(row.chunkId);
    if (prior) {
      prior.score += 1 / (RRF_K + rank);
      prior.matchedBy = "both";
      prior.rareTerm = Boolean(row.rare);
      return;
    }
    // A keyword-only hit has to be among the top few matches to count.
    if (rank >= 3) return;
    merged.set(row.chunkId, {
      chunkId: row.chunkId,
      documentId: row.documentId,
      content: row.content,
      similarity: 1 - Number(row.distance),
      score: 1 / (RRF_K + rank),
      matchedQuery: query,
      matchedBy: "keyword",
      rareTerm: Boolean(row.rare),
    });
  });

  return Array.from(merged.values()).sort((a, b) => b.score - a.score).slice(0, PER_QUERY);
}

/**
 * Hybrid search over the org's knowledge base. Each query runs a pgvector
 * cosine search and a Postgres full-text search over the query's less common
 * terms; the two rankings are fused, and vector hits far below the query's best
 * hit are dropped. Across queries, a hit must reach a share of the overall best
 * similarity unless it matched a rare term. Results are merged with a
 * per-document cap. By default only the newest
 * document in each series is searched.
 */
export async function retrieveContext(
  orgId: string,
  input: string | RetrieveOptions,
  k?: number
): Promise<RetrievedChunk[]> {
  const opts: RetrieveOptions = typeof input === "string" ? { queries: [input], k } : input;
  const queries = opts.queries.map((q) => q.trim()).filter(Boolean).slice(0, 6);
  if (!queries.length) return [];

  const { ids, byId, isLatest } = await eligibleDocuments(orgId, opts);
  if (!ids.length) return [];

  const embeddings = await embedTexts(queries);
  const searched = await Promise.all(queries.map((q, i) => searchOne(orgId, ids, q, embeddings[i])));
  const globalBest = Math.max(0, ...searched.flat().map((c) => c.similarity));
  const perQuery = searched.map((results) =>
    results.filter((c) => c.rareTerm || c.similarity >= globalBest * RELATIVE_FLOOR)
  );

  // Round-robin across queries so every sub-question gets its best hits in.
  const picked = new Map<string, Candidate>();
  const perDoc = new Map<string, number>();
  const limit = opts.k ?? DEFAULT_K;
  const depth = Math.max(0, ...perQuery.map((r) => r.length));
  for (let i = 0; i < depth && picked.size < limit; i++) {
    for (const results of perQuery) {
      const c = results[i];
      if (!c || picked.has(c.chunkId)) continue;
      const n = perDoc.get(c.documentId) ?? 0;
      if (n >= PER_DOCUMENT) continue;
      picked.set(c.chunkId, c);
      perDoc.set(c.documentId, n + 1);
      if (picked.size >= limit) break;
    }
  }

  return Array.from(picked.values()).map((c) => {
    const doc = byId.get(c.documentId)!;
    return {
      chunkId: c.chunkId,
      documentId: c.documentId,
      documentTitle: doc.title,
      source: doc.source,
      docKind: doc.docKind,
      docDate: formatDocDate(doc.docDate, doc.datePrecision),
      series: doc.series,
      latestInSeries: isLatest(doc),
      content: c.content,
      similarity: c.similarity,
      matchedQuery: c.matchedQuery,
      matchedBy: c.matchedBy,
    };
  });
}
