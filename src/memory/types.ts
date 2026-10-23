export interface StyleRule {
  id: string;
  rule: string;
  examples?: string[];
  source?: "inferred" | "manual" | "review";
  confidence: number;
  embedding?: number[];
}

export interface ArchitectureNote {
  id: string;
  note: string;
  tags?: string[];
  source?: string;
  embedding?: number[];
}

export interface Pattern {
  id: string;
  description: string;
  preferred: boolean;
  examples?: string[];
  embedding?: number[];
}

export interface HistoricalFeedback {
  id: string;
  summary: string;
  prNumber?: number;
  frequency: number;
  lastSeen: string;
  embedding?: number[];
}

export interface RawSnippet {
  id: string;
  text: string;
  path?: string;
  prNumber?: number;
  author?: string;
  createdAt: string;
  embedding?: number[];
}

export interface ProjectMemory {
  repoId: string;
  repoName: string;
  styleRules: StyleRule[];
  architectureNotes: ArchitectureNote[];
  patterns: Pattern[];
  historicalFeedback: HistoricalFeedback[];
  rawSnippets: RawSnippet[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: number;
    prsAnalyzed: number;
    lastBootstrapAt?: string;
  };
}

export interface MemorySearchResult {
  content: string;
  type: "style" | "architecture" | "pattern" | "feedback" | "snippet";
  score: number;
  id?: string;
}
