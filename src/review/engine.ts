import { z } from "zod";
import type { ReviewModel } from "../models/provider.js";
import type { ReviewComment, ReviewResult } from "../core/types.js";
import { memoryStore } from "../memory/store.js";
import { REVIEW_SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { log } from "../core/logger.js";
import { analyzeDiff } from "./diff-stats.js";

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

/** Max inline comments we will ever post — hard noise ceiling */
const MAX_COMMENTS = 8;

/** Drop comments whose body is too vague / short */
const MIN_BODY_LENGTH = 24;

export class ReviewEngine {
  constructor(private model: ReviewModel) {}

  async review(params: {
    repoId: string;
    diff: string;
    title?: string;
    body?: string;
  }): Promise<ReviewResult> {
    const { repoId, diff, title, body } = params;

    if (!diff || diff.trim().length < 10) {
      return {
        summary: "Empty or trivial diff — nothing to review.",
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    const stats = analyzeDiff(diff);
    log.info("Running review", {
      repoId: repoId.slice(0, 32),
      diffChars: diff.length,
      files: stats.files,
      codeFiles: stats.codeFiles,
      docsOnly: stats.docsOnly,
      model: this.model.model,
    });

    const skipDocs =
      (process.env.ARCHIVIST_SKIP_DOCS_ONLY || "").toLowerCase() === "true" ||
      process.env.ARCHIVIST_SKIP_DOCS_ONLY === "1";
    if (skipDocs && stats.docsOnly) {
      return {
        summary:
          "Docs-only change detected; skipped detailed review (ARCHIVIST_SKIP_DOCS_ONLY).",
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    const memoryContext = await memoryStore.buildContext(
      repoId,
      diff.slice(0, 4000)
    );

    const effectiveTitle = stats.docsOnly
      ? `${title || "PR"} [docs-only change]`
      : title;

    const userPrompt = buildUserPrompt({
      memoryContext,
      diff,
      title: effectiveTitle,
      body,
    });

    const raw = await this.model.review({
      diff,
      memoryContext: userPrompt,
      systemInstructions: REVIEW_SYSTEM_PROMPT,
    });

    const parsed = extractJSON(raw);

    if (!parsed) {
      log.warn("Failed to parse model JSON", {
        preview: raw.slice(0, 200),
      });
      return {
        summary: truncate(raw, 500) || "Model returned unparseable output.",
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    const validated = reviewResponseSchema.safeParse(parsed);

    if (!validated.success) {
      log.warn("Schema validation failed", {
        issues: validated.error.flatten(),
      });
      return {
        summary: "Model returned unstructured output.",
        comments: [],
        modelUsed: `${this.model.name}/${this.model.model}`,
      };
    }

    const comments = postProcessComments(validated.data.comments);

    return {
      summary: validated.data.summary.trim(),
      comments,
      modelUsed: `${this.model.name}/${this.model.model}`,
    };
  }
}

/**
 * Industry-level filtering: kill noise before it reaches the PR.
 */
function postProcessComments(
  comments: z.infer<typeof commentSchema>[]
): ReviewComment[] {
  const severityRank = { error: 0, warning: 1, suggestion: 2, info: 3 };

  const cleaned = comments
    .filter((c) => c.path && c.path.length > 0)
    .filter((c) => c.body && c.body.trim().length >= MIN_BODY_LENGTH)
    // Drop pure praise disguised as comments
    .filter((c) => {
      const b = c.body.toLowerCase();
      if (b.includes("looks good") && b.length < 60) return false;
      if (b.includes("lgtm")) return false;
      return true;
    })
    .map((c) => ({
      ...c,
      body: c.body.trim(),
      explanation: c.explanation?.trim() || undefined,
    }));

  // Prefer higher severity, then keep stable order
  cleaned.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  );

  // Deduplicate near-identical bodies on same path
  const seen = new Set<string>();
  const deduped: ReviewComment[] = [];
  for (const c of cleaned) {
    const key = `${c.path}:${c.body.slice(0, 80).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  return deduped.slice(0, MAX_COMMENTS);
}

function extractJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // fenced
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // fall through
      }
    }
    // largest object
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

function truncate(s: string, n: number) {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n) + "…";
}
