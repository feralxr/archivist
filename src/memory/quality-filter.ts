/**
 * Shared filters for human review text worth storing / learning from.
 */

const NOISE_EXACT =
  /^(lgtm|looks good(\s+to\s+me)?|ship it|nit\.?|👍+|✅+|approved\.?|same\.?)$/i;

const BOT_LOGIN =
  /\[bot\]$|dependabot|renovate|github-actions|codecov|sonarcloud|archivist/i;

export function isBotLogin(login?: string | null): boolean {
  if (!login) return false;
  return BOT_LOGIN.test(login);
}

/**
 * Whether a review comment body is worth ingesting into memory.
 */
export function isUsefulReviewComment(body: string): boolean {
  const t = body.trim();
  if (t.length < 30 || t.length > 2000) return false;
  if (NOISE_EXACT.test(t)) return false;
  // Pure emoji / reaction
  if (/^[\s\p{Emoji}\p{Emoji_Component}]+$/u.test(t) && t.length < 20) return false;
  // Huge pasted diffs / code dumps
  const lines = t.split("\n");
  if (lines.length > 40) return false;
  const diffLike = lines.filter((l) => /^[+\-@]/.test(l)).length;
  if (diffLike > 12) return false;
  // Archivist's own markers
  if (t.includes("<!-- archivist") || t.includes("### Archivist")) return false;
  // Very low signal
  if (/^(thanks|thank you|fixed|done|addressed)\.?$/i.test(t)) return false;
  return true;
}

/** Normalize a short feedback summary for storage. */
export function normalizeFeedbackSummary(body: string, max = 300): string {
  return body.replace(/\s+/g, " ").trim().slice(0, max);
}
