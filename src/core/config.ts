import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  // Model providers — set at least one
  OPENROUTER_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  /** Force provider: openrouter | anthropic | openai */
  ARCHIVIST_PROVIDER: z.string().optional(),
  ARCHIVIST_MODEL: z.string().default("gpt-4o-mini"),
  /** Override model for review agent only (falls back to ARCHIVIST_MODEL) */
  ARCHIVIST_REVIEW_MODEL: z.string().optional(),
  ARCHIVIST_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),

  // GitHub App
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GH_TOKEN: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  ARCHIVIST_DATA_DIR: z.string().optional(),
  ARCHIVIST_MAX_COMMENTS: z.coerce.number().int().min(1).max(20).default(8),
  ARCHIVIST_CHUNK_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  ARCHIVIST_SKIP_DOCS_ONLY: z.string().optional(),
  ARCHIVIST_PROMPT_PROFILE: z.string().optional(),
  ARCHIVIST_CUSTOM_PROMPT: z.string().optional(),
  ARCHIVIST_REQUEST_CHANGES: z.string().optional(),
  ARCHIVIST_MIN_CONFIDENCE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = parsed.data;

export function hasOpenRouter(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

export function hasAnthropic(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function hasOpenAI(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function hasAnyModelKey(): boolean {
  return hasOpenRouter() || hasAnthropic() || hasOpenAI();
}

export function hasGitHubApp(): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_PRIVATE_KEY);
}

export function requireGitHubApp() {
  if (!hasGitHubApp()) {
    throw new Error(
      "GitHub App credentials missing.\n" +
        "Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY in .env\n" +
        "Run `archivist setup` for instructions."
    );
  }
}

export function getPrivateKey(): string {
  if (!env.GITHUB_PRIVATE_KEY) return "";
  return env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");
}
