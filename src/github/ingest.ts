import type { Octokit } from "@octokit/rest";
import { memoryStore } from "../memory/store.js";

interface IngestOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  repoId: string;
}

/**
 * Lightweight ingestion when a PR is opened.
 * Later this will pull historical PRs + review comments to bootstrap memory.
 */
export async function ingestPullRequest(
  octokit: Octokit,
  options: IngestOptions
) {
  const { owner, repo, pullNumber, repoId } = options;

  try {
    // Fetch the PR itself
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Fetch existing reviews (if any)
    const { data: reviews } = await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Fetch review comments
    const { data: reviewComments } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Very simple bootstrap: store high-signal human comments as raw snippets
    for (const comment of reviewComments) {
      if (comment.user?.type === "Bot") continue;
      if (!comment.body || comment.body.length < 20) continue;

      await memoryStore.addRawSnippet(
        repoId,
        `[${comment.path}] ${comment.body.slice(0, 300)}`
      );
    }

    // Bump counter
    const memory = await memoryStore.get(repoId);
    if (memory) {
      memory.metadata.prsAnalyzed += 1;
      await memoryStore.save(memory);
    }

    console.log(
      `[ingest] Processed ${repo}/${pullNumber} — ${reviewComments.length} review comments`
    );
  } catch (err) {
    console.error("[ingest] Failed", err);
  }
}

/**
 * Future: full historical bootstrap
 * Pull the last N merged PRs + their review comments and extract patterns.
 */
export async function bootstrapRepositoryMemory(
  octokit: Octokit,
  owner: string,
  repo: string,
  repoId: string,
  limit = 30
) {
  console.log(`[bootstrap] Starting historical analysis for ${owner}/${repo}`);

  const { data: pulls } = await octokit.pulls.list({
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: limit,
  });

  let processed = 0;

  for (const pr of pulls) {
    if (!pr.merged_at) continue;

    try {
      const { data: comments } = await octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pr.number,
      });

      for (const comment of comments) {
        if (comment.user?.type === "Bot") continue;
        if (!comment.body || comment.body.length < 30) continue;

        await memoryStore.addRawSnippet(
          repoId,
          `[PR#${pr.number}] ${comment.path}: ${comment.body.slice(0, 280)}`
        );
      }

      processed++;
    } catch {
      // ignore individual failures
    }
  }

  const memory = await memoryStore.get(repoId);
  if (memory) {
    memory.metadata.prsAnalyzed = processed;
    await memoryStore.save(memory);
  }

  console.log(`[bootstrap] Finished — analyzed ${processed} merged PRs`);
}
