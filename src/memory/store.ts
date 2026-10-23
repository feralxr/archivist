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
  MemoryStats,
} from "./types.js";

function dataDir() {
  return env.ARCHIVIST_DATA_DIR || path.join(process.cwd(), ".archivist");
}

async function ensureDataDir() {
  await fs.mkdir(dataDir(), { recursive: true });
}

function memoryPath(repoId: string) {
  const safe = repoId.replace(/[^a-zA-Z0-9-_.]/g, "_");
  return path.join(dataDir(), `${safe}.json`);
}

export class MemoryStore {
  async get(repoId: string): Promise<ProjectMemory | null> {
    try {
      const raw = await fs.readFile(memoryPath(repoId), "utf-8");
      const memory = JSON.parse(raw) as ProjectMemory;
      // migrate legacy field if present
      if (!(memory as any).rawSnippets && (memory as any).rawReviewSnippets) {
        memory.rawSnippets = ((memory as any).rawReviewSnippets as string[]).map(
          (text) => ({
            id: randomUUID(),
            text,
            createdAt: new Date().toISOString(),
          })
        );
      }
      if (!memory.rawSnippets) memory.rawSnippets = [];
      return memory;
    } catch {
      return null;
    }
  }

  async save(memory: ProjectMemory): Promise<void> {
    await ensureDataDir();
    memory.metadata.updatedAt = new Date().toISOString();
    memory.metadata.version += 1;

    const file = memoryPath(memory.repoId);
    const tmp = `${file}.${process.pid}.tmp`;
    const payload = JSON.stringify(memory, null, 2);
    await fs.writeFile(tmp, payload, "utf-8");
    await fs.rename(tmp, file);
  }

  async create(
    repoId: string,
    repoName: string,
    remoteUrl?: string
  ): Promise<ProjectMemory> {
    const now = new Date().toISOString();
    const memory: ProjectMemory = {
      repoId,
      repoName,
      remoteUrl,
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
    // version was bumped by save from 1→2; reset to 1 for create semantics
    memory.metadata.version = 1;
    await fs.writeFile(memoryPath(repoId), JSON.stringify(memory, null, 2), "utf-8");
    return memory;
  }

  async getOrCreate(
    repoId: string,
    repoName: string,
    remoteUrl?: string
  ): Promise<ProjectMemory> {
    const existing = await this.get(repoId);
    if (existing) {
      if (remoteUrl && !existing.remoteUrl) {
        existing.remoteUrl = remoteUrl;
        await this.save(existing);
      }
      return existing;
    }
    return this.create(repoId, repoName, remoteUrl);
  }

  async addStyleRule(
    repoId: string,
    rule: Omit<StyleRule, "id" | "embedding" | "createdAt">
  ): Promise<void> {
    const memory = await this.require(repoId);
    // dedupe exact rules
    if (memory.styleRules.some((r) => r.rule.toLowerCase() === rule.rule.toLowerCase())) {
      return;
    }
    const embedding = await embed(rule.rule);
    memory.styleRules.push({
      ...rule,
      id: randomUUID(),
      embedding: embedding ?? undefined,
      createdAt: new Date().toISOString(),
    });
    await this.save(memory);
  }

  async addArchitectureNote(
    repoId: string,
    note: Omit<ArchitectureNote, "id" | "embedding" | "createdAt">
  ): Promise<void> {
    const memory = await this.require(repoId);
    if (memory.architectureNotes.some((n) => n.note.toLowerCase() === note.note.toLowerCase())) {
      return;
    }
    const embedding = await embed(note.note);
    memory.architectureNotes.push({
      ...note,
      id: randomUUID(),
      embedding: embedding ?? undefined,
      createdAt: new Date().toISOString(),
    });
    await this.save(memory);
  }

  async addPattern(
    repoId: string,
    pattern: Omit<Pattern, "id" | "embedding" | "createdAt">
  ): Promise<void> {
    const memory = await this.require(repoId);
    if (
      memory.patterns.some(
        (p) =>
          p.description.toLowerCase() === pattern.description.toLowerCase() &&
          p.preferred === pattern.preferred
      )
    ) {
      return;
    }
    const embedding = await embed(pattern.description);
    memory.patterns.push({
      ...pattern,
      id: randomUUID(),
      embedding: embedding ?? undefined,
      createdAt: new Date().toISOString(),
    });
    await this.save(memory);
  }

  async addHistoricalFeedback(
    repoId: string,
    feedback: Omit<HistoricalFeedback, "id" | "embedding">
  ): Promise<void> {
    const memory = await this.require(repoId);
    const existing = memory.historicalFeedback.find(
      (f) => normalize(f.summary) === normalize(feedback.summary)
    );
    if (existing) {
      existing.frequency += 1;
      existing.lastSeen = feedback.lastSeen;
      if (feedback.prNumber) existing.prNumber = feedback.prNumber;
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

  async addRawSnippet(
    repoId: string,
    snippet: Omit<RawSnippet, "id" | "embedding">
  ): Promise<void> {
    const memory = await this.require(repoId);
    const embedding = await embed(snippet.text);
    memory.rawSnippets.unshift({
      ...snippet,
      id: randomUUID(),
      embedding: embedding ?? undefined,
    });
    memory.rawSnippets = memory.rawSnippets.slice(0, 120);
    await this.save(memory);
  }

  /**
   * Hybrid search: vector when embeddings exist, lexical otherwise.
   */
  async search(
    repoId: string,
    query: string,
    limit = 12
  ): Promise<MemorySearchResult[]> {
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
    for (const n of memory.architectureNotes)
      push(n.note, "architecture", n.embedding, n.id);
    for (const p of memory.patterns) {
      const label = p.preferred ? "Preferred" : "Discouraged";
      push(`${label}: ${p.description}`, "pattern", p.embedding, p.id);
    }
    for (const f of memory.historicalFeedback)
      push(f.summary, "feedback", f.embedding, f.id);
    for (const s of memory.rawSnippets.slice(0, 50))
      push(s.text, "snippet", s.embedding, s.id);

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Build a token-budgeted context string for the model.
   */
  async buildContext(repoId: string, diffSnippet = ""): Promise<string> {
    const memory = await this.get(repoId);
    if (!memory) return "No project memory available yet.";

    const budget = 3500; // approximate chars for memory section
    const parts: string[] = [];
    let used = 0;

    const addSection = (title: string, lines: string[]) => {
      if (!lines.length) return;
      const block = `${parts.length ? "\n" : ""}### ${title}\n${lines.map((l) => `- ${l}`).join("\n")}`;
      if (used + block.length > budget) return;
      parts.push(block);
      used += block.length;
    };

    addSection(
      "Style Rules",
      memory.styleRules.slice(0, 15).map((r) => r.rule)
    );
    addSection(
      "Architecture Notes",
      memory.architectureNotes.slice(0, 10).map((n) => n.note)
    );

    const preferred = memory.patterns.filter((p) => p.preferred).slice(0, 8);
    const discouraged = memory.patterns.filter((p) => !p.preferred).slice(0, 8);
    addSection(
      "Preferred Patterns",
      preferred.map((p) => p.description)
    );
    addSection(
      "Discouraged Patterns",
      discouraged.map((p) => p.description)
    );

    const feedback = memory.historicalFeedback
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)
      .map((f) => `${f.summary} (seen ${f.frequency}×)`);
    addSection("Recurring Review Feedback", feedback);

    if (diffSnippet) {
      const relevant = await this.search(repoId, diffSnippet, 8);
      addSection(
        "Most Relevant to this change",
        relevant.map((r) => `(${r.type}) ${r.content.slice(0, 200)}`)
      );
    }

    return parts.length ? parts.join("\n") : "No project memory available yet.";
  }

  /**
   * Merge near-duplicate historical feedback and trim low-value snippets.
   */
  async consolidate(repoId: string): Promise<{ merged: number; trimmed: number }> {
    const memory = await this.require(repoId);
    let merged = 0;

    // Merge feedback with high lexical overlap
    const feedback = [...memory.historicalFeedback].sort(
      (a, b) => b.frequency - a.frequency
    );
    const kept: HistoricalFeedback[] = [];

    for (const item of feedback) {
      const twin = kept.find(
        (k) => similarity(k.summary, item.summary) >= 0.72
      );
      if (twin) {
        twin.frequency += item.frequency;
        if (item.lastSeen > twin.lastSeen) twin.lastSeen = item.lastSeen;
        merged++;
      } else {
        kept.push({ ...item });
      }
    }
    memory.historicalFeedback = kept;

    const before = memory.rawSnippets.length;
    // Prefer longer, more recent snippets
    memory.rawSnippets = memory.rawSnippets
      .filter((s) => s.text.trim().length >= 30)
      .slice(0, 80);
    const trimmed = Math.max(0, before - memory.rawSnippets.length);

    memory.metadata.lastConsolidatedAt = new Date().toISOString();
    await this.save(memory);
    return { merged, trimmed };
  }

  async stats(repoId: string): Promise<MemoryStats | null> {
    const memory = await this.get(repoId);
    if (!memory) return null;

    const hasEmbeddings =
      memory.styleRules.some((r) => r.embedding?.length) ||
      memory.patterns.some((p) => p.embedding?.length) ||
      memory.historicalFeedback.some((f) => f.embedding?.length);

    return {
      styleRules: memory.styleRules.length,
      architectureNotes: memory.architectureNotes.length,
      preferredPatterns: memory.patterns.filter((p) => p.preferred).length,
      discouragedPatterns: memory.patterns.filter((p) => !p.preferred).length,
      historicalFeedback: memory.historicalFeedback.length,
      rawSnippets: memory.rawSnippets.length,
      prsAnalyzed: memory.metadata.prsAnalyzed,
      version: memory.metadata.version,
      hasEmbeddings,
    };
  }

  async exportJSON(repoId: string): Promise<ProjectMemory | null> {
    return this.get(repoId);
  }

  async importJSON(memory: ProjectMemory): Promise<void> {
    if (!memory.repoId || !memory.repoName) {
      throw new Error("Invalid memory file: missing repoId/repoName");
    }
    if (!memory.metadata) {
      memory.metadata = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        prsAnalyzed: 0,
      };
    }
    memory.rawSnippets = memory.rawSnippets || [];
    memory.styleRules = memory.styleRules || [];
    memory.architectureNotes = memory.architectureNotes || [];
    memory.patterns = memory.patterns || [];
    memory.historicalFeedback = memory.historicalFeedback || [];
    await this.save(memory);
  }

  private async require(repoId: string): Promise<ProjectMemory> {
    const memory = await this.get(repoId);
    if (!memory) throw new Error(`No memory found for ${repoId}. Run archivist init first.`);
    return memory;
  }
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
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

/** Jaccard-ish token similarity */
function similarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(normalize(b).split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export const memoryStore = new MemoryStore();
