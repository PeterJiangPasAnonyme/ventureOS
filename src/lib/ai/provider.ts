import { createOpenAI } from "@ai-sdk/openai";

/**
 * Central place to configure the LLM provider. Everything degrades gracefully:
 * when OPENAI_API_KEY is absent the orchestrator falls back to a deterministic
 * mock so the product is still fully demoable offline.
 */

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export function chatModel() {
  return openai(CHAT_MODEL);
}

export function embeddingModel() {
  return openai.embedding(EMBEDDING_MODEL);
}
