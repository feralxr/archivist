import type { ModelConfig, ModelProvider } from "../core/types.js";
import { env } from "../core/config.js";
import { OpenRouterModel } from "./openrouter.js";
import { OpenAIModel } from "./openai.js";
import { AnthropicModel } from "./anthropic.js";

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

const DEFAULT_MODELS: Record<ModelProvider, string> = {
  openrouter: "recursive/flint-v1.0:free",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
  custom: "custom-model",
};

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

/**
 * Resolve provider + model from environment.
 *
 * Priority:
 * 1. ARCHIVIST_PROVIDER if set (and matching key exists)
 * 2. OPENROUTER_API_KEY
 * 3. ANTHROPIC_API_KEY
 * 4. OPENAI_API_KEY
 */
export function resolveModelConfigFromEnv(): ModelConfig {
  const forced = (process.env.ARCHIVIST_PROVIDER || env.ARCHIVIST_PROVIDER || "")
    .toLowerCase()
    .trim() as ModelProvider | "";

  const openrouterKey = process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;

  const modelOverride = process.env.ARCHIVIST_MODEL || env.ARCHIVIST_MODEL;

  if (forced) {
    const key =
      forced === "openrouter"
        ? openrouterKey
        : forced === "anthropic"
          ? anthropicKey
          : forced === "openai"
            ? openaiKey
            : undefined;

    if (!key) {
      throw new Error(
        `ARCHIVIST_PROVIDER=${forced} but no API key found for that provider.\n` +
          `Set ${forced === "openrouter" ? "OPENROUTER" : forced.toUpperCase()}_API_KEY in .env`
      );
    }

    return {
      provider: forced,
      model: modelOverride || DEFAULT_MODELS[forced],
      apiKey: key,
    };
  }

  if (openrouterKey) {
    return {
      provider: "openrouter",
      model: modelOverride || DEFAULT_MODELS.openrouter,
      apiKey: openrouterKey,
    };
  }

  if (anthropicKey) {
    return {
      provider: "anthropic",
      model:
        modelOverride && !modelOverride.includes("/")
          ? modelOverride
          : modelOverride?.startsWith("claude")
            ? modelOverride
            : DEFAULT_MODELS.anthropic,
      apiKey: anthropicKey,
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      model:
        modelOverride && !modelOverride.includes("/")
          ? modelOverride
          : modelOverride?.startsWith("gpt")
            ? modelOverride
            : DEFAULT_MODELS.openai,
      apiKey: openaiKey,
    };
  }

  throw new Error(
    "No model API key found.\n" +
      "Set one of:\n" +
      "  OPENROUTER_API_KEY  (free models: https://openrouter.ai)\n" +
      "  ANTHROPIC_API_KEY   (Claude)\n" +
      "  OPENAI_API_KEY      (GPT)\n" +
      "Optional: ARCHIVIST_PROVIDER=openrouter|anthropic|openai\n" +
      "Optional: ARCHIVIST_MODEL=<model-id>"
  );
}

export function createModelFromEnv(): ReviewModel {
  return createModel(resolveModelConfigFromEnv());
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
