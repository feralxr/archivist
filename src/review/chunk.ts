/**
 * Split large multi-file diffs into reviewable chunks.
 * Each chunk is a set of complete file hunks under a size budget.
 */

export interface DiffChunk {
  index: number;
  paths: string[];
  text: string;
  chars: number;
}

const DEFAULT_BUDGET = 40_000; // chars per chunk

/**
 * Split a unified diff into chunks that prefer whole files.
 */
export function chunkDiff(
  diff: string,
  budget = DEFAULT_BUDGET
): DiffChunk[] {
  if (!diff || diff.length <= budget) {
    return [
      {
        index: 0,
        paths: extractPaths(diff),
        text: diff,
        chars: diff.length,
      },
    ];
  }

  const files = splitByFile(diff);
  const chunks: DiffChunk[] = [];
  let current: string[] = [];
  let currentPaths: string[] = [];
  let currentSize = 0;
  let index = 0;

  const flush = () => {
    if (!current.length) return;
    const text = current.join("");
    chunks.push({
      index,
      paths: [...currentPaths],
      text,
      chars: text.length,
    });
    index++;
    current = [];
    currentPaths = [];
    currentSize = 0;
  };

  for (const file of files) {
    // Single file larger than budget: take as its own chunk (still truncated by prompt later)
    if (file.text.length > budget) {
      flush();
      chunks.push({
        index,
        paths: file.path ? [file.path] : [],
        text: file.text,
        chars: file.text.length,
      });
      index++;
      continue;
    }
    if (currentSize + file.text.length > budget && current.length) {
      flush();
    }
    current.push(file.text);
    if (file.path) currentPaths.push(file.path);
    currentSize += file.text.length;
  }
  flush();

  return chunks.length
    ? chunks
    : [{ index: 0, paths: [], text: diff, chars: diff.length }];
}

function splitByFile(diff: string): Array<{ path?: string; text: string }> {
  const lines = diff.split("\n");
  const files: Array<{ path?: string; text: string }> = [];
  let buf: string[] = [];
  let path: string | undefined;

  const push = () => {
    if (!buf.length) return;
    files.push({ path, text: buf.join("\n") + "\n" });
    buf = [];
    path = undefined;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      push();
      const m = line.match(/diff --git a\/(.+) b\/(.+)/);
      path = m ? m[2] : undefined;
      buf.push(line);
      continue;
    }
    buf.push(line);
  }
  push();
  return files;
}

function extractPaths(diff: string): string[] {
  const paths: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (m && m[2] !== "/dev/null") paths.push(m[2]);
    }
  }
  return paths;
}
