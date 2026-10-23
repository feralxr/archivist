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

export async function postReviewComments(
  octokit: Octokit,
  options: PostOptions
) {
  const { owner, repo, pullNumber, commitId, result } = options;

  let body = `### Archivist Review\n\n${result.summary}\n\n`;
  body += `_Model: ${result.modelUsed}_\n`;

  const comments = result.comments
    .filter((c) => c.path)
    .map((c) => formatComment(c));

  try {
    await withRetry(() =>
      octokit.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        event: result.comments.some((c) => c.severity === "error")
          ? "REQUEST_CHANGES"
          : "COMMENT",
        body,
        comments: comments.length
          ? comments.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            }))
          : undefined,
      })
    );

    log.info("Posted review", {
      repo: `${owner}/${repo}`,
      pr: pullNumber,
      inline: comments.length,
    });
  } catch (err: any) {
    log.warn("createReview failed, falling back to issue comment", {
      error: err?.message,
    });

    let fallback = body + "\n\n";
    for (const c of result.comments) {
      fallback += `**${c.path}${c.line ? `:${c.line}` : ""}** (${c.severity}/${c.category})\n`;
      fallback += `> ${c.body}\n\n`;
    }

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

function formatComment(c: ReviewComment) {
  let body = c.body;
  if (c.explanation) {
    body += `\n\n*Why this matters: ${c.explanation}*`;
  }
  body += `\n\n<!-- archivist:${c.category}:${c.severity} -->`;
  return { path: c.path, line: c.line, body };
}
