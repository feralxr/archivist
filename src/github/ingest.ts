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
      if (comment.user?.type === "Bot") continue;
      if (!comment.body || comment.body.length < 20) continue;

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

    console.log(
      `[ingest] Processed ${owner}/${repo}#${pullNumber} — ${reviewComments.length} comments`
    );
  } catch (err) {
    console.error("[ingest] Failed", err);
  }
}

/**
 * Bootstrap memory from historical merged PRs.
 * This is the key differentiator — learn the team's real preferences.
 */
export async function bootstrapRepositoryMemory(
  octokit: Octokit,
  owner: string,
  repo: string,
  repoId: string,
  limit = 40
) {
  console.log(`[bootstrap] Analyzing last ${limit} PRs for ${owner}/${repo}...`);

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
        if (comment.user?.type === "Bot") continue;
        if (!comment.body || comment.body.length < 30) continue;

        await memoryStore.addRawSnippet(repoId, {
          text: comment.body,
          path: comment.path,
          prNumber: pr.number,
          author: comment.user?.login,
          createdAt: comment.created_at,
        });

        // Promote concise feedback
        if (comment.body.length < 260) {
          await memoryStore.addHistoricalFeedback(repoId, {
            summary: comment.body.replace(/\s+/g, " ").trim().slice(0, 300),
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

  console.log(
    `[bootstrap] Done — ${processed} PRs, ${commentsIngested} comments ingested`
  );

  return { processed, commentsIngested };
}
