/**
 * GitHub REST helper for CLI bootstrap — rate-limit aware.
 */

import { log } from "../core/logger.js";

export interface GithubFetchOptions {
  headers: Record<string, string>;
  /** Max retries on 403 secondary / 429 */
  retries?: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch GitHub API with Retry-After / x-ratelimit-remaining handling.
 */
export async function githubFetch(
  url: string,
  opts: GithubFetchOptions
): Promise<Response> {
  const retries = opts.retries ?? 4;
  let last: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: opts.headers });
    last = res;

    if (res.status !== 403 && res.status !== 429) {
      return res;
    }

    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    const retryAfter = res.headers.get("retry-after");

    // Secondary rate limit or primary exhausted
    let waitMs = 0;
    if (retryAfter) {
      const sec = Number(retryAfter);
      waitMs = Number.isFinite(sec) ? sec * 1000 : 10_000;
    } else if (remaining === "0" && reset) {
      const resetAt = Number(reset) * 1000;
      waitMs = Math.max(1_000, Math.min(resetAt - Date.now() + 500, 60_000));
    } else {
      // secondary limit — exponential backoff
      waitMs = Math.min(2_000 * 2 ** attempt, 30_000);
    }

    if (attempt === retries) break;

    log.warn("GitHub rate limit — waiting", {
      status: res.status,
      waitMs,
      attempt: attempt + 1,
      remaining,
    });
    await sleep(waitMs);
  }

  return last!;
}

/** Small polite delay between sequential PR fetches */
export async function politePause(ms = 120): Promise<void> {
  await sleep(ms);
}
