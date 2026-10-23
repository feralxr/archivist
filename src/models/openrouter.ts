import OpenAI from "openai";
import type { ModelConfig } from "../core/types.js";
import type { ReviewModel } from "./provider.js";

/**
 * OpenRouter provider.
 * Uses the OpenAI-compatible API so we can support hundreds of models
 * (including free ones) with a single integration.
 */
export class OpenRouterModel implements ReviewModel {
  readonly name = "openrouter";
  readonly model: string;
  private client: OpenAI;

  constructor(config: ModelConfig) {
    if (!config.apiKey) {
      throw new Error("OpenRouter API key is required");
    }

    this.model = config.model || "google/gemini-2.0-flash-exp:free";

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/feralxr/archivist",
        "X-Title": "Archivist",
      },
    });
  }

  async review(params: {
    diff: string;
    memoryContext: string;
    systemInstructions: string;
  }): Promise<string> {
    // memoryContext now contains the fully built user prompt from the review engine
    const userContent = params.memoryContext;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: params.systemInstructions,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      temperature: 0.15,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Model returned empty response");
    }

    return content;
  }
}
