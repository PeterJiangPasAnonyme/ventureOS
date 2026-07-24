import { getDb } from "@/lib/db";
import { documents, chunks } from "@/lib/db/schema";
import { embedTexts } from "./embeddings";
import type { Document } from "@/lib/db/schema";

const CHUNK_SIZE = 1200; // characters
const CHUNK_OVERLAP = 150;

/** Splits text into overlapping chunks on paragraph/sentence boundaries. */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const paragraphs = clean.split(/\n\n+/);
  const out: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > CHUNK_SIZE && current) {
      out.push(current.trim());
      // start next chunk with a tail overlap of the previous one
      current = current.slice(-CHUNK_OVERLAP) + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
    // hard-split very long paragraphs
    while (current.length > CHUNK_SIZE * 1.5) {
      out.push(current.slice(0, CHUNK_SIZE).trim());
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export interface IngestInput {
  orgId: string;
  title: string;
  content: string;
  source?: Document["source"];
  mimeType?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists a document, splits it into chunks, embeds each chunk, and stores the
 * vectors. Returns the created document plus the number of chunks indexed.
 */
export async function ingestDocument(
  input: IngestInput
): Promise<{ document: Document; chunkCount: number }> {
  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      orgId: input.orgId,
      title: input.title,
      content: input.content,
      source: input.source ?? "upload",
      mimeType: input.mimeType,
      url: input.url,
      metadata: input.metadata,
    })
    .returning();

  const pieces = chunkText(input.content);
  if (pieces.length === 0) return { document: doc, chunkCount: 0 };

  const embeddings = await embedTexts(pieces);
  await db.insert(chunks).values(
    pieces.map((content, i) => ({
      orgId: input.orgId,
      documentId: doc.id,
      chunkIndex: i,
      content,
      embedding: embeddings[i],
    }))
  );

  return { document: doc, chunkCount: pieces.length };
}
