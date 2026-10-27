import type { Octokit } from "@octokit/rest";
import { memoryStore } from "../memory/store.js";
import { promoteFeedback, inferFromSnippets } from "../memory/learn.js";
import { log } from "../core/logger.js";
import { isUsefulReviewComment, isBotLogin, normalizeFeedbackSummary } from "../memory/quality-filter.js";

interface IngestOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  repoId: string;
}

/**
 * Lightweight ingestion when a PR is opened.
 */
export async function ingestPullRequest(
  octokit: Octokit,
  options: IngestOptions
) {
  const { owner, repo, pullNumber, repoId } = options;

  try {
    const { data: reviewComments } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
    });

    for (const comment of reviewComments) {
      if (comment.user?.type === "Bot" || isBotLogin(comment.user?.login)) continue;
      if (!comment.body || !isUsefulReviewComment(comment.body)) continue;

      await memoryStore.addRawSnippet(repoId, {
        text: comment.body,
        path: comment.path,
        prNumber: pullNumber,
        author: comment.user?.login,
        createdAt: comment.created_at,
      });
    }

    const memory = await memoryStore.get(repoId);
    if (memory) {
      memory.metadata.prsAnalyzed += 1;
      await memoryStore.save(memory);
    }

    log.info("Ingested PR comments", {
      repo: `${owner}/${repo}`,
      pr: pullNumber,
      comments: reviewComments.length,
    });
  } catch (err) {
    log.error("Ingest failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Bootstrap memory from historical merged PRs.
 * This is the main learning loop entry for new installations.
 */
export async function bootstrapRepositoryMemory(
  octokit: Octokit,
  owner: string,
  repo: string,
  repoId: string,
  limit = 40
): Promise<{ processed: number; commentsIngested: number; promoted: number; inferred: number }> {
  log.info("Bootstrap starting", { repo: `${owner}/${repo}`, limit });

  await memoryStore.getOrCreate(repoId, `${owner}/${repo}`);

  const { data: pulls } = await octokit.pulls.list({
    owner,
    repo,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: Math.min(limit, 100),
  });

  let processed = 0;
  let commentsIngested = 0;

  for (const pr of pulls) {
    if (!pr.merged_at) continue;

    try {
      const { data: comments } = await octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pr.number,
      });

      for (const comment of comments) {
        if (comment.user?.type === "Bot" || isBotLogin(comment.user?.login)) continue;
        if (!comment.body || !isUsefulReviewComment(comment.body)) continue;

        await memoryStore.addRawSnippet(repoId, {
          text: comment.body,
          path: comment.path,
          prNumber: pr.number,
          author: comment.user?.login,
          createdAt: comment.created_at,
        });

        if (comment.body.length <= 280) {
          await memoryStore.addHistoricalFeedback(repoId, {
            summary: normalizeFeedbackSummary(comment.body),
            prNumber: pr.number,
            frequency: 1,
            lastSeen: comment.created_at,
          });
        }

        commentsIngested++;
      }

      processed++;
    } catch {
      // ignore individual PR failures
    }
  }

  const memory = await memoryStore.get(repoId);
  if (memory) {
    memory.metadata.prsAnalyzed = processed;
    memory.metadata.lastBootstrapAt = new Date().toISOString();
    await memoryStore.save(memory);
  }

  // Learning pass on what we collected
  const { promoted } = await promoteFeedback(repoId);
  const { inferred } = await inferFromSnippets(repoId);

  log.info("Bootstrap complete", {
    repo: `${owner}/${repo}`,
    processed,
    commentsIngested,
    promoted,
    inferred,
  });

  return { processed, commentsIngested, promoted, inferred };
}
