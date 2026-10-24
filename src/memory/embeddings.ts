import OpenAI from "openai";
import { env, hasOpenRouter, hasOpenAI } from "../core/config.js";

/**
 * Embedding helper.
 * Uses OpenAI when OPENAI_API_KEY is set, else OpenRouter when available.
 * Falls back to null (lexical search only).
 */
let client: OpenAI | null = null;
let clientMode: "openai" | "openrouter" | null = null;

function getClient(): OpenAI | null {
  if (client) return client;

  if (hasOpenAI() && env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    clientMode = "openai";
    return client;
  }

  if (hasOpenRouter() && env.OPENROUTER_API_KEY) {
    client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/feralxr/archivist",
        "X-Title": "Archivist",
      },
    });
    clientMode = "openrouter";
    return client;
  }

  return null;
}

function embeddingModel(): string {
  if (clientMode === "openai") {
    // Native OpenAI embedding ids
    const m = env.ARCHIVIST_EMBEDDING_MODEL || "text-embedding-3-small";
    // Strip openrouter-style prefix if user left default
    return m.includes("/") ? m.split("/").pop()! : m;
  }
  return env.ARCHIVIST_EMBEDDING_MODEL || "openai/text-embedding-3-small";
}

export async function embed(text: string): Promise<number[] | null> {
  const c = getClient();
  if (!c) return null;

  try {
    const res = await c.embeddings.create({
      model: embeddingModel(),
      input: text.slice(0, 8000),
    });
    return res.data[0]?.embedding ?? null;
  } catch {
    // Fail soft — lexical search still works
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const t of texts) {
    results.push(await embed(t));
  }
  return results;
}

/** Cosine similarity */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
