import OpenAI from "openai";
import type { ModelConfig } from "../core/types.js";
import type { ReviewModel } from "./provider.js";
import { withRetry } from "../core/retry.js";
import { log } from "../core/logger.js";

/**
 * Direct OpenAI provider.
 */
export class OpenAIModel implements ReviewModel {
  readonly name = "openai";
  readonly model: string;
  private client: OpenAI;

  constructor(config: ModelConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.model = config.model || "gpt-4o-mini";

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl, // optional override
      timeout: 120_000,
    });
  }

  async review(params: {
    diff: string;
    memoryContext: string;
    systemInstructions: string;
  }): Promise<string> {
    const content = await withRetry(
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: params.systemInstructions },
            { role: "user", content: params.memoryContext },
          ],
          temperature: 0.15,
          max_tokens: 8192,
        });

        const text = response.choices[0]?.message?.content?.trim();
        if (!text) throw new Error("OpenAI returned empty response");
        return text;
      },
      {
        retries: 3,
        onRetry: (err, attempt) => {
          log.warn("OpenAI call failed, retrying", {
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
