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
    // save() increments version — start at 0 so first persist is v1
    memory.metadata.version = 0;
    await this.save(memory);
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

    const typeBoost: Record<string, number> = {
      style: 1.15,
      architecture: 1.2,
      pattern: 1.1,
      feedback: 1.05,
      snippet: 0.95,
    };

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
      score *= typeBoost[type] ?? 1;
      // Prefer higher-confidence style rules when present in content path — applied below for rules
      if (score > 0.15) results.push({ content, type, score, id });
    };

    for (const r of memory.styleRules) {
      const before = results.length;
      push(r.rule, "style", r.embedding, r.id);
      if (results.length > before && typeof r.confidence === "number") {
        results[results.length - 1].score *= 0.9 + 0.2 * r.confidence;
      }
    }
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

  /** Remove a memory item by id across collections. */

  /** Update style / architecture / pattern text by id (prefix match). */
  async updateById(
    repoId: string,
    id: string,
    content: string
  ): Promise<boolean> {
    const memory = await this.require(repoId);
    const text = content.trim();
    if (!text) return false;

    const style = memory.styleRules.find(
      (r) => r.id === id || r.id.startsWith(id)
    );
    if (style) {
      style.rule = text;
      style.updatedAt = new Date().toISOString();
      style.embedding = (await embed(text)) ?? undefined;
      await this.save(memory);
      return true;
    }

    const arch = memory.architectureNotes.find(
      (n) => n.id === id || n.id.startsWith(id)
    );
    if (arch) {
      arch.note = text;
      arch.embedding = (await embed(text)) ?? undefined;
      await this.save(memory);
      return true;
    }

    const pat = memory.patterns.find(
      (x) => x.id === id || x.id.startsWith(id)
    );
    if (pat) {
      pat.description = text;
      pat.embedding = (await embed(text)) ?? undefined;
      await this.save(memory);
      return true;
    }

    return false;
  }

  async removeById(
    repoId: string,
    id: string
  ): Promise<{ removed: boolean; type?: string }> {
    const memory = await this.require(repoId);
    const collections: Array<{
      key: keyof ProjectMemory;
      type: string;
    }> = [
      { key: "styleRules", type: "style" },
      { key: "architectureNotes", type: "architecture" },
      { key: "patterns", type: "pattern" },
      { key: "historicalFeedback", type: "feedback" },
      { key: "rawSnippets", type: "snippet" },
    ];

    for (const { key, type } of collections) {
      const arr = memory[key] as Array<{ id: string }>;
      if (!Array.isArray(arr)) continue;
      const idx = arr.findIndex((x) => x.id === id || x.id.startsWith(id));
      if (idx >= 0) {
        arr.splice(idx, 1);
        await this.save(memory);
        return { removed: true, type };
      }
    }
    return { removed: false };
  }

  /** Update a style rule body by id (prefix match ok). */
  async updateStyleRule(
    repoId: string,
    id: string,
    rule: string
  ): Promise<boolean> {
    const memory = await this.require(repoId);
    const item = memory.styleRules.find(
      (r) => r.id === id || r.id.startsWith(id)
    );
    if (!item) return false;
    item.rule = rule.trim();
    item.updatedAt = new Date().toISOString();
    item.embedding = (await embed(item.rule)) ?? undefined;
    await this.save(memory);
    return true;
  }


  async buildContext(repoId: string, diffSnippet = ""): Promise<string> {
    const memory = await this.get(repoId);
    if (!memory) return "No project memory available yet.";

    // Priority-ordered token budget for the memory section of the prompt
    const budget = 4_500;
    const parts: string[] = [];
    let used = 0;

    const header = [
      `Repository: ${memory.repoName}`,
      memory.remoteUrl ? `Remote: ${memory.remoteUrl}` : null,
      `Memory version: ${memory.metadata.version} · PRs analyzed: ${memory.metadata.prsAnalyzed}`,
    ]
      .filter(Boolean)
      .join("\n");
    parts.push(header);
    used += header.length;

    const addSection = (title: string, lines: string[], maxLines: number) => {
      const sliced = lines.filter(Boolean).slice(0, maxLines);
      if (!sliced.length) return;
      const block = `\n### ${title}\n${sliced.map((l) => `- ${l}`).join("\n")}`;
      if (used + block.length > budget) return;
      parts.push(block);
      used += block.length;
    };

    // High-confidence / manual rules first
    const styles = [...memory.styleRules].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
    );
    addSection(
      "Style Rules (authoritative)",
      styles.map((r) => {
        const src = r.source ? ` [${r.source}]` : "";
        const conf =
          typeof r.confidence === "number" ? ` (conf ${r.confidence.toFixed(2)})` : "";
        return `${r.rule}${src}${conf}`;
      }),
      18
    );

    addSection(
      "Architecture Notes (authoritative)",
      memory.architectureNotes.map((n) => {
        const tags = n.tags?.length ? ` {${n.tags.join(", ")}}` : "";
        return `${n.note}${tags}`;
      }),
      12
    );

    const preferred = memory.patterns.filter((p) => p.preferred);
    const discouraged = memory.patterns.filter((p) => !p.preferred);
    addSection(
      "Preferred Patterns",
      preferred.map((p) => p.description),
      10
    );
    addSection(
      "Discouraged Patterns",
      discouraged.map((p) => p.description),
      10
    );

    const feedback = [...memory.historicalFeedback]
      .sort((a, b) => b.frequency - a.frequency || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, 12)
      .map((f) => {
        const pr = f.prNumber ? ` PR#${f.prNumber}` : "";
        return `${f.summary} (seen ${f.frequency}×${pr})`;
      });
    addSection("Recurring Human Review Feedback", feedback, 12);

    if (diffSnippet.trim()) {
      const relevant = await this.search(repoId, diffSnippet, 10);
      addSection(
        "Most Relevant to this change",
        relevant.map(
          (r) =>
            `(${r.type}, score ${r.score.toFixed(2)}) ${r.content.slice(0, 220)}`
        ),
        10
      );
    }

    return parts.length > 1
      ? parts.join("\n")
      : "No project memory available yet.";
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
    const keptFb: HistoricalFeedback[] = [];
    for (const item of feedback) {
      const twin = keptFb.find((k) => similarity(k.summary, item.summary) >= 0.72);
      if (twin) {
        twin.frequency += item.frequency;
        if (item.lastSeen > twin.lastSeen) twin.lastSeen = item.lastSeen;
        merged++;
      } else {
        keptFb.push({ ...item });
      }
    }
    memory.historicalFeedback = keptFb;

    // Merge near-duplicate style rules (keep higher confidence)
    const keptRules: StyleRule[] = [];
    for (const rule of [...memory.styleRules].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
    )) {
      const twin = keptRules.find((k) => similarity(k.rule, rule.rule) >= 0.8);
      if (twin) {
        twin.confidence = Math.max(twin.confidence ?? 0, rule.confidence ?? 0);
        merged++;
      } else {
        keptRules.push({ ...rule });
      }
    }
    memory.styleRules = keptRules;

    // Merge near-duplicate patterns
    const keptPat: Pattern[] = [];
    for (const pat of memory.patterns) {
      const twin = keptPat.find(
        (k) =>
          k.preferred === pat.preferred &&
          similarity(k.description, pat.description) >= 0.8
      );
      if (twin) {
        merged++;
      } else {
        keptPat.push({ ...pat });
      }
    }
    memory.patterns = keptPat;

    const before = memory.rawSnippets.length;
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


  /** List all memory files under the data dir. */
  async listAll(): Promise<ProjectMemory[]> {
    await ensureDataDir();
    const dir = dataDir();
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out: ProjectMemory[] = [];
    for (const f of files) {
      if (!f.endsWith(".json") || f === "last-review.json") continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const mem = JSON.parse(raw) as ProjectMemory;
        if (mem?.repoId) out.push(mem);
      } catch {
        /* skip corrupt */
      }
    }
    return out;
  }

  /**
   * Migrate legacy numeric / bare owner-repo ids to github.com/owner/repo.
   * Merges into existing canonical memory when both exist.
   */
  async migrateRepoIds(): Promise<{
    migrated: string[];
    merged: string[];
    skipped: string[];
  }> {
    const all = await this.listAll();
    const migrated: string[] = [];
    const merged: string[] = [];
    const skipped: string[] = [];

    for (const mem of all) {
      const oldId = mem.repoId;
      // Already canonical
      if (oldId.startsWith("github.com/") || oldId.includes("://")) {
        skipped.push(oldId);
        continue;
      }
      // Numeric github id only — cannot recover owner/repo without remoteUrl
      const looksNumeric = /^\d+$/.test(oldId);
      let newId: string | null = null;

      if (mem.remoteUrl) {
        newId = mem.remoteUrl
          .replace(/^https?:\/\//, "")
          .replace(/\.git$/, "")
          .replace(/\/$/, "");
      } else if (mem.repoName && mem.repoName.includes("/")) {
        newId = `github.com/${mem.repoName}`;
      } else if (!looksNumeric && oldId.includes("/")) {
        newId = oldId.startsWith("github.com/") ? oldId : `github.com/${oldId}`;
      }

      if (!newId || newId === oldId) {
        skipped.push(oldId);
        continue;
      }

      const existing = await this.get(newId);
      if (existing) {
        // Merge arrays (dedupe by text-ish keys)
        const mergeRules = (a: any[], b: any[], key: string) => {
          const seen = new Set(a.map((x) => String(x[key] || "").toLowerCase()));
          for (const item of b) {
            const k = String(item[key] || "").toLowerCase();
            if (k && seen.has(k)) continue;
            a.push(item);
            if (k) seen.add(k);
          }
        };
        mergeRules(existing.styleRules, mem.styleRules || [], "rule");
        mergeRules(existing.architectureNotes, mem.architectureNotes || [], "note");
        mergeRules(existing.patterns, mem.patterns || [], "description");
        mergeRules(existing.historicalFeedback, mem.historicalFeedback || [], "summary");
        existing.rawSnippets = [
          ...(mem.rawSnippets || []),
          ...(existing.rawSnippets || []),
        ].slice(0, 200);
        existing.metadata.prsAnalyzed =
          (existing.metadata.prsAnalyzed || 0) + (mem.metadata?.prsAnalyzed || 0);
        existing.metadata.updatedAt = new Date().toISOString();
        await this.save(existing);
        // Remove old file
        try {
          await fs.unlink(memoryPath(oldId));
        } catch {
          /* ignore */
        }
        merged.push(`${oldId} → ${newId}`);
      } else {
        mem.repoId = newId;
        if (!mem.remoteUrl) mem.remoteUrl = newId;
        mem.metadata.updatedAt = new Date().toISOString();
        await this.save(mem);
        if (memoryPath(oldId) !== memoryPath(newId)) {
          try {
            await fs.unlink(memoryPath(oldId));
          } catch {
            /* ignore */
          }
        }
        migrated.push(`${oldId} → ${newId}`);
      }
    }

    return { migrated, merged, skipped };
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
