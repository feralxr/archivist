import { z } from "zod";
import type { ReviewModel } from "../models/provider.js";
import type {
  ReviewComment,
  ReviewResult,
  CommentSeverity,
  CommentCategory,
} from "../core/types.js";
import { memoryStore } from "../memory/store.js";
import { REVIEW_SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { log } from "../core/logger.js";
import { analyzeDiff } from "./diff-stats.js";
import { chunkDiff } from "./chunk.js";

const commentSchema = z.object({
  path: z.string(),
  line: z.number().int().positive().optional(),
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
    "testing",
    "docs",
    "other",
  ]),
  explanation: z.string().optional(),
});

const reviewResponseSchema = z.object({
  summary: z.string(),
  comments: z.array(commentSchema),
});

const MAX_COMMENTS = 8;
const MIN_BODY_LENGTH = 28;
const MAX_BODY_LENGTH = 1_200;

const SEVERITY_RANK: Record<CommentSeverity, number> = {
  error: 0,
  warning: 1,
  suggestion: 2,
  info: 3,
};

/** Phrases that usually mean low-signal nits */
const NOISE_PATTERNS = [
  /^consider adding a comment/i,
  /^you might want to/i,
  /^this looks fine/i,
  /^lgtm/i,
  /^nice work/i,
  /^trailing whitespace/i,
  /^missing semicolon\.?$/i,
  /^add a newline at end of file/i,
];

export class ReviewEngine {
  constructor(private model: ReviewModel) {}

  async review(params: {
    repoId: string;
    diff: string;
    title?: string;
    body?: string;
  }): Promise<ReviewResult> {
    const started = Date.now();
    const { repoId, diff, title, body } = params;
    const modelUsed = `${this.model.name}/${this.model.model}`;

    if (!diff || diff.trim().length < 10) {
      return {
        summary: "Empty or trivial diff — nothing to review.",
        comments: [],
        modelUsed,
        meta: { durationMs: Date.now() - started, diffChars: 0 },
      };
    }

    const stats = analyzeDiff(diff);
    log.info("Running review", {
      repoId: repoId.slice(0, 48),
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
        modelUsed,
        meta: {
          durationMs: Date.now() - started,
          diffChars: diff.length,
          diffStats: stats,
        },
      };
    }

    // Large multi-file diffs: review in chunks and merge
    const chunks = chunkDiff(diff);
    if (chunks.length > 1) {
      log.info("Chunked large diff", {
        chunks: chunks.length,
        totalChars: diff.length,
      });
      return this.reviewChunked({
        repoId,
        chunks,
        title,
        body,
        stats,
        modelUsed,
        started,
      });
    }

    const memoryContext = await memoryStore.buildContext(
      repoId,
      diff.slice(0, 6_000)
    );
    const memoryItemsUsed = countMemoryBullets(memoryContext);

    const effectiveTitle = stats.docsOnly
      ? `${title || "PR"} [docs-only change]`
      : title;

    const truncatedDiff = diff.length > 120_000;
    const userPrompt = buildUserPrompt({
      memoryContext,
      diff,
      title: effectiveTitle,
      body,
      diffStats: stats,
    });

    const raw = await this.model.review({
      diff,
      memoryContext: userPrompt,
      systemInstructions: REVIEW_SYSTEM_PROMPT,
    });

    const parsed = extractJSON(raw);
    let parseFallback = false;

    if (!parsed) {
      parseFallback = true;
      log.warn("Failed to parse model JSON", {
        preview: raw.slice(0, 200),
      });
      return {
        summary:
          truncate(raw, 500) ||
          "Model returned unparseable output. Retry or switch models.",
        comments: [],
        modelUsed,
        meta: {
          durationMs: Date.now() - started,
          memoryChars: memoryContext.length,
          memoryItemsUsed,
          diffChars: diff.length,
          diffStats: stats,
          truncatedDiff,
          parseFallback,
        },
      };
    }

    const validated = reviewResponseSchema.safeParse(parsed);
    if (!validated.success) {
      parseFallback = true;
      log.warn("Schema validation failed", {
        issues: validated.error.issues.slice(0, 3),
      });
      return {
        summary:
          typeof (parsed as any).summary === "string"
            ? String((parsed as any).summary).slice(0, 500)
            : "Model output failed schema validation.",
        comments: [],
        modelUsed,
        meta: {
          durationMs: Date.now() - started,
          memoryChars: memoryContext.length,
          memoryItemsUsed,
          diffChars: diff.length,
          diffStats: stats,
          truncatedDiff,
          parseFallback,
        },
      };
    }

    const changedPaths = extractPathsFromDiff(diff);
    const comments = postProcessComments(
      validated.data.comments,
      changedPaths,
      memoryContext
    );

    const summary =
      validated.data.summary.trim() ||
      (comments.length
        ? `Found ${comments.length} issue(s) worth attention.`
        : "No material issues found.");

    return {
      summary,
      comments,
      modelUsed,
      meta: {
        durationMs: Date.now() - started,
        memoryChars: memoryContext.length,
        memoryItemsUsed,
        diffChars: diff.length,
        diffStats: stats,
        truncatedDiff,
        parseFallback,
      },
    };
  }

  private async reviewChunked(params: {
    repoId: string;
    chunks: ReturnType<typeof chunkDiff>;
    title?: string;
    body?: string;
    stats: ReturnType<typeof analyzeDiff>;
    modelUsed: string;
    started: number;
  }): Promise<ReviewResult> {
    const { repoId, chunks, title, body, stats, modelUsed, started } = params;
    const allComments: ReviewComment[] = [];
    const summaries: string[] = [];
    let memoryItemsUsed = 0;
    let memoryChars = 0;
    let parseFallback = false;

    const maxChunks = Math.min(chunks.length, 4);
    const selected = chunks.slice(0, maxChunks);

    for (const chunk of selected) {
      const memoryContext = await memoryStore.buildContext(
        repoId,
        chunk.text.slice(0, 4_000)
      );
      memoryItemsUsed = Math.max(
        memoryItemsUsed,
        countMemoryBullets(memoryContext)
      );
      memoryChars = Math.max(memoryChars, memoryContext.length);

      const userPrompt = buildUserPrompt({
        memoryContext,
        diff: chunk.text,
        title: `${title || "PR"} [chunk ${chunk.index + 1}/${chunks.length}: ${chunk.paths.slice(0, 3).join(", ")}]`,
        body,
        diffStats: stats,
      });

      try {
        const raw = await this.model.review({
          diff: chunk.text,
          memoryContext: userPrompt,
          systemInstructions: REVIEW_SYSTEM_PROMPT,
        });
        const parsed = extractJSON(raw);
        if (!parsed) {
          parseFallback = true;
          continue;
        }
        const validated = reviewResponseSchema.safeParse(parsed);
        if (!validated.success) {
          parseFallback = true;
          continue;
        }
        if (validated.data.summary) summaries.push(validated.data.summary);
        const paths = new Set(chunk.paths);
        const comments = postProcessComments(
          validated.data.comments,
          paths,
          memoryContext
        );
        allComments.push(...comments);
      } catch (err) {
        log.warn("Chunk review failed", {
          chunk: chunk.index,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const seen = new Set<string>();
    const merged: ReviewComment[] = [];
    for (const c of allComments.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    )) {
      const key = `${c.path}:${c.line ?? ""}:${c.body.slice(0, 60).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
      if (merged.length >= MAX_COMMENTS) break;
    }

    const summary =
      summaries.slice(0, 3).join(" ") ||
      (merged.length
        ? `Reviewed ${selected.length} diff chunk(s); ${merged.length} issue(s) raised.`
        : `Reviewed ${selected.length} diff chunk(s); no material issues found.`);

    return {
      summary: summary.slice(0, 800),
      comments: merged,
      modelUsed,
      meta: {
        durationMs: Date.now() - started,
        memoryChars,
        memoryItemsUsed,
        diffChars: chunks.reduce((n, c) => n + c.chars, 0),
        diffStats: stats,
        truncatedDiff: chunks.length > maxChunks,
        parseFallback,
      },
    };
  }

}

function postProcessComments(
  raw: z.infer<typeof commentSchema>[],
  changedPaths: Set<string>,
  memoryContext: string
): ReviewComment[] {
  const seen = new Set<string>();
  const out: ReviewComment[] = [];

  for (const c of raw) {
    let body = (c.body || "").replace(/\s+/g, " ").trim();
    if (body.length < MIN_BODY_LENGTH) continue;
    if (body.length > MAX_BODY_LENGTH) body = body.slice(0, MAX_BODY_LENGTH - 1) + "…";
    if (NOISE_PATTERNS.some((re) => re.test(body))) continue;

    let path = (c.path || "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
    if (!path || path === "/dev/null") continue;

    // Prefer paths that appear in the diff; soft-filter unknowns
    if (changedPaths.size > 0 && !pathInDiff(path, changedPaths)) {
      // allow if basename matches
      const base = path.split("/").pop() || path;
      const hit = [...changedPaths].find((p) => p.endsWith("/" + base) || p === base);
      if (hit) path = hit;
      else continue;
    }

    const severity = c.severity as CommentSeverity;
    const category = c.category as CommentCategory;
    const key = `${path}:${c.line ?? ""}:${body.slice(0, 80).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const explanation = (c.explanation || "").trim() || undefined;
    const memoryRefs = explanation
      ? extractMemoryRefs(explanation, memoryContext)
      : [];

    // Confidence heuristic
    let confidence = 0.55;
    if (severity === "error") confidence += 0.15;
    if (explanation && /project|memory|style|architecture|prefer|avoid/i.test(explanation))
      confidence += 0.15;
    if (c.line) confidence += 0.05;
    if (category === "bug" || category === "security") confidence += 0.1;
    confidence = Math.min(0.95, confidence);

    out.push({
      path,
      line: c.line,
      body,
      severity,
      category,
      explanation,
      confidence,
      memoryRefs: memoryRefs.length ? memoryRefs : undefined,
    });
  }

  // Highest severity first, then confidence
  out.sort((a, b) => {
    const d = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (d !== 0) return d;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  return out.slice(0, MAX_COMMENTS);
}

function pathInDiff(path: string, changed: Set<string>): boolean {
  if (changed.has(path)) return true;
  for (const p of changed) {
    if (p.endsWith("/" + path) || path.endsWith("/" + p)) return true;
  }
  return false;
}

function extractPathsFromDiff(diff: string): Set<string> {
  const paths = new Set<string>();
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (m) {
        if (m[2] !== "/dev/null") paths.add(m[2]);
      }
    } else if (line.startsWith("+++ b/")) {
      const p = line.slice(6).trim();
      if (p && p !== "/dev/null") paths.add(p);
    }
  }
  return paths;
}

function extractMemoryRefs(explanation: string, memoryContext: string): string[] {
  const refs: string[] = [];
  const lines = memoryContext.split("\n").filter((l) => l.trim().startsWith("-"));
  const expl = explanation.toLowerCase();
  for (const line of lines.slice(0, 40)) {
    const text = line.replace(/^[-*]\s*/, "").trim();
    if (text.length < 12) continue;
    const needle = text.slice(0, 40).toLowerCase();
    if (expl.includes(needle.slice(0, 20))) {
      refs.push(text.slice(0, 80));
    }
  }
  return refs.slice(0, 3);
}

function countMemoryBullets(ctx: string): number {
  return ctx.split("\n").filter((l) => /^\s*[-*•]/.test(l)).length;
}

function extractJSON(text: string): unknown {
  const trimmed = text.trim();
  // Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  // Fenced block
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  // First { ... last }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* continue */
    }
  }
  return null;
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}
