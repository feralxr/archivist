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
  | "other";

export interface ReviewComment {
  path: string;
  line?: number;
  body: string;
  severity: CommentSeverity;
  category: CommentCategory;
  /** Why this comment was made (linked to project memory) */
  explanation?: string;
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
}
