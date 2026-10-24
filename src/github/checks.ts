import type { Octokit } from "@octokit/rest";
import type { ReviewResult } from "../core/types.js";
import { withRetry } from "../core/retry.js";
import { log } from "../core/logger.js";

/**
 * Publish a GitHub Check Run summarizing the Archivist review.
 * Requires "Checks: Read & write" on the GitHub App (optional — fails soft).
 */
export async function publishCheckRun(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    headSha: string;
    result: ReviewResult;
  }
): Promise<void> {
  const { owner, repo, headSha, result } = opts;

  const errors = result.comments.filter((c) => c.severity === "error").length;
  const warnings = result.comments.filter((c) => c.severity === "warning").length;
  const suggestions = result.comments.filter(
    (c) => c.severity === "suggestion" || c.severity === "info"
  ).length;

  const conclusion =
    errors > 0 ? "failure" : warnings > 0 ? "neutral" : "success";

  const title =
    errors > 0
      ? `${errors} error(s) found`
      : warnings > 0
        ? `${warnings} warning(s)`
        : result.comments.length === 0
          ? "No issues found"
          : `${result.comments.length} suggestion(s)`;

  const summaryLines = [
    result.summary,
    "",
    `| Severity | Count |`,
    `| -------- | ----- |`,
    `| Error | ${errors} |`,
    `| Warning | ${warnings} |`,
    `| Suggestion/Info | ${suggestions} |`,
    "",
    `_Model: ${result.modelUsed}_`,
  ];

  try {
    await withRetry(() =>
      octokit.request("POST /repos/{owner}/{repo}/check-runs", {
        owner,
        repo,
        name: "Archivist",
        head_sha: headSha,
        status: "completed",
        conclusion,
        output: {
          title,
          summary: summaryLines.join("\n"),
        },
      })
    );
    log.info("Published check run", { owner, repo, conclusion, title });
  } catch (err: any) {
    // App may not have Checks permission — non-fatal
    log.warn("Could not publish check run (is Checks permission enabled?)", {
      error: err?.message || String(err),
    });
  }
}
