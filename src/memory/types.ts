export interface StyleRule {
  id: string;
  rule: string;
  examples?: string[];
  source?: "inferred" | "manual" | "review";
  confidence: number;
}

export interface ArchitectureNote {
  id: string;
  note: string;
  tags?: string[];
  source?: string;
}

export interface Pattern {
  id: string;
  description: string;
  preferred: boolean; // true = preferred, false = discouraged
  examples?: string[];
}

export interface HistoricalFeedback {
  id: string;
  summary: string;
  prNumber?: number;
  frequency: number;
  lastSeen: string;
}

export interface ProjectMemory {
  repoId: string;
  repoName: string;
  styleRules: StyleRule[];
  architectureNotes: ArchitectureNote[];
  patterns: Pattern[];
  historicalFeedback: HistoricalFeedback[];
  rawReviewSnippets: string[]; // recent high-signal review comments
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: number;
    prsAnalyzed: number;
  };
}

export interface MemorySearchResult {
  content: string;
  type: "style" | "architecture" | "pattern" | "feedback";
  score: number;
}
