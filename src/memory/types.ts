export interface StyleRule {
  id: string;
  rule: string;
  examples?: string[];
  source?: "inferred" | "manual" | "review";
  confidence: number;
  embedding?: number[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ArchitectureNote {
  id: string;
  note: string;
  tags?: string[];
  source?: string;
  embedding?: number[];
  createdAt?: string;
}

export interface Pattern {
  id: string;
  description: string;
  preferred: boolean;
  examples?: string[];
  embedding?: number[];
  createdAt?: string;
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
  /** Optional canonical remote, e.g. github.com/org/repo */
  remoteUrl?: string;
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
    lastConsolidatedAt?: string;
  };
}

export interface MemorySearchResult {
  content: string;
  type: "style" | "architecture" | "pattern" | "feedback" | "snippet";
  score: number;
  id?: string;
}

export interface MemoryStats {
  styleRules: number;
  architectureNotes: number;
  preferredPatterns: number;
  discouragedPatterns: number;
  historicalFeedback: number;
  rawSnippets: number;
  prsAnalyzed: number;
  version: number;
  hasEmbeddings: boolean;
}
