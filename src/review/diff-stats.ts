/**
 * Lightweight diff analysis for routing / summaries.
 */

const DOC_EXT = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);

const LOCK_OR_GENERATED = [
  /package-lock\.json$/i,
  /pnpm-lock\.yaml$/i,
  /yarn\.lock$/i,
  /Cargo\.lock$/i,
  /poetry\.lock$/i,
  /composer\.lock$/i,
  /\.min\.(js|css)$/i,
  /\.map$/i,
  /\.snap$/i,
];

export interface DiffStats {
  files: number;
  codeFiles: number;
  docFiles: number;
  lockOrGeneratedFiles: number;
  added: number;
  removed: number;
  paths: string[];
  docsOnly: boolean;
  /** True when the only non-doc changes are lockfiles / minified / maps */
  mostlyGenerated: boolean;
}

export function analyzeDiff(diff: string): DiffStats {
  const paths = new Set<string>();
  let added = 0;
  let removed = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (m) paths.add(m[2]);
      continue;
    }
    if (line.startsWith("+++ b/")) {
      const p = line.slice(6).trim();
      if (p !== "/dev/null") paths.add(p);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }

  const list = [...paths];
  let docFiles = 0;
  let codeFiles = 0;
  let lockOrGeneratedFiles = 0;

  for (const p of list) {
    const lower = p.toLowerCase();
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
    const isDoc =
      DOC_EXT.has(ext) ||
      lower.endsWith("changelog") ||
      lower.includes("changelog.");
    const isGen = LOCK_OR_GENERATED.some((re) => re.test(p));

    if (isGen) lockOrGeneratedFiles++;
    if (isDoc) docFiles++;
    else if (!isGen) codeFiles++;
  }

  const docsOnly = list.length > 0 && codeFiles === 0 && lockOrGeneratedFiles === 0;
  const mostlyGenerated =
    list.length > 0 &&
    codeFiles === 0 &&
    lockOrGeneratedFiles > 0 &&
    docFiles + lockOrGeneratedFiles === list.length;

  return {
    files: list.length,
    codeFiles,
    docFiles,
    lockOrGeneratedFiles,
    added,
    removed,
    paths: list,
    docsOnly,
    mostlyGenerated,
  };
}
