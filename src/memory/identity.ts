import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Resolve a stable repo identity for local CLI use.
 * Prefers git remote; falls back to directory path.
 */
export function resolveLocalRepoIdentity(cwd = process.cwd()): {
  repoId: string;
  repoName: string;
  remoteUrl?: string;
} {
  const repoName = path.basename(cwd) || "repo";

  try {
    const remote = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (remote) {
      const normalized = normalizeRemote(remote);
      return {
        repoId: normalized || cwd,
        repoName: extractRepoName(remote) || repoName,
        remoteUrl: normalized,
      };
    }
  } catch {
    // not a git repo or no origin
  }

  return { repoId: cwd, repoName };
}

function normalizeRemote(url: string): string {
  // git@github.com:org/repo.git → github.com/org/repo
  // https://github.com/org/repo.git → github.com/org/repo
  let u = url.trim();
  u = u.replace(/^git@([^:]+):/, "$1/");
  u = u.replace(/^https?:\/\//, "");
  u = u.replace(/\.git$/, "");
  u = u.replace(/\/$/, "");
  return u;
}

function extractRepoName(url: string): string | null {
  const norm = normalizeRemote(url);
  const parts = norm.split("/");
  if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  return parts[parts.length - 1] || null;
}

/**
 * Get current git diff for local review workflows.
 */
export function getGitDiff(
  cwd = process.cwd(),
  mode: "unstaged" | "staged" | "all" | "main" = "all"
): string {
  try {
    let cmd: string;
    switch (mode) {
      case "staged":
        cmd = "git diff --cached";
        break;
      case "unstaged":
        cmd = "git diff";
        break;
      case "main":
        cmd = "git diff main...HEAD 2>/dev/null || git diff master...HEAD 2>/dev/null || git diff";
        break;
      default:
        // staged + unstaged
        cmd = "git diff HEAD";
        break;
    }
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}
