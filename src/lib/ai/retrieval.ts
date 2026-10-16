import { getDb } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { asc, cosineDistance, eq, gt, sql } from "drizzle-orm";
import { embedText } from "./embeddings";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  source: string;
  content: string;
  similarity: number;
}

/** Chunks scoring below this cosine similarity are treated as irrelevant. */
const MIN_SIMILARITY = 0.05;

/**
 * Semantic search across the org's knowledge base using pgvector cosine
 * similarity. Returns the top-k most relevant chunks with their source docs.
 *
 * The nearest-neighbour search is isolated in a subquery that orders by the
 * raw `<=>` distance operator ascending with the LIMIT pushed down. That exact
 * shape is what pgvector's HNSW index can serve; ordering by a derived
 * expression such as `1 - (embedding <=> q)` descending forces a sequential
 * scan plus a sort over every chunk in the org. The similarity floor is
 * therefore applied *after* the limit, so a query may return fewer than k rows.
 */
export async function retrieveContext(
  orgId: string,
  query: string,
  k = 6
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(query);
  const db = getDb();

  const distance = cosineDistance(chunks.embedding, queryEmbedding);

  const nearest = db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      content: chunks.content,
      distance: sql<number>`${distance}`.as("distance"),
    })
    .from(chunks)
    .where(eq(chunks.orgId, orgId))
    .orderBy(asc(distance))
    .limit(k)
    .as("nearest");

  const similarity = sql<number>`1 - ${nearest.distance}`;

  const rows = await db
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

  return rows.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    source: r.source as string,
    content: r.content,
    similarity: Number(r.similarity),
  }));
}
