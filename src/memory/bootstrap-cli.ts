/**
 * Bootstrap project memory from a public (or accessible) GitHub repo
 * using a personal access token — no GitHub App required.
 */

import { memoryStore } from "./store.js";
import { promoteFeedback, inferFromSnippets } from "./learn.js";
import { log } from "../core/logger.js";

export interface BootstrapCliOptions {
  owner: string;
  repo: string;
  repoId: string;
  token?: string;
  limit?: number;
}

export async function bootstrapFromGitHubApi(
  opts: BootstrapCliOptions
): Promise<{ processed: number; commentsIngested: number; promoted: number; inferred: number }> {
  const token =
    opts.token ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    "";

  const limit = opts.limit ?? 30;
  const { owner, repo, repoId } = opts;
  const base = "https://api.github.com";

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "archivist-bootstrap",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  await memoryStore.getOrCreate(repoId, `${owner}/${repo}`);

  log.info("CLI bootstrap starting", { repo: `${owner}/${repo}`, limit, authed: Boolean(token) });

  const pullsRes = await fetch(
    `${base}/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${Math.min(limit, 50)}`,
    { headers }
  );

  if (!pullsRes.ok) {
    const body = await pullsRes.text();
    throw new Error(
      `GitHub API ${pullsRes.status} listing PRs: ${body.slice(0, 200)}\n` +
        (pullsRes.status === 403 || pullsRes.status === 401
          ? "Set GITHUB_TOKEN for higher rate limits / private repos."
          : "")
    );
  }

  const pulls = (await pullsRes.json()) as Array<{
    number: number;
    merged_at: string | null;
  }>;

  let processed = 0;
  let commentsIngested = 0;

  for (const pr of pulls) {
    if (!pr.merged_at) continue;

    try {
      const commentsRes = await fetch(
        `${base}/repos/${owner}/${repo}/pulls/${pr.number}/comments`,
        { headers }
      );
      if (!commentsRes.ok) continue;

      const comments = (await commentsRes.json()) as Array<{
        body: string;
        path?: string;
        user?: { login?: string; type?: string };
        created_at: string;
      }>;

      for (const comment of comments) {
        if (comment.user?.type === "Bot") continue;
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
            summary: comment.body.replace(/\s+/g, " ").trim().slice(0, 300),
            prNumber: pr.number,
            frequency: 1,
            lastSeen: comment.created_at,
          });
        }
        commentsIngested++;
      }
      processed++;
      // gentle rate limit for unauthenticated / secondary limits
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // skip individual PR failures
    }
  }

  const memory = await memoryStore.get(repoId);
  if (memory) {
    memory.metadata.prsAnalyzed = processed;
    memory.metadata.lastBootstrapAt = new Date().toISOString();
    await memoryStore.save(memory);
  }

  const { promoted } = await promoteFeedback(repoId);
  const { inferred } = await inferFromSnippets(repoId);

  log.info("CLI bootstrap complete", {
    repo: `${owner}/${repo}`,
    processed,
    commentsIngested,
    promoted,
    inferred,
  });

  return { processed, commentsIngested, promoted, inferred };
}

/** Parse owner/repo from URL or shorthand */
export function parseGithubRepo(input: string): { owner: string; repo: string } {
  let s = input.trim();
  s = s.replace(/^https?:\/\/github\.com\//, "");
  s = s.replace(/\.git$/, "");
  s = s.replace(/\/$/, "");
  const parts = s.split("/");
  if (parts.length < 2) {
    throw new Error(`Invalid repo "${input}". Use owner/repo or a GitHub URL.`);
  }
  return { owner: parts[0], repo: parts[1] };
}


function isUsefulReviewComment(body: string): boolean {
  const t = body.trim();
  if (t.length < 30 || t.length > 2000) return false;
  if (/^(lgtm|looks good|ship it|nit)\.?$/i.test(t)) return false;
  if (/^[+\- ]/.test(t) && t.split("\n").length > 20) return false; // pasted diff
  return true;
}
