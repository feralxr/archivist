import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { memoryStore } from "../memory/store.js";
import { getInstallationOctokit, createGitHubApp } from "./app.js";

type ReviewEvent = EmitterWebhookEvent<"pull_request_review">;

/**
 * Learn from human-submitted reviews.
 * High-signal comments get folded into project memory.
 */
export async function handleReviewSubmitted(event: ReviewEvent) {
  const { payload } = event;
  const repo = payload.repository;
  const pr = payload.pull_request;
  const review = payload.review;
  const installationId = payload.installation?.id;

  // Ignore our own reviews
  if (review.user?.type === "Bot") return;
  if (!installationId) return;

  const repoId = String(repo.id);
  const repoFullName = repo.full_name;

  console.log(
    `[learn] Human review on ${repoFullName}#${pr.number} by @${review.user?.login}`
  );

  try {
    await memoryStore.getOrCreate(repoId, repoFullName);

    const app = createGitHubApp();
    const octokit = await getInstallationOctokit(app, installationId);

    // Fetch review comments for this review
    const { data: comments } = await octokit.pulls.listReviewComments({
      owner: repo.owner.login,
      repo: repo.name,
      pull_number: pr.number,
    });

    // Only comments that belong to this review (approx by time/user)
    const humanComments = comments.filter(
      (c) =>
        c.user?.login === review.user?.login &&
        c.body &&
        c.body.length > 25 &&
        c.user?.type !== "Bot"
    );

    for (const comment of humanComments) {
      await memoryStore.addRawSnippet(repoId, {
        text: comment.body,
        path: comment.path,
        prNumber: pr.number,
        author: comment.user?.login,
        createdAt: comment.created_at,
      });

      // Promote short, clear feedback into historical feedback
      if (comment.body.length < 280 && comment.body.length > 30) {
        await memoryStore.addHistoricalFeedback(repoId, {
          summary: comment.body.replace(/\s+/g, " ").trim(),
          prNumber: pr.number,
          frequency: 1,
          lastSeen: new Date().toISOString(),
        });
      }
    }

    // Also capture the top-level review body if present
    if (review.body && review.body.length > 40) {
      await memoryStore.addRawSnippet(repoId, {
        text: review.body,
        prNumber: pr.number,
        author: review.user?.login,
        createdAt: review.submitted_at || new Date().toISOString(),
      });
    }

    console.log(
      `[learn] Ingested ${humanComments.length} human comments into memory`
    );
  } catch (err) {
    console.error("[learn] Failed", err);
  }
}
