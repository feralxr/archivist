import type { ModelConfig } from "../core/types.js";
import type { ReviewModel } from "./provider.js";
import { withRetry } from "../core/retry.js";
import { log } from "../core/logger.js";

/**
 * Direct Anthropic provider (Messages API via fetch — no extra SDK required).
 */
export class AnthropicModel implements ReviewModel {
  readonly name = "anthropic";
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ModelConfig) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    this.model = config.model || "claude-sonnet-4-20250514";
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  }

  async review(params: {
    diff: string;
    memoryContext: string;
    systemInstructions: string;
  }): Promise<string> {
    const content = await withRetry(
      async () => {
        const res = await fetch(`${this.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 8192,
            temperature: 0.15,
            system: params.systemInstructions,
            messages: [
              {
                role: "user",
                content: params.memoryContext,
              },
            ],
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const err: any = new Error(
            `Anthropic API ${res.status}: ${body.slice(0, 300)}`
          );
          err.status = res.status;
          throw err;
        }

        const data = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };

        const text = data.content
          ?.filter((b) => b.type === "text" && b.text)
          .map((b) => b.text)
          .join("\n")
          .trim();

        if (!text) throw new Error("Anthropic returned empty response");
        return text;
      },
      {
        retries: 3,
        onRetry: (err, attempt) => {
          log.warn("Anthropic call failed, retrying", {
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
