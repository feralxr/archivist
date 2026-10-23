import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { getInstallationOctokit, createGitHubApp } from "./app.js";
import { ReviewEngine } from "../review/engine.js";
import { createModelFromEnv } from "../models/provider.js";
import { memoryStore } from "../memory/store.js";
import { ingestPullRequest } from "./ingest.js";
import { postReviewComments } from "./comments.js";
import { hasOpenRouter } from "../core/config.js";
import { log } from "../core/logger.js";
import { reviewQueue } from "../core/queue.js";
import { withRetry } from "../core/retry.js";

type PREvent = EmitterWebhookEvent<"pull_request">;

export async function handlePullRequestEvent(
  event: PREvent,
  action: "opened" | "synchronize"
) {
  const { payload } = event;
  const repo = payload.repository;
  const pr = payload.pull_request;
  const installationId = payload.installation?.id;

  if (!installationId) {
    log.warn("No installation ID — skipping");
    return;
  }

  if (!hasOpenRouter()) {
    log.warn("No OPENROUTER_API_KEY — cannot review");
    return;
  }

  if (action === "opened" && pr.draft) {
    log.info("Skipping draft PR", { repo: repo.full_name, pr: pr.number });
    return;
  }

  const repoId = String(repo.id);
  const repoFullName = repo.full_name;

  log.info("PR event received", {
    action,
    repo: repoFullName,
    pr: pr.number,
    title: pr.title,
  });

  // Serialize heavy review work
  await reviewQueue.run(async () => {
    try {
      await memoryStore.getOrCreate(repoId, repoFullName);

      const app = createGitHubApp();
      const octokit = await getInstallationOctokit(app, installationId);

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

      if (diffText.length > 400_000) {
        log.warn("Diff too large — posting notice", {
          repo: repoFullName,
          pr: pr.number,
          size: diffText.length,
        });
        await octokit.issues.createComment({
          owner: repo.owner.login,
          repo: repo.name,
          issue_number: pr.number,
          body: "### Archivist\n\nThis PR is too large for a full automated review. Consider splitting it into smaller changes.",
        });
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
        commitId: pr.head.sha,
        result,
      });
    } catch (err) {
      log.error("Handler failed", {
        repo: repoFullName,
        pr: pr.number,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
