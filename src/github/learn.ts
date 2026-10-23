import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { memoryStore } from "../memory/store.js";
import { getInstallationOctokit, createGitHubApp } from "./app.js";
import { promoteFeedback } from "../memory/learn.js";
import { log } from "../core/logger.js";

type ReviewEvent = EmitterWebhookEvent<"pull_request_review">;

/**
 * Learn from human-submitted reviews — core of the learning loop.
 */
export async function handleReviewSubmitted(event: ReviewEvent) {
  const { payload } = event;
  const repo = payload.repository;
  const pr = payload.pull_request;
  const review = payload.review;
  const installationId = payload.installation?.id;

  if (review.user?.type === "Bot") return;
  if (!installationId) return;

  // Ignore our own bot reviews
  const login = review.user?.login?.toLowerCase() || "";
  if (login.includes("archivist")) return;

  const repoId = String(repo.id);
  const repoFullName = repo.full_name;

  log.info("Learning from human review", {
    repo: repoFullName,
    pr: pr.number,
    reviewer: review.user?.login,
    state: review.state,
  });

  try {
    await memoryStore.getOrCreate(repoId, repoFullName);

    const app = createGitHubApp();
    const octokit = await getInstallationOctokit(app, installationId);

    const { data: comments } = await octokit.pulls.listReviewComments({
      owner: repo.owner.login,
      repo: repo.name,
      pull_number: pr.number,
    });

    const humanComments = comments.filter(
      (c) =>
        c.user?.login === review.user?.login &&
        c.body &&
        c.body.length > 25 &&
        c.user?.type !== "Bot"
    );

    let ingested = 0;

    for (const comment of humanComments) {
      await memoryStore.addRawSnippet(repoId, {
        text: comment.body,
        path: comment.path,
        prNumber: pr.number,
        author: comment.user?.login,
        createdAt: comment.created_at,
      });

      // Promote concise actionable comments into historical feedback
      if (comment.body.length >= 30 && comment.body.length <= 280) {
        await memoryStore.addHistoricalFeedback(repoId, {
          summary: comment.body.replace(/\s+/g, " ").trim(),
          prNumber: pr.number,
          frequency: 1,
          lastSeen: comment.created_at,
        });
      }
      ingested++;
    }

    if (review.body && review.body.length > 40) {
      await memoryStore.addRawSnippet(repoId, {
        text: review.body,
        prNumber: pr.number,
        author: review.user?.login,
        createdAt: review.submitted_at || new Date().toISOString(),
      });
    }

    // Periodically promote frequent feedback into durable rules
    const { promoted } = await promoteFeedback(repoId);

    log.info("Learning pass complete", {
      repo: repoFullName,
      pr: pr.number,
      ingested,
      promoted,
    });
  } catch (err) {
    log.error("Learning failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
