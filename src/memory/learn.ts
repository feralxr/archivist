import { memoryStore } from "./store.js";
import type { ProjectMemory, RawSnippet } from "./types.js";
import { log } from "../core/logger.js";

/**
 * Learning loop: turn raw review evidence into durable project memory.
 */

/** Promote high-frequency feedback into style rules / patterns when clear enough. */
export async function promoteFeedback(repoId: string): Promise<{
  promoted: number;
}> {
  const memory = await memoryStore.get(repoId);
  if (!memory) return { promoted: 0 };

  let promoted = 0;
  const existingRules = new Set(
    memory.styleRules.map((r) => r.rule.toLowerCase())
  );

  for (const fb of memory.historicalFeedback) {
    if (fb.frequency < 2) continue;
    const summary = fb.summary.trim();
    if (summary.length < 20 || summary.length > 200) continue;
    if (existingRules.has(summary.toLowerCase())) continue;

    // Heuristic: imperative / style-like language → style rule
    if (looksLikeStyleRule(summary)) {
      await memoryStore.addStyleRule(repoId, {
        rule: cleanRule(summary),
        source: "review",
        confidence: Math.min(0.5 + fb.frequency * 0.1, 0.95),
      });
      existingRules.add(summary.toLowerCase());
      promoted++;
      continue;
    }

    if (looksLikePattern(summary)) {
      const preferred = !/don'?t|avoid|never|discourag/i.test(summary);
      await memoryStore.addPattern(repoId, {
        description: cleanRule(summary),
        preferred,
      });
      promoted++;
    }
  }

  log.info("Promoted feedback into durable memory", { repoId, promoted });
  return { promoted };
}

/** Infer lightweight rules from raw human review snippets. */
export async function inferFromSnippets(repoId: string): Promise<{
  inferred: number;
}> {
  const memory = await memoryStore.get(repoId);
  if (!memory) return { inferred: 0 };

  let inferred = 0;
  const candidates = rankSnippetCandidates(memory.rawSnippets);

  for (const text of candidates.slice(0, 15)) {
    if (!looksLikeStyleRule(text) && !looksLikePattern(text)) continue;

    const rule = cleanRule(text);
    if (rule.length < 16 || rule.length > 180) continue;

    const already = memory.styleRules.some(
      (r) => r.rule.toLowerCase() === rule.toLowerCase()
    );
    if (already) continue;

    if (looksLikeStyleRule(text)) {
      await memoryStore.addStyleRule(repoId, {
        rule,
        source: "inferred",
        confidence: 0.55,
      });
      inferred++;
    } else if (looksLikePattern(text)) {
      const preferred = !/don'?t|avoid|never|discourag/i.test(text);
      await memoryStore.addPattern(repoId, {
        description: rule,
        preferred,
      });
      inferred++;
    }
  }

  log.info("Inferred rules from snippets", { repoId, inferred });
  return { inferred };
}

/** Full learning pass: consolidate → promote → infer */
export async function runLearningPass(repoId: string): Promise<{
  merged: number;
  trimmed: number;
  promoted: number;
  inferred: number;
}> {
  const { merged, trimmed } = await memoryStore.consolidate(repoId);
  const { promoted } = await promoteFeedback(repoId);
  const { inferred } = await inferFromSnippets(repoId);
  return { merged, trimmed, promoted, inferred };
}

function looksLikeStyleRule(text: string): boolean {
  const t = text.toLowerCase();
  const cues = [
    "prefer",
    "use ",
    "always ",
    "never ",
    "don't ",
    "avoid ",
    "must ",
    "should ",
    "naming",
    "semicolon",
    "import",
    "export",
    "async",
    "await",
    "type ",
    "interface",
    "const ",
    "let ",
    "early return",
    "error handling",
    "logging",
  ];
  return cues.some((c) => t.includes(c));
}

function looksLikePattern(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("pattern") ||
    t.includes("instead of") ||
    t.includes("rather than") ||
    t.includes("we usually") ||
    t.includes("in this codebase") ||
    t.includes("convention")
  );
}

function cleanRule(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function rankSnippetCandidates(snippets: RawSnippet[]): string[] {
  // Prefer concise, recent, non-bot-looking comments
  return [...snippets]
    .filter((s) => s.text && s.text.length >= 24 && s.text.length <= 280)
    .sort((a, b) => {
      // shorter-is-better among candidates, slight recency bias
      const lenScore = Math.abs(80 - a.text.length) - Math.abs(80 - b.text.length);
      return lenScore;
    })
    .map((s) => s.text.trim());
}

export function memoryQualityScore(memory: ProjectMemory): {
  score: number;
  label: string;
  tips: string[];
} {
  const tips: string[] = [];
  let score = 0;

  score += Math.min(memory.styleRules.length * 8, 32);
  score += Math.min(memory.architectureNotes.length * 8, 24);
  score += Math.min(memory.patterns.length * 5, 20);
  score += Math.min(memory.historicalFeedback.length * 3, 15);
  score += Math.min(memory.rawSnippets.length, 9);

  if (memory.styleRules.length < 3) {
    tips.push("Add style rules: archivist memory:add -t style -c \"...\"");
  }
  if (memory.architectureNotes.length < 1) {
    tips.push("Add architecture notes: archivist memory:add -t architecture -c \"...\"");
  }
  if (memory.historicalFeedback.length + memory.rawSnippets.length < 5) {
    tips.push("Run bootstrap or review more PRs so Archivist can learn");
  }
  if (memory.metadata.prsAnalyzed === 0) {
    tips.push("No PRs analyzed yet — install the GitHub App or import history");
  }

  score = Math.min(100, score);
  const label =
    score >= 70 ? "strong" : score >= 40 ? "useful" : score >= 15 ? "thin" : "empty";

  return { score, label, tips };
}
