import type { ModelConfig, ModelProvider } from "../core/types.js";
import { env } from "../core/config.js";
import { OpenRouterModel } from "./openrouter.js";
import { OpenAIModel } from "./openai.js";
import { AnthropicModel } from "./anthropic.js";
import { DEFAULT_MODELS } from "./catalog.js";

/**
 * Model-agnostic interface.
 * All providers implement this so Archivist stays fully pluggable.
 */
export interface ReviewModel {
  readonly name: string;
  readonly model: string;

  review(params: {
    diff: string;
    memoryContext: string;
    systemInstructions: string;
  }): Promise<string>;
}

/** Optional per-call overrides (CLI flags, agent roles). */
export interface ModelSelection {
  provider?: ModelProvider | string;
  model?: string;
  /** Role defaults: review | embed — affects which env vars win */
  role?: "review" | "embed";
}

/**
 * Factory — creates the correct provider based on config.
 */
export function createModel(config: ModelConfig): ReviewModel {
  switch (config.provider) {
    case "openrouter":
      return new OpenRouterModel(config);
    case "openai":
      return new OpenAIModel(config);
    case "anthropic":
      return new AnthropicModel(config);
    default:
      throw new Error(
        `Model provider '${config.provider}' is not yet implemented.\n` +
          `Supported: openrouter, openai, anthropic`
      );
  }
}

function keyFor(provider: string): string | undefined {
  if (provider === "openrouter") {
    return process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
  }
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  }
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
  }
  return undefined;
}

/**
 * Resolve provider + model from environment and optional overrides.
 *
 * Priority for provider:
 * 1. explicit selection.provider
 * 2. ARCHIVIST_PROVIDER
 * 3. first available key: OpenRouter → Anthropic → OpenAI
 *
 * Priority for model id:
 * 1. explicit selection.model
 * 2. role-specific: ARCHIVIST_REVIEW_MODEL (review) / ARCHIVIST_EMBEDDING_MODEL (embed)
 * 3. ARCHIVIST_MODEL
 * 4. provider default from catalog
 */
export function resolveModelConfigFromEnv(
  selection: ModelSelection = {}
): ModelConfig {
  const forced = (
    selection.provider ||
    process.env.ARCHIVIST_PROVIDER ||
    env.ARCHIVIST_PROVIDER ||
    ""
  )
    .toLowerCase()
    .trim() as ModelProvider | "";

  const openrouterKey = keyFor("openrouter");
  const anthropicKey = keyFor("anthropic");
  const openaiKey = keyFor("openai");

  const roleModel =
    selection.role === "embed"
      ? process.env.ARCHIVIST_EMBEDDING_MODEL || env.ARCHIVIST_EMBEDDING_MODEL
      : process.env.ARCHIVIST_REVIEW_MODEL || process.env.ARCHIVIST_MODEL || env.ARCHIVIST_MODEL;

  const modelOverride = selection.model || roleModel;

  const pick = (provider: ModelProvider, apiKey: string): ModelConfig => {
    const fallback =
      DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS] || "gpt-4o-mini";
    return {
      provider,
      model: modelOverride || fallback,
      apiKey,
    };
  };

  if (forced) {
    const key = keyFor(forced);
    if (!key) {
      throw new Error(
        `Provider '${forced}' selected but no API key found.\n` +
          `Set ${forced === "openrouter" ? "OPENROUTER" : forced.toUpperCase()}_API_KEY in .env`
      );
    }
    return pick(forced as ModelProvider, key);
  }

  if (openrouterKey) return pick("openrouter", openrouterKey);
  if (anthropicKey) return pick("anthropic", anthropicKey);
  if (openaiKey) return pick("openai", openaiKey);

  throw new Error(
    "No model API key found.\n" +
      "Set one of:\n" +
      "  OPENROUTER_API_KEY\n" +
      "  ANTHROPIC_API_KEY\n" +
      "  OPENAI_API_KEY\n" +
      "Then choose a model:\n" +
      "  ARCHIVIST_PROVIDER=openai|anthropic|openrouter\n" +
      "  ARCHIVIST_MODEL=<any-model-id>\n" +
      "  ARCHIVIST_REVIEW_MODEL=<id>   # review agent only\n" +
      "Or CLI: archivist review --provider openai --model gpt-4o"
  );
}

export function createModelFromEnv(selection?: ModelSelection): ReviewModel {
  return createModel(resolveModelConfigFromEnv(selection));
}

export function hasAnyModelKey(): boolean {
  return Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      env.OPENROUTER_API_KEY ||
      env.ANTHROPIC_API_KEY ||
      env.OPENAI_API_KEY
  );
}
