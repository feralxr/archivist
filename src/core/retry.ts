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
  if (
    e.code === "ECONNRESET" ||
    e.code === "ETIMEDOUT" ||
    e.code === "ENOTFOUND" ||
    e.code === "ECONNREFUSED" ||
    e.code === "EAI_AGAIN"
  ) {
    return true;
  }

  // HTTP status
  const status = e.status || e.statusCode || e.response?.status;
  if (typeof status === "number") {
    if (status === 408 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
  }

  // OpenAI / OpenRouter / Anthropic rate limit messages
  const msg = String(e.message || "").toLowerCase();
  if (
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("overloaded") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("try again") ||
    msg.includes("econnreset")
  ) {
    return true;
  }

  return false;
}

/** Prefer server-provided Retry-After when present (seconds or HTTP-date). */
function retryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as any;
  const headers = e.headers || e.response?.headers;
  if (!headers) return null;

  const raw =
    (typeof headers.get === "function" && headers.get("retry-after")) ||
    headers["retry-after"] ||
    headers["Retry-After"];
  if (raw == null) return null;

  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return Math.min(asNum * 1000, 60_000);
  }
  const date = Date.parse(String(raw));
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), 60_000);
  }
  return null;
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

      const serverDelay = retryAfterMs(err);
      const wait = serverDelay ?? delay;

      options.onRetry?.(err, attempt + 1);
      log.warn("Retrying after error", {
        attempt: attempt + 1,
        delayMs: wait,
        error: err instanceof Error ? err.message : String(err),
      });

      await sleep(wait);
      delay = Math.min(delay * options.factor, options.maxDelayMs);
    }
  }

  throw lastError;
}
