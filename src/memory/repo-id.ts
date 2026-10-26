/**
 * Canonical repository identity for memory keys.
 * CLI and GitHub App must share the same id for the same repo.
 *
 * Format: github.com/owner/repo  (no protocol, no .git)
 */

export function githubRepoId(fullName: string, htmlUrl?: string): string {
  const name = fullName.trim().replace(/^\/+|\/+$/g, "");
  if (htmlUrl) {
    try {
      const u = new URL(htmlUrl);
      if (u.hostname) {
        return `${u.hostname}/${name}`.replace(/\/+/g, "/");
      }
    } catch {
      /* fall through */
    }
  }
  // Default to github.com for GitHub App payloads
  if (name.startsWith("github.com/")) return name;
  return `github.com/${name}`;
}
