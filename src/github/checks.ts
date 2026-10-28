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
    "| Severity | Count |",
    "| -------- | ----- |",
    `| Error | ${errors} |`,
    `| Warning | ${warnings} |`,
    `| Suggestion/Info | ${suggestions} |`,
    "",
  ];

  if (result.comments.length) {
    summaryLines.push("### Findings", "");
    for (const c of result.comments.slice(0, 8)) {
      const loc = c.line ? `${c.path}:${c.line}` : c.path;
      summaryLines.push(
        `- **${c.severity}** \`${loc}\` (${c.category}) — ${c.body.slice(0, 160)}`
      );
      if (c.explanation) {
        summaryLines.push(`  - _Why: ${c.explanation.slice(0, 120)}_`);
      }
    }
    summaryLines.push("");
  }

  if (result.meta) {
    const m = result.meta;
    summaryLines.push("### Run meta", "");
    if (m.promptProfile) {
      summaryLines.push(`- Profile: \`${m.promptProfile}\``);
    }
    if (m.diffStats) {
      summaryLines.push(
        `- Diff: ${m.diffStats.files} files, +${m.diffStats.added}/-${m.diffStats.removed}` +
          (m.diffStats.docsOnly ? " (docs-only)" : "") +
          (m.diffStats.mostlyGenerated ? " (mostly generated)" : "")
      );
    }
    if (m.memoryItemsUsed != null) {
      summaryLines.push(`- Memory items used: ${m.memoryItemsUsed}`);
    }
    if (m.durationMs != null) {
      summaryLines.push(`- Duration: ${m.durationMs}ms`);
    }
    if (m.truncatedDiff) summaryLines.push("- Note: large diff was chunked/truncated");
    summaryLines.push("");
  }

  summaryLines.push(`_Model: ${result.modelUsed}_`);

  // Annotations (max 50 per GitHub API)
  const annotations = result.comments
    .filter((c) => c.path && c.line)
    .slice(0, 50)
    .map((c) => ({
      path: c.path,
      start_line: c.line!,
      end_line: c.line!,
      annotation_level:
        c.severity === "error"
          ? ("failure" as const)
          : c.severity === "warning"
            ? ("warning" as const)
            : ("notice" as const),
      message: c.body.slice(0, 64_000),
      title: `${c.severity} · ${c.category}`,
    }));

  try {
    await withRetry(() =>
      octokit.request("POST /repos/{owner}/{repo}/check-runs", {
        owner,
        repo,
        name: result.meta?.promptProfile
          ? `Archivist (${result.meta.promptProfile})`
          : "Archivist",
        head_sha: headSha,
        status: "completed",
        conclusion,
        output: {
          title,
          summary: summaryLines.join("\n"),
          annotations: annotations.length ? annotations : undefined,
        },
      })
    );
    log.info("Published check run", {
      owner,
      repo,
      conclusion,
      title,
      annotations: annotations.length,
    });
  } catch (err: any) {
    log.warn("Could not publish check run (is Checks permission enabled?)", {
      error: err?.message || String(err),
    });
  }
}
