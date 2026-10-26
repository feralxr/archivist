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
 * Falls back to an issue comment if inline positioning fails.
 */
export async function postReviewComments(
  octokit: Octokit,
  options: PostOptions
) {
  const { owner, repo, pullNumber, commitId, result } = options;

  const body = buildReviewBody(result);

  const inline = result.comments
    .filter((c) => c.path)
    .map((c) => toInline(c))
    .filter((c) => c.body.length > 0);

  // Default COMMENT — REQUEST_CHANGES can block merges unexpectedly.
  // Opt in with ARCHIVIST_REQUEST_CHANGES=true
  const hasError = result.comments.some((c) => c.severity === "error");
  const allowRequestChanges =
    (process.env.ARCHIVIST_REQUEST_CHANGES || "").toLowerCase() === "true" ||
    process.env.ARCHIVIST_REQUEST_CHANGES === "1";
  const event: "REQUEST_CHANGES" | "COMMENT" =
    hasError && allowRequestChanges ? "REQUEST_CHANGES" : "COMMENT";

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
  } catch (err: any) {
    log.warn("createReview failed, falling back to issue comment", {
      error: err?.message,
    });

    const fallback = buildFallbackBody(result, body);
    await withRetry(() =>
      octokit.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: fallback,
      })
    );
  }
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
