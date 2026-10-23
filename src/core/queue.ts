/**
 * Simple concurrency limiter for review jobs.
 * Prevents stampeding the model API when many PRs arrive at once.
 */
export class ConcurrencyQueue {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private concurrency: number = 2) {}

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
    return { running: this.running, queued: this.queue.length };
  }
}

export const reviewQueue = new ConcurrencyQueue(2);
