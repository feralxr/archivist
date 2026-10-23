import { z } from "zod";
import type { ReviewModel } from "../models/provider.js";
import type { ReviewComment, ReviewResult } from "../core/types.js";
import { memoryStore } from "../memory/store.js";
import { REVIEW_SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";

const commentSchema = z.object({
  path: z.string(),
  line: z.number().optional(),
  body: z.string(),
  severity: z.enum(["info", "warning", "error", "suggestion"]),
  category: z.enum([
    "style",
    "architecture",
    "history",
    "bug",
    "refactor",
    "security",
    "performance",
    "other",
  ]),
  explanation: z.string().optional(),
});

const reviewResponseSchema = z.object({
  summary: z.string(),
  comments: z.array(commentSchema),
});

export class ReviewEngine {
  constructor(private model: ReviewModel) {}

  async review(params: {
    repoId: string;
    diff: string;
    title?: string;
    body?: string;
  }): Promise<ReviewResult> {
    const { repoId, diff, title, body } = params;

    const memoryContext = await memoryStore.buildContext(
      repoId,
      diff.slice(0, 3000)
    );

    const userPrompt = buildUserPrompt({
      memoryContext,
      diff,
      title,
      body,
    });

    const raw = await this.model.review({
      diff,
      memoryContext: userPrompt,
      systemInstructions: REVIEW_SYSTEM_PROMPT,
    });

    const parsed = extractJSON(raw);

    if (!parsed) {
      return {
        summary: raw.slice(0, 600) || "Model returned no usable output",
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    const validated = reviewResponseSchema.safeParse(parsed);

    if (!validated.success) {
      console.warn(
        "[review] Schema validation failed",
        validated.error.flatten()
      );
      return {
        summary: "Model returned unstructured output",
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    const comments: ReviewComment[] = validated.data.comments
      .filter((c) => c.body.trim().length > 0)
      .map((c) => ({
        ...c,
        body: c.body.trim(),
      }));

    return {
      summary: validated.data.summary.trim(),
      comments,
      modelUsed: `${this.model.name}/${this.model.model}`,
    };
  }
}

function extractJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // fall through
      }
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
