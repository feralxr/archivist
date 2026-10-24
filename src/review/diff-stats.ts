/**
 * Lightweight diff analysis for routing / summaries.
 */

const DOC_EXT = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".rst",
  ".adoc",
]);

export interface DiffStats {
  files: number;
  codeFiles: number;
  docFiles: number;
  added: number;
  removed: number;
  paths: string[];
  docsOnly: boolean;
}

export function analyzeDiff(diff: string): DiffStats {
  const paths = new Set<string>();
  let added = 0;
  let removed = 0;
  let currentPath = "";

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (m) {
        currentPath = m[2];
        paths.add(currentPath);
      }
      continue;
    }
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice(6).trim();
      if (currentPath !== "/dev/null") paths.add(currentPath);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }

  const list = [...paths];
  let docFiles = 0;
  let codeFiles = 0;
  for (const p of list) {
    const lower = p.toLowerCase();
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
    if (
      DOC_EXT.has(ext) ||
      lower.endsWith("changelog") ||
      lower.includes("changelog.")
    ) {
      docFiles++;
    } else {
      codeFiles++;
    }
  }

  return {
    files: list.length,
    codeFiles,
    docFiles,
    added,
    removed,
    paths: list,
    docsOnly: list.length > 0 && codeFiles === 0,
  };
}
