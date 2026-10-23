import OpenAI from "openai";
import { env, hasOpenRouter } from "../core/config.js";

/**
 * Lightweight embedding helper.
 * Uses OpenRouter when available. Falls back to null (lexical search only).
 */
let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!hasOpenRouter()) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY!,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/feralxr/archivist",
        "X-Title": "Archivist",
      },
    });
  }
  return client;
}

export async function embed(text: string): Promise<number[] | null> {
  const c = getClient();
  if (!c) return null;

  try {
    const res = await c.embeddings.create({
      model: env.ARCHIVIST_EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    // Embedding model may not be available on free tier — fail soft
    console.warn("[embeddings] Failed, falling back to lexical search");
    return null;
  }
}

export async function embedBatch(
  texts: string[]
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  // Sequential for free-tier friendliness
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
