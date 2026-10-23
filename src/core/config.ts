import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  ARCHIVIST_MODEL: z.string().default("google/gemini-2.0-flash-exp:free"),
  ARCHIVIST_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  ARCHIVIST_DATA_DIR: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export function hasOpenRouter(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
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
