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

    this.model = config.model || "recursive/flint-v1.0:free";

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/feralxr/archivist",
        "X-Title": "Archivist",
      },
      timeout: 120_000,
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
          max_tokens: 8192,
        });

        const message = response.choices[0]?.message as any;
        let text = message?.content?.trim?.() || message?.content || "";

        // Some free models put most tokens into reasoning and leave content empty.
        // Fall back to extracting JSON from reasoning if needed.
        if (!text && message?.reasoning) {
          const reasoning = String(message.reasoning);
          const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            log.warn("Model content empty; recovered JSON from reasoning field");
            text = jsonMatch[0];
          }
        }

        if (!text) {
          throw new Error("Model returned empty response");
        }
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
