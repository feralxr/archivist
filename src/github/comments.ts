import type { Octokit } from "@octokit/rest";
import type { ReviewResult, ReviewComment } from "../core/types.js";

interface PostOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  commitId: string;
  result: ReviewResult;
}

/**
 * Posts a review on the pull request.
 * Uses a single review with multiple comments for clean UX.
 */
export async function postReviewComments(
  octokit: Octokit,
  options: PostOptions
) {
  const { owner, repo, pullNumber, commitId, result } = options;

  // Build the review body (summary)
  let body = `### Archivist Review\n\n${result.summary}\n\n`;
  body += `_Model: ${result.modelUsed}_\n`;

  // Map our comments into GitHub review comments
  const comments = result.comments
    .filter((c) => c.path) // must have a path
    .map((c) => formatComment(c));

  // GitHub allows creating a review with comments in one call
  try {
    await octokit.pulls.createReview({
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
    });

    console.log(
      `[comments] Posted review on ${owner}/${repo}#${pullNumber} (${comments.length} inline comments)`
    );
  } catch (err: any) {
    // Fallback: if multi-comment review fails (e.g. line positions), post a simple issue comment
    console.warn("[comments] createReview failed, falling back to issue comment", err?.message);

    let fallback = body + "\n\n";
    for (const c of result.comments) {
      fallback += `**${c.path}${c.line ? `:${c.line}` : ""}** (${c.severity}/${c.category})\n`;
      fallback += `> ${c.body}\n\n`;
    }

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: fallback,
    });
  }
}

function formatComment(c: ReviewComment) {
  let body = c.body;
  if (c.explanation) {
    body += `\n\n*Why this matters: ${c.explanation}*`;
  }
  body += `\n\n<!-- archivist:${c.category}:${c.severity} -->`;

  return {
    path: c.path,
    line: c.line,
    body,
  };
}
