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
    memory.styleRules.map((r) => normalizeKey(r.rule))
  );
  const existingPatterns = new Set(
    memory.patterns.map((p) => normalizeKey(p.description))
  );

  for (const fb of memory.historicalFeedback) {
    const summary = fb.summary.trim();
    if (summary.length < 20 || summary.length > 220) continue;
    const strong = /\b(must|never|always|do not|don't|avoid|require|forbidden)\b/i.test(
      summary
    );
    // Promote recurring feedback, or single strong directives
    if (fb.frequency < 2 && !(strong && fb.frequency >= 1)) continue;
    const key = normalizeKey(summary);
    if (existingRules.has(key) || existingPatterns.has(key)) continue;

    if (looksLikeStyleRule(summary)) {
      await memoryStore.addStyleRule(repoId, {
        rule: cleanRule(summary),
        source: "review",
        confidence: Math.min(0.5 + fb.frequency * 0.08, 0.92),
      });
      existingRules.add(key);
      promoted++;
      continue;
    }

    if (looksLikeArchitecture(summary)) {
      await memoryStore.addArchitectureNote(repoId, {
        note: cleanRule(summary),
        source: "review",
      });
      promoted++;
      continue;
    }

    if (looksLikePattern(summary)) {
      const preferred = !/don'?t|avoid|never|discourag|do not/i.test(summary);
      await memoryStore.addPattern(repoId, {
        description: cleanRule(summary),
        preferred,
      });
      existingPatterns.add(key);
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
  const existing = new Set(memory.styleRules.map((r) => normalizeKey(r.rule)));

  for (const text of candidates.slice(0, 20)) {
    if (!looksLikeStyleRule(text) && !looksLikePattern(text)) continue;

    const rule = cleanRule(text);
    if (rule.length < 16 || rule.length > 180) continue;
    const key = normalizeKey(rule);
    if (existing.has(key)) continue;

    if (looksLikeStyleRule(text)) {
      await memoryStore.addStyleRule(repoId, {
        rule,
        source: "inferred",
        confidence: 0.52,
      });
      existing.add(key);
      inferred++;
    } else if (looksLikePattern(text)) {
      const preferred = !/don'?t|avoid|never|discourag|do not/i.test(text);
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

function looksLikeArchitecture(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("architecture") ||
    t.includes("layer") ||
    t.includes("boundary") ||
    t.includes("must not import") ||
    t.includes("belongs in") ||
    t.includes("separation of concerns") ||
    t.includes("domain layer") ||
    t.includes("infrastructure")
  );
}

function looksLikeStyleRule(text: string): boolean {
  const t = text.toLowerCase();
  const cues = [
    "prefer",
    "use ",
    "always ",
    "never ",
    "don't ",
    "do not ",
    "avoid ",
    "must ",
    "should ",
    "naming",
    "semicolon",
    "import ",
    "export ",
    "async",
    "await",
    "type ",
    "interface ",
    "const ",
    "early return",
    "error handling",
    "logging",
    "public api",
    "breaking change",
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
    t.includes("convention") ||
    t.includes("we prefer") ||
    t.includes("team standard")
  );
}

function cleanRule(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function rankSnippetCandidates(snippets: RawSnippet[]): string[] {
  return [...snippets]
    .filter((s) => s.text && s.text.length >= 24 && s.text.length <= 300)
    .filter((s) => !/lgtm|looks good|nit:?\s*$/i.test(s.text.trim()))
    .sort((a, b) => {
      // Prefer lengths near ~80 chars (often a single clear instruction)
      return Math.abs(80 - a.text.length) - Math.abs(80 - b.text.length);
    })
    .map((s) => s.text.trim());
}

export function memoryQualityScore(memory: ProjectMemory): {
  score: number;
  label: string;
  tips: string[];
  breakdown: Record<string, number>;
} {
  const tips: string[] = [];
  const breakdown = {
    style: Math.min(memory.styleRules.length * 8, 32),
    architecture: Math.min(memory.architectureNotes.length * 8, 24),
    patterns: Math.min(memory.patterns.length * 5, 20),
    feedback: Math.min(memory.historicalFeedback.length * 3, 15),
    snippets: Math.min(memory.rawSnippets.length, 9),
  };

  let score =
    breakdown.style +
    breakdown.architecture +
    breakdown.patterns +
    breakdown.feedback +
    breakdown.snippets;

  // Bonus for evidence of real usage
  if (memory.metadata.prsAnalyzed >= 5) score = Math.min(100, score + 5);
  if (memory.metadata.lastBootstrapAt) score = Math.min(100, score + 3);

  if (memory.styleRules.length < 3) {
    tips.push('Add style rules: archivist memory:add -t style -c "..."');
  }
  if (memory.architectureNotes.length < 1) {
    tips.push(
      'Add architecture notes: archivist memory:add -t architecture -c "..."'
    );
  }
  if (memory.historicalFeedback.length + memory.rawSnippets.length < 5) {
    tips.push(
      "Run archivist memory:bootstrap owner/repo or review more PRs so Archivist can learn"
    );
  }
  if (memory.metadata.prsAnalyzed === 0) {
    tips.push(
      "No PRs analyzed yet — install the GitHub App or run memory:bootstrap"
    );
  }

  score = Math.min(100, score);
  const label =
    score >= 70
      ? "strong"
      : score >= 40
        ? "useful"
        : score >= 15
          ? "thin"
          : "empty";

  return { score, label, tips, breakdown };
}
