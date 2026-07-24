import { getDb } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { embedText } from "./embeddings";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  source: string;
  content: string;
  similarity: number;
}

/**
 * Semantic search across the org's knowledge base using pgvector cosine
 * similarity. Returns the top-k most relevant chunks with their source docs.
 */
export async function retrieveContext(
  orgId: string,
  query: string,
  k = 6
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(query);
  const db = getDb();

  const similarity = sql<number>`1 - (${cosineDistance(
    chunks.embedding,
    queryEmbedding
  )})`;

  const rows = await db
    .select({
      chunkId: chunks.id,
      documentId: chunks.documentId,
      documentTitle: documents.title,
      source: documents.source,
      content: chunks.content,
      similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(and(eq(chunks.orgId, orgId), gt(similarity, 0.05)))
    .orderBy((t) => desc(t.similarity))
    .limit(k);

  return rows.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    source: r.source as string,
    content: r.content,
    similarity: Number(r.similarity),
  }));
}
