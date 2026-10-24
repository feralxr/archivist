import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { getInstallationOctokit, createGitHubApp } from "./app.js";
import { ReviewEngine } from "../review/engine.js";
import { createModelFromEnv } from "../models/provider.js";
import { memoryStore } from "../memory/store.js";
import { ingestPullRequest } from "./ingest.js";
import { postReviewComments } from "./comments.js";
import { publishCheckRun } from "./checks.js";
import { hasAnyModelKey } from "../core/config.js";
import { log } from "../core/logger.js";
import { reviewQueue } from "../core/queue.js";
import { withRetry } from "../core/retry.js";
import { metrics } from "../core/metrics.js";

type PREvent = EmitterWebhookEvent<"pull_request">;

/** Simple in-memory dedupe: installation+repo+pr+headSha */
const recentlyReviewed = new Map<string, number>();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

function dedupeKey(installationId: number, repoId: number, pr: number, sha: string) {
  return `${installationId}:${repoId}:${pr}:${sha}`;
}

function alreadyReviewed(key: string): boolean {
  const ts = recentlyReviewed.get(key);
  if (!ts) return false;
  if (Date.now() - ts > DEDUPE_TTL_MS) {
    recentlyReviewed.delete(key);
    return false;
  }
  return true;
}

function markReviewed(key: string) {
  recentlyReviewed.set(key, Date.now());
  // opportunistic cleanup
  if (recentlyReviewed.size > 500) {
    const cutoff = Date.now() - DEDUPE_TTL_MS;
    for (const [k, v] of recentlyReviewed) {
      if (v < cutoff) recentlyReviewed.delete(k);
    }
  }
}

export async function handlePullRequestEvent(
  event: PREvent,
  action: "opened" | "synchronize"
) {
  const { payload } = event;
  const repo = payload.repository;
  const pr = payload.pull_request;
  const installationId = (payload as { installation?: { id: number } }).installation?.id;

  if (!installationId) {
    log.warn("No installation ID — skipping");
    return;
  }

  if (!hasAnyModelKey()) {
    log.warn("No model API key (OpenRouter / Anthropic / OpenAI) — cannot review");
    return;
  }

  // Skip drafts on open
  if (action === "opened" && pr.draft) {
    log.info("Skipping draft PR", { repo: repo.full_name, pr: pr.number });
    return;
  }

  // Skip if PR has archivist:skip label
  const labels = (pr.labels || []).map((l: any) =>
    (typeof l === "string" ? l : l.name || "").toLowerCase()
  );
  if (labels.includes("archivist:skip") || labels.includes("skip-archivist")) {
    log.info("Skipping PR with archivist:skip label", {
      repo: repo.full_name,
      pr: pr.number,
    });
    return;
  }

  // Skip bot-authored PRs (Dependabot, renovate, etc.)
  const authorLogin = pr.user?.login?.toLowerCase() || "";
  const authorType = pr.user?.type;
  if (
    authorType === "Bot" ||
    authorLogin.endsWith("[bot]") ||
    authorLogin.includes("dependabot") ||
    authorLogin.includes("renovate")
  ) {
    log.info("Skipping bot PR", { repo: repo.full_name, pr: pr.number, author: authorLogin });
    return;
  }

  const headSha = pr.head.sha;
  const key = dedupeKey(installationId, repo.id, pr.number, headSha);
  if (alreadyReviewed(key)) {
    log.info("Already reviewed this head SHA — skipping", {
      repo: repo.full_name,
      pr: pr.number,
      sha: headSha.slice(0, 7),
    });
    return;
  }

  const repoId = String(repo.id);
  const repoFullName = repo.full_name;

  log.info("PR event received", {
    action,
    repo: repoFullName,
    pr: pr.number,
    title: pr.title,
    sha: headSha.slice(0, 7),
  });

  await reviewQueue.run(async () => {
    // re-check dedupe inside queue
    if (alreadyReviewed(key)) return;

    metrics.inc("reviewsStarted");
    try {
      await memoryStore.getOrCreate(repoId, repoFullName);

      const app = createGitHubApp();
      const octokit = await getInstallationOctokit(app, installationId);

      // Fetch diff
      const response = await withRetry(() =>
        octokit.pulls.get({
          owner: repo.owner.login,
          repo: repo.name,
          pull_number: pr.number,
          mediaType: { format: "diff" },
        })
      );

      const diffText =
        typeof response.data === "string"
          ? response.data
          : String(response.data);

      if (!diffText || diffText.length < 10) {
        log.info("Empty diff — skipping", { repo: repoFullName, pr: pr.number });
        return;
      }

      // Large PR soft limit
      if (diffText.length > 350_000) {
        log.warn("Diff too large", {
          repo: repoFullName,
          pr: pr.number,
          size: diffText.length,
        });
        await withRetry(() =>
          octokit.issues.createComment({
            owner: repo.owner.login,
            repo: repo.name,
            issue_number: pr.number,
            body:
              "### Archivist\n\nThis PR is too large for a full automated review " +
              `(~${Math.round(diffText.length / 1000)}k characters of diff). ` +
              "Consider splitting it into smaller changes.",
          })
        );
        markReviewed(key);
        return;
      }

      if (action === "opened") {
        await ingestPullRequest(octokit, {
          owner: repo.owner.login,
          repo: repo.name,
          pullNumber: pr.number,
          repoId,
        });
      }

      const model = createModelFromEnv();
      const engine = new ReviewEngine(model);

      const result = await engine.review({
        repoId,
        diff: diffText,
        title: pr.title,
        body: pr.body || undefined,
      });

      log.info("Review complete", {
        repo: repoFullName,
        pr: pr.number,
        comments: result.comments.length,
        model: result.modelUsed,
      });

      await postReviewComments(octokit, {
        owner: repo.owner.login,
        repo: repo.name,
        pullNumber: pr.number,
        commitId: headSha,
        result,
      });

      await publishCheckRun(octokit, {
        owner: repo.owner.login,
        repo: repo.name,
        headSha,
        result,
      });

      markReviewed(key);
      metrics.inc("reviewsCompleted");
      metrics.inc("commentsPosted", result.comments.length);
    } catch (err) {
      metrics.inc("reviewsFailed");
      log.error("Handler failed", {
        repo: repoFullName,
        pr: pr.number,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
