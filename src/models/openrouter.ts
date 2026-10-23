import OpenAI from "openai";
import type { ModelConfig } from "../core/types.js";
import type { ReviewModel } from "./provider.js";
import { withRetry } from "../core/retry.js";
import { log } from "../core/logger.js";

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
      timeout: 90_000,
    });
  }

  async review(params: {
    diff: string;
    memoryContext: string;
    systemInstructions: string;
  }): Promise<string> {
    const userContent = params.memoryContext;

    const content = await withRetry(
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: params.systemInstructions },
            { role: "user", content: userContent },
          ],
          temperature: 0.15,
          max_tokens: 4096,
        });

        const text = response.choices[0]?.message?.content;
        if (!text) throw new Error("Model returned empty response");
        return text;
      },
      {
        retries: 3,
        onRetry: (err, attempt) => {
          log.warn("Model call failed, retrying", {
            attempt,
            model: this.model,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      }
    );

    return content;
  }
}
