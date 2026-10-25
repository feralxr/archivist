/**
 * Lightweight in-process metrics for the GitHub App server.
 */

export interface MetricsSnapshot {
  reviewsStarted: number;
  reviewsCompleted: number;
  reviewsFailed: number;
  commentsPosted: number;
  bootstrapsCompleted: number;
  webhooksReceived: number;
  webhookRetries: number;
  webhookDuplicates: number;
  webhookCompleted: number;
  webhookFailures: number;
  startedAt: string;
  uptimeSeconds: number;
}

const startedAt = new Date();

const counters = {
  reviewsStarted: 0,
  reviewsCompleted: 0,
  reviewsFailed: 0,
  commentsPosted: 0,
  bootstrapsCompleted: 0,
  webhooksReceived: 0,
  webhookRetries: 0,
  webhookDuplicates: 0,
  webhookCompleted: 0,
  webhookFailures: 0,
};

export const metrics = {
  inc(key: keyof typeof counters, n = 1) {
    counters[key] += n;
  },
  snapshot(): MetricsSnapshot {
    return {
      ...counters,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    };
  },
};
