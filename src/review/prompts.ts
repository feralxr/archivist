/**
 * Prompt resolution — profiles + user prompt builder.
 */
import { readFileSync, existsSync } from "node:fs";
import {
  getProfile,
  DEFAULT_PROFILE_ID,
  type PromptProfileId,
} from "./profiles.js";
import { log } from "../core/logger.js";

/** @deprecated Use resolveSystemPrompt() — kept for callers expecting a constant */
export const REVIEW_SYSTEM_PROMPT = getProfile("balanced").systemPrompt;

/**
 * Resolve the active system prompt from env / profile / custom file.
 *
 * Env:
 *   ARCHIVIST_PROMPT_PROFILE=strict|balanced|security|mentor|minimal|custom
 *   ARCHIVIST_CUSTOM_PROMPT=/path/to/prompt.txt   (required if profile=custom)
 */
export function resolveSystemPrompt(overrides?: {
  profile?: string;
  customPath?: string;
}): string {
  const profileId = (
    overrides?.profile ||
    process.env.ARCHIVIST_PROMPT_PROFILE ||
    DEFAULT_PROFILE_ID
  )
    .toLowerCase()
    .trim() as PromptProfileId;

  const customPath =
    overrides?.customPath || process.env.ARCHIVIST_CUSTOM_PROMPT || "";

  if (profileId === "custom" || customPath) {
    const path = customPath;
    if (!path || !existsSync(path)) {
      log.warn("Custom prompt requested but file missing; falling back to balanced", {
        path: path || "(empty)",
      });
      return getProfile("balanced").systemPrompt;
    }
    const text = readFileSync(path, "utf-8").trim();
    if (text.length < 80) {
      log.warn("Custom prompt too short; falling back to balanced");
      return getProfile("balanced").systemPrompt;
    }
    // Ensure JSON contract is present
    if (!text.includes("summary") || !text.includes("comments")) {
      return text + "\n\n" + JSON_CONTRACT_APPENDIX;
    }
    return text;
  }

  return getProfile(profileId).systemPrompt;
}

const JSON_CONTRACT_APPENDIX = `
You must return ONLY valid JSON (no markdown fences):
{
  "summary": "2-4 sentences",
  "comments": [
    {
      "path": "file",
      "line": 1,
      "body": "actionable text",
      "severity": "error|warning|suggestion|info",
      "category": "bug|security|architecture|style|history|refactor|performance|testing|docs|other",
      "explanation": "optional rationale"
    }
  ]
}
Max 8 comments. Prefer higher severity.
`;

const MAX_DIFF_CHARS = 120_000;
const MAX_PR_BODY = 2_500;

export function buildUserPrompt(params: {
  memoryContext: string;
  diff: string;
  title?: string;
  body?: string;
  diffStats?: {
    files: number;
    codeFiles: number;
    docFiles: number;
    docsOnly: boolean;
    added: number;
    removed: number;
  };
}): string {
  const parts: string[] = [];

  parts.push("## Project Memory\n");
  parts.push(
    params.memoryContext?.trim() ||
      "No project memory yet. Review for correctness, security, and clarity only. Do not invent project-specific style rules."
  );

  if (params.diffStats) {
    const s = params.diffStats;
    parts.push("\n## Diff statistics");
    parts.push(
      `Files: ${s.files} (code: ${s.codeFiles}, docs: ${s.docFiles}) · +${s.added}/-${s.removed}` +
        (s.docsOnly ? " · docs-only change" : "")
    );
  }

  if (params.title || params.body) {
    parts.push("\n## Pull Request");
    if (params.title) parts.push(`Title: ${params.title}`);
    if (params.body) {
      const body = params.body.trim().slice(0, MAX_PR_BODY);
      parts.push(`Description:\n${body}`);
    }
  }

  let diff = params.diff;
  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diff =
      diff.slice(0, MAX_DIFF_CHARS) +
      `\n\n[diff truncated — original ${params.diff.length} chars; review visible portion only]`;
    truncated = true;
  }

  parts.push("\n## Diff\n");
  parts.push("```diff");
  parts.push(diff);
  parts.push("```");

  parts.push(
    "\nApply project memory strictly under the active profile rules. Max 8 comments. JSON only."
  );
  if (truncated) {
    parts.push("Note: diff was truncated; do not assume unseen hunks are clean.");
  }

  return parts.join("\n");
}
