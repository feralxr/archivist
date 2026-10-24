type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: Level =
  (process.env.LOG_LEVEL as Level) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: Level) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function ts() {
  return new Date().toISOString();
}

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keyRe = /key|token|secret|password|authorization|private/i;
  for (const [k, v] of Object.entries(meta)) {
    if (keyRe.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && /^(sk-|ghp_|github_pat_)/.test(v)) {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function fmt(level: Level, msg: string, meta?: Record<string, unknown>) {
  const base = `[${ts()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  if (!meta || Object.keys(meta).length === 0) return base;
  return `${base} ${JSON.stringify(redact(meta))}`;
}

export const log = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) console.debug(fmt("debug", msg, meta));
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) console.log(fmt("info", msg, meta));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(fmt("warn", msg, meta));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(fmt("error", msg, meta));
  },
};
