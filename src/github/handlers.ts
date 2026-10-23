import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { getInstallationOctokit } from "./app.js";
import { createGitHubApp } from "./app.js";
import { ReviewEngine } from "../review/engine.js";
import { createModelFromEnv } from "../models/provider.js";
import { memoryStore } from "../memory/store.js";
import { ingestPullRequest } from "./ingest.js";
import { postReviewComments } from "./comments.js";

type PREvent = EmitterWebhookEvent<"pull_request">;

/**
 * Main entry point when a PR is opened or updated.
 */
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

  const repoId = String(repo.id);
  const repoFullName = repo.full_name;

  console.log(
    `[handler] ${action} → ${repoFullName}#${pr.number} (${pr.title})`
  );

  try {
    // 1. Ensure memory exists
    await memoryStore.getOrCreate(repoId, repoFullName);

    // 2. Get authenticated client
    const app = createGitHubApp();
    const octokit = await getInstallationOctokit(app, installationId);

    // 3. Fetch the full diff
    const { data: diff } = await octokit.pulls.get({
      owner: repo.owner.login,
      repo: repo.name,
      pull_number: pr.number,
      mediaType: { format: "diff" },
    });

    const diffText = typeof diff === "string" ? diff : String(diff);

    // 4. (Optional) Ingest past context / learn from this PR later
    // For now we just make sure memory exists. Full ingestion comes next.
    if (action === "opened") {
      await ingestPullRequest(octokit, {
        owner: repo.owner.login,
        repo: repo.name,
        pullNumber: pr.number,
        repoId,
      });
    }

    // 5. Run the review engine
    const model = createModelFromEnv();
    const engine = new ReviewEngine(model);

    const result = await engine.review({
      repoId,
      diff: diffText,
      title: pr.title,
      body: pr.body || undefined,
    });

    console.log(
      `[handler] Review complete → ${result.comments.length} comments | model: ${result.modelUsed}`
    );

    // 6. Post comments back to the PR
    if (result.comments.length > 0 || result.summary) {
      await postReviewComments(octokit, {
        owner: repo.owner.login,
        repo: repo.name,
        pullNumber: pr.number,
        commitId: pr.head.sha,
        result,
      });
    }
  } catch (err) {
    console.error(`[handler] Failed on ${repoFullName}#${pr.number}`, err);
  }
}
