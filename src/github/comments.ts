import type { Octokit } from "@octokit/rest";
import type { ReviewResult, ReviewComment } from "../core/types.js";
import { withRetry } from "../core/retry.js";
import { log } from "../core/logger.js";

interface PostOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
  result: ReviewResult;
}

/**
 * Posts a single GitHub review with optional inline comments.
 * Skips if Archivist already reviewed this exact commit.
 * Falls back to issue comment if inline positioning fails.
 */
export async function postReviewComments(
  octokit: Octokit,
  options: PostOptions
): Promise<{ posted: boolean; mode: "review" | "issue" | "skipped" }> {
  const { owner, repo, pullNumber, commitId, result } = options;

  // Idempotency: skip if we already left a review on this commit
  try {
    const already = await hasArchivistReviewOnCommit(octokit, {
      owner,
      repo,
      pullNumber,
      commitId,
    });
    if (already) {
      log.info("Skipping post — Archivist review already present for commit", {
        repo: `${owner}/${repo}`,
        pr: pullNumber,
        sha: commitId.slice(0, 7),
      });
      return { posted: false, mode: "skipped" };
    }
  } catch (err) {
    log.warn("Could not check existing reviews", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const body = buildReviewBody(result);

  const inline = result.comments
    .filter((c) => c.path)
    .map((c) => toInline(c))
    .filter((c) => c.body.length > 0);

  const hasError = result.comments.some((c) => c.severity === "error");
  const allowRequestChanges =
    (process.env.ARCHIVIST_REQUEST_CHANGES || "").toLowerCase() === "true" ||
    process.env.ARCHIVIST_REQUEST_CHANGES === "1";
  const event: "REQUEST_CHANGES" | "COMMENT" =
    hasError && allowRequestChanges ? "REQUEST_CHANGES" : "COMMENT";

  // Attempt 1: full review with inline comments
  try {
    await withRetry(() =>
      octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        event,
        body,
        comments:
          inline.length > 0
            ? inline.map((c) => ({
                path: c.path,
                ...(c.line ? { line: c.line } : {}),
                body: c.body,
              }))
            : undefined,
      })
    );

    log.info("Posted review", {
      repo: `${owner}/${repo}`,
      pr: pullNumber,
      event,
      inline: inline.length,
    });
    return { posted: true, mode: "review" };
  } catch (err: any) {
    log.warn("createReview with inline failed; retrying summary-only", {
      error: err?.message,
    });
  }

  // Attempt 2: review body only (no inline — avoids invalid line positions)
  try {
    await withRetry(() =>
      octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        event,
        body: buildFallbackBody(result, body),
      })
    );
    log.info("Posted summary-only review", {
      repo: `${owner}/${repo}`,
      pr: pullNumber,
    });
    return { posted: true, mode: "review" };
  } catch (err: any) {
    log.warn("createReview failed, falling back to issue comment", {
      error: err?.message,
    });
  }

  // Attempt 3: issue comment
  await withRetry(() =>
    octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: buildFallbackBody(result, body),
    })
  );
  return { posted: true, mode: "issue" };
}

async function hasArchivistReviewOnCommit(
  octokit: Octokit,
  opts: { owner: string; repo: string; pullNumber: number; commitId: string }
): Promise<boolean> {
  const { data: reviews } = await octokit.pulls.listReviews({
    owner: opts.owner,
    repo: opts.repo,
    pull_number: opts.pullNumber,
    per_page: 30,
  });

  for (const r of reviews) {
    if (r.commit_id !== opts.commitId) continue;
    const body = r.body || "";
    if (body.includes("<!-- archivist-model:") || body.includes("### Archivist Review")) {
      return true;
    }
    const login = r.user?.login?.toLowerCase() || "";
    if (login.includes("archivist")) return true;
  }
  return false;
}

function buildReviewBody(result: ReviewResult): string {
  const lines: string[] = [];
  lines.push("### Archivist Review");
  lines.push("");
  lines.push(result.summary.trim());
  lines.push("");

  if (result.comments.length === 0) {
    lines.push("_No blocking issues found._");
  } else {
    const errors = result.comments.filter((c) => c.severity === "error").length;
    const warnings = result.comments.filter((c) => c.severity === "warning").length;
    const rest = result.comments.length - errors - warnings;
    const parts: string[] = [];
    if (errors) parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
    if (warnings) parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
    if (rest) parts.push(`${rest} suggestion${rest > 1 ? "s" : ""}`);
    lines.push(`_${parts.join(" · ")} — see inline comments._`);
  }

  lines.push("");
  lines.push(`<!-- archivist-model:${result.modelUsed} -->`);
  lines.push(`<!-- archivist-commit:${result.meta?.diffChars ?? ""} -->`);
  return lines.join("\n");
}

function sanitizeBody(s: string): string {
  return s.replace(/\0/g, "").replace(/[\u2028\u2029]/g, " ").slice(0, 65000);
}

function toInline(c: ReviewComment) {
  let body = sanitizeBody(c.body.trim());
  if (c.explanation) {
    body += `\n\n> **Why:** ${c.explanation}`;
  }
  if (c.memoryRefs?.length) {
    body += `\n> **Memory:** ${c.memoryRefs.slice(0, 2).join(" · ")}`;
  }
  const badge =
    c.severity === "error"
      ? "🔴"
      : c.severity === "warning"
        ? "🟡"
        : c.severity === "suggestion"
          ? "🔵"
          : "⚪";
  const conf =
    typeof c.confidence === "number"
      ? ` · ${Math.round(c.confidence * 100)}%`
      : "";
  body = `${badge} **${c.severity}** · \`${c.category}\`${conf}\n\n${body}`;
  body += `\n\n<!-- archivist:${c.category}:${c.severity} -->`;
  return { path: c.path, line: c.line, body };
}

function buildFallbackBody(result: ReviewResult, header: string): string {
  const lines = [header, ""];
  for (const c of result.comments) {
    const loc = c.line ? `${c.path}:${c.line}` : c.path;
    lines.push(`**${loc}** (${c.severity} / ${c.category})`);
    lines.push(`> ${c.body}`);
    if (c.explanation) lines.push(`> _${c.explanation}_`);
    lines.push("");
  }
  return lines.join("\n");
}
