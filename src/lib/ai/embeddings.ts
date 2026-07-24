import { embed, embedMany } from "ai";
import { embeddingModel, hasOpenAI, EMBEDDING_DIMENSIONS } from "./provider";

/**
 * Deterministic fallback embedding used when no OpenAI key is configured.
 * It hashes tokens into a fixed-size bag-of-words vector and L2-normalizes it.
 * This is obviously not semantically rich, but it makes cosine similarity
 * meaningful for keyword overlap so retrieval demos work fully offline.
 */
function hashEmbed(text: string): number[] {
  const vec = new Array(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBEDDING_DIMENSIONS;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function embedText(text: string): Promise<number[]> {
  const input = text.slice(0, 8000);
  if (!hasOpenAI()) return hashEmbed(input);
  try {
    const { embedding } = await embed({
      model: embeddingModel(),
      value: input,
    });
    return embedding;
  } catch (err) {
    console.error("embedText failed, using fallback:", err);
    return hashEmbed(input);
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const inputs = texts.map((t) => t.slice(0, 8000));
  if (!hasOpenAI()) return inputs.map(hashEmbed);
  try {
    const { embeddings } = await embedMany({
      model: embeddingModel(),
      values: inputs,
    });
    return embeddings;
  } catch (err) {
    console.error("embedTexts failed, using fallback:", err);
    return inputs.map(hashEmbed);
  }
}
