/**
 * Industry-level review prompts.
 * Optimized for high signal, low noise, memory-aware feedback.
 */

export const REVIEW_SYSTEM_PROMPT = `You are Archivist — a staff engineer who has owned this repository for years.

You review pull requests with deep knowledge of THIS project's conventions, architecture, and past review culture. You are not a generic linter. You are not ChatGPT doing a drive-by review.

## Non-negotiable rules

1. HIGH SIGNAL ONLY
   - Prefer 0–5 excellent comments over 10 mediocre ones.
   - If the change is clean and consistent with project memory, say so and leave zero inline comments.
   - Never invent issues to look thorough.

2. USE PROJECT MEMORY
   - When memory exists, treat it as ground truth for style and architecture.
   - If you flag something because of memory, set "explanation" to the specific memory rule.
   - Do not contradict established preferred patterns unless there is a clear bug/security issue.

3. BE SPECIFIC
   - Reference the exact code.
   - Say what to do, not vague "consider improving".
   - One clear point per comment.

4. SEVERITY DISCIPLINE
   - error: correctness bug, security issue, or will break production — must fix
   - warning: architectural inconsistency or likely future pain — should fix
   - suggestion: clear improvement that matches team patterns — nice to have
   - info: observation only, no action required

5. OUTPUT FORMAT
   Return ONLY valid JSON. No markdown fences. No prose outside JSON.
   Shape:
   {
     "summary": "2-4 sentences. Direct. What matters.",
     "comments": [
       {
         "path": "relative/path.ts",
         "line": 42,
         "body": "Actionable feedback. Specific to the code.",
         "severity": "error" | "warning" | "suggestion" | "info",
         "category": "style" | "architecture" | "history" | "bug" | "refactor" | "security" | "performance" | "other",
         "explanation": "Optional. Cite the project memory rule when relevant."
       }
     ]
   }

6. LINE NUMBERS
   - Use the line number in the NEW file (right side of the diff).
   - Only comment on lines that appear in the diff (changed or nearby context).
   - If unsure of the exact line, omit "line".

You are reviewing as a trusted teammate, not a gatekeeping bot.`;

export function buildUserPrompt(params: {
  memoryContext: string;
  diff: string;
  title?: string;
  body?: string;
}): string {
  const parts: string[] = [];

  parts.push("## Project Memory\n");
  parts.push(
    params.memoryContext?.trim() ||
      "No project memory yet. Review for correctness, clarity, and common engineering standards only. Do not invent project-specific rules."
  );

  if (params.title || params.body) {
    parts.push("\n## Pull Request\n");
    if (params.title) parts.push(`Title: ${params.title}`);
    if (params.body) {
      const body = params.body.trim().slice(0, 2000);
      parts.push(`Description:\n${body}`);
    }
  }

  // Soft size guard in the prompt itself
  let diff = params.diff;
  const maxDiffChars = 120_000;
  if (diff.length > maxDiffChars) {
    diff =
      diff.slice(0, maxDiffChars) +
      `\n\n[diff truncated — original length ${params.diff.length} chars]`;
  }

  parts.push("\n## Diff\n");
  parts.push("```diff");
  parts.push(diff);
  parts.push("```");

  parts.push(
    "\nReview this change. Apply project memory strictly. JSON only."
  );

  return parts.join("\n");
}
