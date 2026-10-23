import type { ProjectMemorySnapshot } from "../core/types.js";

/**
 * Project Memory Store
 * Designed to scale to large codebases.
 * Will use Postgres + pgvector (or equivalent) in production.
 */
export interface MemoryStore {
  get(repoId: string): Promise<ProjectMemorySnapshot | null>;
  update(repoId: string, patch: Partial<ProjectMemorySnapshot>): Promise<void>;
  search(repoId: string, query: string, limit?: number): Promise<string[]>;
}

export class InMemoryStore implements MemoryStore {
  private data = new Map<string, ProjectMemorySnapshot>();

  async get(repoId: string) {
    return this.data.get(repoId) ?? null;
  }

  async update(repoId: string, patch: Partial<ProjectMemorySnapshot>) {
    const existing = this.data.get(repoId) ?? {
      repoId,
      styleRules: [],
      architectureNotes: [],
      preferredPatterns: [],
      discouragedPatterns: [],
      historicalFeedback: [],
      lastUpdated: new Date().toISOString(),
    };
    this.data.set(repoId, { ...existing, ...patch, lastUpdated: new Date().toISOString() });
  }

  async search(repoId: string, _query: string, limit = 10) {
    const memory = await this.get(repoId);
    if (!memory) return [];
    // Placeholder — will become semantic search
    return [
      ...memory.styleRules,
      ...memory.architectureNotes,
      ...memory.preferredPatterns,
    ].slice(0, limit);
  }
}
