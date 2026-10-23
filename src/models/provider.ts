import type { ModelConfig } from "../core/types.js";
import { OpenRouterModel } from "./openrouter.js";

/**
 * Model-agnostic interface.
 * All providers implement this so Archivist stays fully pluggable.
 */
export interface ReviewModel {
  readonly name: string;
  readonly model: string;

  /**
   * Perform a code review given the diff and project memory context.
   * Returns raw model output (usually JSON or structured text).
   */
  review(params: {
    diff: string;
    memoryContext: string;
    systemInstructions: string;
  }): Promise<string>;
}

/**
 * Factory — creates the correct provider based on config.
 * OpenRouter is the recommended default (supports free models).
 */
export function createModel(config: ModelConfig): ReviewModel {
  switch (config.provider) {
    case "openrouter":
      return new OpenRouterModel(config);
    // Future:
    // case "anthropic":
    // case "openai":
    // case "google":
    // case "custom":
    default:
      throw new Error(
        `Model provider '${config.provider}' is not yet implemented. ` +
          `Currently supported: openrouter`
      );
  }
}

/**
 * Helper to create a model from environment variables.
 * Prefers OpenRouter.
 */
export function createModelFromEnv(): ReviewModel {
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (openrouterKey) {
    return createModel({
      provider: "openrouter",
      model: process.env.ARCHIVIST_MODEL || "recursive/flint-v1.0:free",
      apiKey: openrouterKey,
    });
  }

  throw new Error(
    "No model API key found. Set OPENROUTER_API_KEY in your .env file.\n" +
      "Get a free key at https://openrouter.ai"
  );
}
