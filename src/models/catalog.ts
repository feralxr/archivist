/**
 * Curated model catalogs per provider.
 *
 * Any model id string still works via ARCHIVIST_MODEL / --model —
 * these lists are for discovery and sensible defaults, not an exhaustive registry.
 * OpenRouter alone exposes hundreds of ids; pass them directly when needed.
 */

import type { ModelProvider } from "../core/types.js";

export interface CatalogEntry {
  id: string;
  label: string;
  /** rough tier for humans */
  tier?: "free" | "budget" | "standard" | "premium";
  notes?: string;
}

export const MODEL_CATALOG: Record<
  Extract<ModelProvider, "openrouter" | "openai" | "anthropic">,
  CatalogEntry[]
> = {
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "budget", notes: "Fast, cheap default" },
    { id: "gpt-4o", label: "GPT-4o", tier: "standard", notes: "Strong general review" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", tier: "budget" },
    { id: "gpt-4.1", label: "GPT-4.1", tier: "standard" },
    { id: "o4-mini", label: "o4-mini", tier: "standard", notes: "Reasoning-oriented" },
  ],
  anthropic: [
    {
      id: "claude-sonnet-4-20250514",
      label: "Claude Sonnet 4",
      tier: "standard",
      notes: "Balanced default",
    },
    {
      id: "claude-opus-4-20250514",
      label: "Claude Opus 4",
      tier: "premium",
      notes: "Highest quality, costlier",
    },
    {
      id: "claude-3-5-haiku-latest",
      label: "Claude 3.5 Haiku",
      tier: "budget",
      notes: "Fast / cheap",
    },
  ],
  openrouter: [
    {
      id: "recursive/flint-v1.0:free",
      label: "Flint free",
      tier: "free",
      notes: "Free-tier friendly",
    },
    {
      id: "openai/gpt-4o-mini",
      label: "GPT-4o Mini (via OR)",
      tier: "budget",
    },
    {
      id: "openai/gpt-4o",
      label: "GPT-4o (via OR)",
      tier: "standard",
    },
    {
      id: "anthropic/claude-sonnet-4",
      label: "Claude Sonnet 4 (via OR)",
      tier: "standard",
    },
    {
      id: "google/gemini-2.0-flash-001",
      label: "Gemini 2.0 Flash",
      tier: "budget",
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct",
      label: "Llama 3.3 70B",
      tier: "budget",
    },
    {
      id: "deepseek/deepseek-chat",
      label: "DeepSeek Chat",
      tier: "budget",
    },
  ],
};

export const DEFAULT_MODELS: Record<
  Extract<ModelProvider, "openrouter" | "openai" | "anthropic">,
  string
> = {
  openrouter: "recursive/flint-v1.0:free",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
};

export function listCatalog(
  provider?: string
): Array<{ provider: string; entry: CatalogEntry }> {
  const providers = provider
    ? [provider as keyof typeof MODEL_CATALOG]
    : (Object.keys(MODEL_CATALOG) as Array<keyof typeof MODEL_CATALOG>);

  const out: Array<{ provider: string; entry: CatalogEntry }> = [];
  for (const p of providers) {
    const list = MODEL_CATALOG[p];
    if (!list) continue;
    for (const entry of list) out.push({ provider: p, entry });
  }
  return out;
}

export function isKnownModel(provider: string, modelId: string): boolean {
  const list = MODEL_CATALOG[provider as keyof typeof MODEL_CATALOG];
  if (!list) return false;
  return list.some((e) => e.id === modelId);
}
