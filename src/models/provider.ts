import type { ModelConfig } from "../core/types.js";

/**
 * Model-agnostic interface.
 * All providers (OpenRouter, Anthropic, OpenAI, etc.) implement this.
 */
export interface ReviewModel {
  readonly name: string;
  review(params: {
    diff: string;
    memoryContext: string;
    systemInstructions: string;
  }): Promise<string>;
}

export function createModel(config: ModelConfig): ReviewModel {
  // Will be implemented with OpenRouter as primary
  throw new Error(`Model provider '${config.provider}' not yet implemented`);
}
