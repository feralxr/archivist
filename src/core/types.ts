/**
 * Core shared types for Archivist
 */

export interface ModelConfig {
  provider: "openrouter" | "anthropic" | "openai" | "google" | "custom";
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ReviewComment {
  path: string;
  line?: number;
  body: string;
  severity: "info" | "warning" | "error" | "suggestion";
  category: "style" | "architecture" | "history" | "bug" | "refactor" | "other";
  explanation?: string; // Why this comment was made (from project memory)
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
