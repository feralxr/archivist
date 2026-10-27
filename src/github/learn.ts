import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { memoryStore } from "../memory/store.js";
import { githubRepoId } from "../memory/repo-id.js";
import { getInstallationOctokit, createGitHubApp } from "./app.js";
import { promoteFeedback } from "../memory/learn.js";
import { log } from "../core/logger.js";
import { isUsefulReviewComment, isBotLogin, normalizeFeedbackSummary } from "../memory/quality-filter.js";

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
  if (isBotLogin(login) || login.includes("archivist")) return;

  const repoId = githubRepoId(repo.full_name, repo.html_url);
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
        isUsefulReviewComment(c.body) &&
        c.user?.type !== "Bot" &&
        !isBotLogin(c.user?.login)
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
      if (comment.body.length <= 280) {
        await memoryStore.addHistoricalFeedback(repoId, {
          summary: normalizeFeedbackSummary(comment.body),
          prNumber: pr.number,
          frequency: 1,
          lastSeen: comment.created_at,
        });
      }
      ingested++;
    }

    if (review.body && isUsefulReviewComment(review.body)) {
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

type ReviewCommentEvent = EmitterWebhookEvent<"pull_request_review_comment">;

/**
 * Learn from individual inline review comments (threads / replies).
 */
export async function handleReviewCommentCreated(event: ReviewCommentEvent) {
  const { payload } = event;
  if (payload.action !== "created") return;

  const comment = payload.comment;
  const repo = payload.repository;
  const pr = payload.pull_request;
  const installationId = payload.installation?.id;

  if (!installationId) return;
  if (comment.user?.type === "Bot") return;

  const login = comment.user?.login?.toLowerCase() || "";
  if (isBotLogin(login) || login.includes("archivist")) return;

  const body = (comment.body || "").trim();
  if (!isUsefulReviewComment(body)) return;

  const repoId = githubRepoId(repo.full_name, repo.html_url);
  const repoFullName = repo.full_name;

  log.info("Learning from inline review comment", {
    repo: repoFullName,
    pr: pr.number,
    path: comment.path,
    author: comment.user?.login,
  });

  try {
    await memoryStore.getOrCreate(repoId, repoFullName);

    await memoryStore.addRawSnippet(repoId, {
      text: body,
      path: comment.path,
      prNumber: pr.number,
      author: comment.user?.login,
      createdAt: comment.created_at,
    });

    if (body.length <= 280) {
      await memoryStore.addHistoricalFeedback(repoId, {
        summary: body.replace(/\s+/g, " ").trim(),
        prNumber: pr.number,
        frequency: 1,
        lastSeen: comment.created_at,
      });
    }

    // Light promote pass — cheap and keeps memory warm
    const { promoted } = await promoteFeedback(repoId);
    if (promoted > 0) {
      log.info("Promoted rules from inline comment", {
        repo: repoFullName,
        promoted,
      });
    }
  } catch (err) {
    log.error("Inline comment learning failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
