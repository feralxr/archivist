import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { getInstallationOctokit, createGitHubApp } from "./app.js";
import { ReviewEngine } from "../review/engine.js";
import { createModelFromEnv } from "../models/provider.js";
import { memoryStore } from "../memory/store.js";
import { ingestPullRequest } from "./ingest.js";
import { postReviewComments } from "./comments.js";
import { hasOpenRouter } from "../core/config.js";

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
    console.warn("[handler] No installation ID — skipping");
    return;
  }

  if (!hasOpenRouter()) {
    console.warn("[handler] No OPENROUTER_API_KEY — cannot review");
    return;
  }

  // Skip draft PRs on open (still review on synchronize if desired)
  if (action === "opened" && pr.draft) {
    console.log(`[handler] Skipping draft PR ${repo.full_name}#${pr.number}`);
    return;
  }

  const repoId = String(repo.id);
  const repoFullName = repo.full_name;

  console.log(
    `[handler] ${action} → ${repoFullName}#${pr.number} (${pr.title})`
  );

  try {
    await memoryStore.getOrCreate(repoId, repoFullName);

    const app = createGitHubApp();
    const octokit = await getInstallationOctokit(app, installationId);

    // Fetch diff
    const response = await octokit.pulls.get({
      owner: repo.owner.login,
      repo: repo.name,
      pull_number: pr.number,
      mediaType: { format: "diff" },
    });

    const diffText =
      typeof response.data === "string"
        ? response.data
        : String(response.data);

    if (!diffText || diffText.length < 10) {
      console.log("[handler] Empty diff — skipping");
      return;
    }

    // Soft size guard for very large PRs
    if (diffText.length > 400_000) {
      console.warn(
        `[handler] Diff too large (${diffText.length} chars) — skipping detailed review`
      );
      await octokit.issues.createComment({
        owner: repo.owner.login,
        repo: repo.name,
        issue_number: pr.number,
        body: "### Archivist\n\nThis PR is too large for a full automated review. Consider splitting it.",
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

    console.log(
      `[handler] Review complete → ${result.comments.length} comments | ${result.modelUsed}`
    );

    await postReviewComments(octokit, {
      owner: repo.owner.login,
      repo: repo.name,
      pullNumber: pr.number,
      commitId: pr.head.sha,
      result,
    });
  } catch (err) {
    console.error(`[handler] Failed on ${repoFullName}#${pr.number}`, err);
  }
}
