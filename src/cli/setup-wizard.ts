/**
 * Interactive first-run setup for Archivist.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export interface SetupResult {
  envPath: string;
  wroteEnv: boolean;
  provider?: string;
  model?: string;
}

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function serializeEnv(
  baseExample: string,
  values: Record<string, string>
): string {
  // Start from example structure; overlay values
  const lines = baseExample.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = t.indexOf("=");
    if (eq <= 0) {
      out.push(line);
      continue;
    }
    const k = t.slice(0, eq).trim();
    seen.add(k);
    if (k in values) {
      out.push(`${k}=${values[k]}`);
    } else {
      out.push(line);
    }
  }

  for (const [k, v] of Object.entries(values)) {
    if (!seen.has(k) && v) {
      out.push(`${k}=${v}`);
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  opts?: { default?: string; secret?: boolean }
): Promise<string> {
  const def = opts?.default;
  const hint = def ? ` [${def}]` : "";
  const answer = (await rl.question(`${question}${hint}: `)).trim();
  return answer || def || "";
}

export async function runSetupWizard(cwd = process.cwd()): Promise<SetupResult> {
  const envPath = join(cwd, ".env");
  const examplePath = join(cwd, ".env.example");
  // When installed globally, .env.example may live next to package root
  const altExample = join(cwd, ".env.example");

  let example = "";
  if (existsSync(examplePath)) {
    example = readFileSync(examplePath, "utf-8");
  } else if (existsSync(altExample)) {
    example = readFileSync(altExample, "utf-8");
  } else {
    example = `# Archivist\nOPENAI_API_KEY=\nANTHROPIC_API_KEY=\nOPENROUTER_API_KEY=\nARCHIVIST_PROVIDER=\nARCHIVIST_MODEL=gpt-4o-mini\n`;
  }

  const existing = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, "utf-8"))
    : {};

  const rl = createInterface({ input, output });

  console.log(`
╔══════════════════════════════════════╗
║     Archivist interactive setup      ║
╚══════════════════════════════════════╝

This writes a local .env (never commit it).
Press Enter to keep defaults / skip.
`);

  try {
    console.log("Which provider will you use?");
    console.log("  1) OpenAI");
    console.log("  2) Anthropic");
    console.log("  3) OpenRouter (many models, some free)");
    console.log("  4) Skip (configure .env yourself)");
    const choice = await ask(rl, "Choice", { default: "1" });

    const values: Record<string, string> = { ...existing };
    let provider = existing.ARCHIVIST_PROVIDER || "";
    let model = existing.ARCHIVIST_MODEL || existing.ARCHIVIST_REVIEW_MODEL || "";

    if (choice === "1") {
      provider = "openai";
      const key = await ask(rl, "OPENAI_API_KEY", {
        default: existing.OPENAI_API_KEY ? "(unchanged)" : "",
      });
      if (key && key !== "(unchanged)") values.OPENAI_API_KEY = key;
      model =
        (await ask(rl, "Model id", {
          default: existing.ARCHIVIST_MODEL || "gpt-4o-mini",
        })) || "gpt-4o-mini";
    } else if (choice === "2") {
      provider = "anthropic";
      const key = await ask(rl, "ANTHROPIC_API_KEY", {
        default: existing.ANTHROPIC_API_KEY ? "(unchanged)" : "",
      });
      if (key && key !== "(unchanged)") values.ANTHROPIC_API_KEY = key;
      model =
        (await ask(rl, "Model id", {
          default: existing.ARCHIVIST_MODEL || "claude-sonnet-4-20250514",
        })) || "claude-sonnet-4-20250514";
    } else if (choice === "3") {
      provider = "openrouter";
      const key = await ask(rl, "OPENROUTER_API_KEY", {
        default: existing.OPENROUTER_API_KEY ? "(unchanged)" : "",
      });
      if (key && key !== "(unchanged)") values.OPENROUTER_API_KEY = key;
      model =
        (await ask(rl, "Model id", {
          default: existing.ARCHIVIST_MODEL || "recursive/flint-v1.0:free",
        })) || "recursive/flint-v1.0:free";
    }

    if (provider) values.ARCHIVIST_PROVIDER = provider;
    if (model) values.ARCHIVIST_MODEL = model;

    const seed = await ask(rl, "Seed starter style rules on init? (y/N)", {
      default: "y",
    });
    values.ARCHIVIST_SEED_DEFAULTS = /^y/i.test(seed) ? "true" : "false";

    if (!existsSync(envPath) && existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
    }

    const content = serializeEnv(
      existsSync(envPath) ? readFileSync(envPath, "utf-8") : example,
      values
    );
    writeFileSync(envPath, content, "utf-8");

    console.log(`
✓ Wrote ${envPath}

Next:
  archivist doctor
  archivist init
  archivist review

Model catalog: archivist models --list
GitHub App:    docs/GITHUB_APP.md + docs/DEPLOY.md
`);

    return {
      envPath,
      wroteEnv: true,
      provider: provider || undefined,
      model: model || undefined,
    };
  } finally {
    rl.close();
  }
}
