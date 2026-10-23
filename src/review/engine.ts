import { z } from "zod";
import type { ReviewModel } from "../models/provider.js";
import type { ReviewComment, ReviewResult } from "../core/types.js";
import { memoryStore } from "../memory/store.js";

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

const SYSTEM_PROMPT = `You are Archivist, an expert code reviewer with deep knowledge of this specific repository.

You have been given the project's living memory (style rules, architecture decisions, preferred/discouraged patterns, and historical review feedback).

Your job:
1. Review the diff carefully.
2. Only leave high-signal comments. Prefer fewer, better comments over noise.
3. When a comment relates to project memory, explain the connection briefly.
4. Focus on:
   - Violations of established style/architecture
   - Inconsistencies with historical preferences
   - Real bugs or risks
   - Clear refactor opportunities that match team patterns

Output ONLY valid JSON in this exact shape:
{
  "summary": "Short overall assessment",
  "comments": [
    {
      "path": "file/path.ts",
      "line": 42,
      "body": "Clear, actionable comment",
      "severity": "warning",
      "category": "style",
      "explanation": "Optional: why this matters given project memory"
    }
  ]
}

Rules:
- If there are no real issues, return an empty comments array and a positive summary.
- Never invent issues just to have comments.
- Be specific and reference the code.`;

export class ReviewEngine {
  constructor(private model: ReviewModel) {}

  async review(params: {
    repoId: string;
    diff: string;
    title?: string;
    body?: string;
  }): Promise<ReviewResult> {
    const { repoId, diff, title, body } = params;

    const memoryContext = await memoryStore.buildContext(repoId, diff.slice(0, 2000));

    const extraContext = [
      title ? `PR Title: ${title}` : null,
      body ? `PR Description: ${body}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const fullMemory = extraContext
      ? `${memoryContext}\n\n### PR Context\n${extraContext}`
      : memoryContext;

    const raw = await this.model.review({
      diff,
      memoryContext: fullMemory,
      systemInstructions: SYSTEM_PROMPT,
    });

    // Try to extract JSON from the response
    const parsed = extractJSON(raw);

    if (!parsed) {
      // Fallback: treat entire response as summary
      return {
        summary: raw.slice(0, 500),
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    const validated = reviewResponseSchema.safeParse(parsed);

    if (!validated.success) {
      return {
        summary: "Model returned unstructured output",
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    return {
      summary: validated.data.summary,
      comments: validated.data.comments as ReviewComment[],
      modelUsed: `${this.model.name}/${this.model.model}`,
    };
  }
}

function extractJSON(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to find JSON block
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
