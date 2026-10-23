import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../core/config.js";
import { embed, cosine } from "./embeddings.js";
import type {
  ProjectMemory,
  StyleRule,
  ArchitectureNote,
  Pattern,
  HistoricalFeedback,
  RawSnippet,
  MemorySearchResult,
} from "./types.js";

const DATA_DIR = env.ARCHIVIST_DATA_DIR || path.join(process.cwd(), ".archivist");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function memoryPath(repoId: string) {
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
      rawSnippets: [],
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

  async addStyleRule(repoId: string, rule: Omit<StyleRule, "id" | "embedding">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    const embedding = await embed(rule.rule);
    memory.styleRules.push({ ...rule, id: randomUUID(), embedding: embedding ?? undefined });
    await this.save(memory);
  }

  async addArchitectureNote(repoId: string, note: Omit<ArchitectureNote, "id" | "embedding">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    const embedding = await embed(note.note);
    memory.architectureNotes.push({ ...note, id: randomUUID(), embedding: embedding ?? undefined });
    await this.save(memory);
  }

  async addPattern(repoId: string, pattern: Omit<Pattern, "id" | "embedding">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    const embedding = await embed(pattern.description);
    memory.patterns.push({ ...pattern, id: randomUUID(), embedding: embedding ?? undefined });
    await this.save(memory);
  }

  async addHistoricalFeedback(repoId: string, feedback: Omit<HistoricalFeedback, "id" | "embedding">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);

    const existing = memory.historicalFeedback.find(
      (f) => f.summary.toLowerCase() === feedback.summary.toLowerCase()
    );
    if (existing) {
      existing.frequency += 1;
      existing.lastSeen = feedback.lastSeen;
      await this.save(memory);
      return;
    }

    const embedding = await embed(feedback.summary);
    memory.historicalFeedback.push({
      ...feedback,
      id: randomUUID(),
      embedding: embedding ?? undefined,
    });
    await this.save(memory);
  }

  async addRawSnippet(repoId: string, snippet: Omit<RawSnippet, "id" | "embedding">): Promise<void> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}`);
    const embedding = await embed(snippet.text);
    memory.rawSnippets.unshift({
      ...snippet,
      id: randomUUID(),
      embedding: embedding ?? undefined,
    });
    memory.rawSnippets = memory.rawSnippets.slice(0, 100);
    await this.save(memory);
  }

  async search(repoId: string, query: string, limit = 12): Promise<MemorySearchResult[]> {
    const memory = await this.get(repoId);
    if (!memory) return [];

    const queryEmbedding = await embed(query);
    const results: MemorySearchResult[] = [];

    const push = (
      content: string,
      type: MemorySearchResult["type"],
      itemEmbedding?: number[],
      id?: string
    ) => {
      let score = 0;
      if (queryEmbedding && itemEmbedding) {
        score = cosine(queryEmbedding, itemEmbedding) * 10;
      } else {
        score = lexicalScore(content, query);
      }
      if (score > 0.15) results.push({ content, type, score, id });
    };

    for (const r of memory.styleRules) push(r.rule, "style", r.embedding, r.id);
    for (const n of memory.architectureNotes) push(n.note, "architecture", n.embedding, n.id);
    for (const p of memory.patterns) {
      const label = p.preferred ? "Preferred" : "Discouraged";
      push(`${label}: ${p.description}`, "pattern", p.embedding, p.id);
    }
    for (const f of memory.historicalFeedback) push(f.summary, "feedback", f.embedding, f.id);
    for (const s of memory.rawSnippets.slice(0, 40)) push(s.text, "snippet", s.embedding, s.id);

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async buildContext(repoId: string, diffSnippet = ""): Promise<string> {
    const memory = await this.get(repoId);
    if (!memory) return "No project memory available yet.";

    const relevant = diffSnippet ? await this.search(repoId, diffSnippet, 10) : [];
    const parts: string[] = [];

    if (memory.styleRules.length) {
      parts.push("### Style Rules");
      parts.push(...memory.styleRules.slice(0, 12).map((r) => `- ${r.rule}`));
    }
    if (memory.architectureNotes.length) {
      parts.push("\n### Architecture Notes");
      parts.push(...memory.architectureNotes.slice(0, 8).map((n) => `- ${n.note}`));
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
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 8)
          .map((f) => `- ${f.summary} (seen ${f.frequency}×)`)
      );
    }
    if (relevant.length) {
      parts.push("\n### Most Relevant to this change");
      parts.push(...relevant.map((r) => `- (${r.type}) ${r.content.slice(0, 220)}`));
    }

    return parts.length ? parts.join("\n") : "No project memory available yet.";
  }
}

function lexicalScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return 8;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  let score = 0;
  for (const w of words) if (t.includes(w)) score += 1.5;
  return score;
}

export const memoryStore = new MemoryStore();
