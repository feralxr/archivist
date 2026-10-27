/**
 * Core shared types for Archivist
 */

export type ModelProvider =
  | "openrouter"
  | "anthropic"
  | "openai"
  | "google"
  | "custom";

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export type CommentSeverity = "info" | "warning" | "error" | "suggestion";

export type CommentCategory =
  | "style"
  | "architecture"
  | "history"
  | "bug"
  | "refactor"
  | "security"
  | "performance"
  | "testing"
  | "docs"
  | "other";

export interface ReviewComment {
  path: string;
  line?: number;
  body: string;
  severity: CommentSeverity;
  category: CommentCategory;
  /** Why this comment was made — preferably cites project memory */
  explanation?: string;
  /** Optional confidence 0–1 from post-processing */
  confidence?: number;
  /** Memory rule ids or short fingerprints this comment relates to */
  memoryRefs?: string[];
}

export interface DiffStatsSummary {
  files: number;
  codeFiles: number;
  docFiles: number;
  lockOrGeneratedFiles?: number;
  added: number;
  removed: number;
  docsOnly: boolean;
  mostlyGenerated?: boolean;
}

export interface ReviewMeta {
  durationMs?: number;
  memoryChars?: number;
  memoryItemsUsed?: number;
  diffChars?: number;
  diffStats?: DiffStatsSummary;
  truncatedDiff?: boolean;
  parseFallback?: boolean;
  promptProfile?: string;
}

export interface ProjectMemorySnapshot {
  repoId: string;
  styleRules: string[];
  architectureNotes: string[];
  preferredPatterns: string[];
  discouragedPatterns: string[];
  historicalFeedback: string[];
  lastUpdated: string;
}

export interface ReviewResult {
  comments: ReviewComment[];
  summary: string;
  modelUsed: string;
  meta?: ReviewMeta;
}
