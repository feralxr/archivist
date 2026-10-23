import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ProjectMemory,
  StyleRule,
  ArchitectureNote,
  Pattern,
  HistoricalFeedback,
  MemorySearchResult,
} from "./types.js";

const DATA_DIR = path.join(process.cwd(), ".archivist");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function memoryPath(repoId: string) {
  // sanitize repoId for filesystem
  const safe = repoId.replace(/[^a-zA-Z0-9-_.]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

export class MemoryStore {
  async get(repoId: string): Promise<ProjectMemory | null> {
    try {
      const raw = await fs.readFile(memoryPath(repoId), "utf-8");
      return JSON.parse(raw) as ProjectMemory;
    } catch {
      return null;
    }
  }

  async save(memory: ProjectMemory): Promise<void> {
    await ensureDataDir();
    memory.metadata.updatedAt = new Date().toISOString();
    memory.metadata.version += 1;
    await fs.writeFile(memoryPath(memory.repoId), JSON.stringify(memory, null, 2), "utf-8");
  }

  async create(repoId: string, repoName: string): Promise<ProjectMemory> {
    const now = new Date().toISOString();
    const memory: ProjectMemory = {
      repoId,
      repoName,
      styleRules: [],
      architectureNotes: [],
      patterns: [],
      historicalFeedback: [],
      rawReviewSnippets: [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        version: 1,
        prsAnalyzed: 0,
      },
    };
    await this.save(memory);
    return memory;
  }

  async getOrCreate(repoId: string, repoName: string): Promise<ProjectMemory> {
    const existing = await this.get(repoId);
    if (existing) return existing;
    return this.create(repoId, repoName);
  }

  async addStyleRule(repoId: string, rule: Omit<StyleRule, "id">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    memory.styleRules.push({ ...rule, id: randomUUID() });
    await this.save(memory);
  }

  async addArchitectureNote(repoId: string, note: Omit<ArchitectureNote, "id">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    memory.architectureNotes.push({ ...note, id: randomUUID() });
    await this.save(memory);
  }

  async addPattern(repoId: string, pattern: Omit<Pattern, "id">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    memory.patterns.push({ ...pattern, id: randomUUID() });
    await this.save(memory);
  }

  async addHistoricalFeedback(repoId: string, feedback: Omit<HistoricalFeedback, "id">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    memory.historicalFeedback.push({ ...feedback, id: randomUUID() });
    await this.save(memory);
  }

  async addRawSnippet(repoId: string, snippet: string): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    memory.rawReviewSnippets.unshift(snippet);
    // keep only recent high-signal snippets
    memory.rawReviewSnippets = memory.rawReviewSnippets.slice(0, 50);
    await this.save(memory);
  }

  /**
   * Simple keyword + exact retrieval for now.
   * Will be replaced with proper embeddings + vector search later.
   */
  async search(repoId: string, query: string, limit = 12): Promise<MemorySearchResult[]> {
    const memory = await this.get(repoId);
    if (!memory) return [];

    const q = query.toLowerCase();
    const results: MemorySearchResult[] = [];

    for (const rule of memory.styleRules) {
      const score = scoreMatch(rule.rule, q);
      if (score > 0) results.push({ content: rule.rule, type: "style", score });
    }
    for (const note of memory.architectureNotes) {
      const score = scoreMatch(note.note, q);
      if (score > 0) results.push({ content: note.note, type: "architecture", score });
    }
    for (const pattern of memory.patterns) {
      const score = scoreMatch(pattern.description, q);
      if (score > 0) {
        results.push({
          content: `${pattern.preferred ? "Preferred" : "Discouraged"}: ${pattern.description}`,
          type: "pattern",
          score,
        });
      }
    }
    for (const fb of memory.historicalFeedback) {
      const score = scoreMatch(fb.summary, q);
      if (score > 0) results.push({ content: fb.summary, type: "feedback", score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Build a compact context string for the model.
   */
  async buildContext(repoId: string, diffSnippet = ""): Promise<string> {
    const memory = await this.get(repoId);
    if (!memory) return "No project memory available yet.";

    const relevant = diffSnippet
      ? await this.search(repoId, diffSnippet, 8)
      : [];

    const parts: string[] = [];

    if (memory.styleRules.length) {
      parts.push("### Style Rules");
      parts.push(...memory.styleRules.slice(0, 15).map((r) => `- ${r.rule}`));
    }

    if (memory.architectureNotes.length) {
      parts.push("\n### Architecture Notes");
      parts.push(...memory.architectureNotes.slice(0, 10).map((n) => `- ${n.note}`));
    }

    const preferred = memory.patterns.filter((p) => p.preferred).slice(0, 8);
    const discouraged = memory.patterns.filter((p) => !p.preferred).slice(0, 8);

    if (preferred.length) {
      parts.push("\n### Preferred Patterns");
      parts.push(...preferred.map((p) => `- ${p.description}`));
    }
    if (discouraged.length) {
      parts.push("\n### Discouraged Patterns");
      parts.push(...discouraged.map((p) => `- ${p.description}`));
    }

    if (memory.historicalFeedback.length) {
      parts.push("\n### Recurring Review Feedback");
      parts.push(
        ...memory.historicalFeedback
          .slice(0, 8)
          .map((f) => `- ${f.summary} (seen ${f.frequency} times)`)
      );
    }

    if (relevant.length) {
      parts.push("\n### Most Relevant to this diff");
      parts.push(...relevant.map((r) => `- (${r.type}) ${r.content}`));
    }

    return parts.length ? parts.join("\n") : "No project memory available yet.";
  }
}

function scoreMatch(text: string, query: string): number {
  const t = text.toLowerCase();
  if (t.includes(query)) return 10;
  const words = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const w of words) {
    if (t.includes(w)) score += 2;
  }
  return score;
}

export const memoryStore = new MemoryStore();
