import { log } from "./logger.js";

export interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  onRetry?: (err: unknown, attempt: number) => void;
}

const DEFAULTS: Required<Omit<RetryOptions, "onRetry">> = {
  retries: 3,
  minDelayMs: 400,
  maxDelayMs: 8000,
  factor: 2,
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;

  // Network / fetch style
  if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT" || e.code === "ENOTFOUND") {
    return true;
  }

  // HTTP status
  const status = e.status || e.statusCode || e.response?.status;
  if (typeof status === "number") {
    if (status === 429) return true;
    if (status >= 500) return true;
  }

  // OpenAI / OpenRouter rate limit messages
  const msg = String(e.message || "").toLowerCase();
  if (msg.includes("rate limit") || msg.includes("timeout") || msg.includes("overloaded")) {
    return true;
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const options = { ...DEFAULTS, ...opts };
  let delay = options.minDelayMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === options.retries || !isRetryable(err)) {
        throw err;
      }

      options.onRetry?.(err, attempt + 1);
      log.warn("Retrying after error", {
        attempt: attempt + 1,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });

      await sleep(delay);
      delay = Math.min(delay * options.factor, options.maxDelayMs);
    }
  }

  throw lastError;
}
