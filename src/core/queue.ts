/**
 * Simple concurrency limiter for review jobs.
 * Prevents stampeding the model API when many PRs arrive at once.
 */
export class ConcurrencyQueue {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private concurrency: number = 2) {
    if (concurrency < 1) this.concurrency = 1;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get stats() {
    return {
      running: this.running,
      queued: this.queue.length,
      concurrency: this.concurrency,
    };
  }
}

function defaultConcurrency(): number {
  const n = Number(process.env.ARCHIVIST_REVIEW_CONCURRENCY || "2");
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.min(8, Math.floor(n));
}

export const reviewQueue = new ConcurrencyQueue(defaultConcurrency());
