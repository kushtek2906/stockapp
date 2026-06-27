import type { DecantCatalog, DecantCatalogEntry } from "../types";
import { normalizeName } from "./normalize";

/** Top candidate must score at or above this to be auto-accepted (no confirm). */
export const HIGH_CONFIDENCE = 0.82;
/** Below this, the match is treated as no match at all. */
export const LOW_CONFIDENCE = 0.45;

export interface MatchCandidate {
  entry: DecantCatalogEntry;
  score: number;
  matchedOn: "perfume" | "inspiration";
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Normalized edit-distance similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Average best-match similarity of each token in `xs` against any token in `ys`. */
function oneWayTokens(xs: string[], ys: string[]): number {
  if (xs.length === 0 || ys.length === 0) return 0;
  return (
    xs.reduce((sum, x) => sum + Math.max(...ys.map((y) => similarity(x, y))), 0) /
    xs.length
  );
}

/**
 * Token-set similarity: average best-match similarity of each token against the
 * other string's tokens, in both directions (min of the two). Handles word
 * reordering and per-word misspellings, e.g. "pasific ora" ↔ "pacific aura".
 */
export function tokenSetSimilarity(a: string, b: string): number {
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  return Math.min(oneWayTokens(ta, tb), oneWayTokens(tb, ta));
}

/**
 * How well `candidate`'s tokens are covered by `query`'s tokens (one-directional).
 * Rewards a full perfume name sitting *inside* a longer query (e.g. a brand prefix)
 * without penalizing the extra query words the way `tokenSetSimilarity` does.
 */
function coverage(candidate: string, query: string): number {
  return oneWayTokens(
    candidate.split(" ").filter(Boolean),
    query.split(" ").filter(Boolean),
  );
}

/**
 * Score a normalized query against one candidate name string. Coverage only counts
 * for multi-word candidates, so a single generic token (e.g. "oud") can't match any
 * query that merely contains it.
 */
function scoreVariant(q: string, candidate: string): number {
  if (candidate === "") return 0;
  const candidateTokens = candidate.split(" ").filter(Boolean);
  const cov = candidateTokens.length >= 2 ? 0.98 * coverage(candidate, q) : 0;
  return Math.max(similarity(q, candidate), tokenSetSimilarity(q, candidate), cov);
}

/**
 * Score one catalog entry against a (raw) query. Checks the bare perfume/inspiration
 * names AND brand-inclusive variants ("Brand Perfume"), so a query that includes the
 * brand (e.g. "French Avenue Aromatix Frostbite") still resolves to the right perfume.
 */
export function scoreEntry(query: string, entry: DecantCatalogEntry): MatchCandidate {
  const q = normalizeName(query);
  const brand = normalizeName(entry.brand);
  const perfume = normalizeName(entry.perfume);
  const inspiration = normalizeName(entry.inspiration);

  const perfumeScore = Math.max(
    scoreVariant(q, perfume),
    brand !== "" ? scoreVariant(q, `${brand} ${perfume}`.trim()) : 0,
  );
  const inspScore =
    inspiration !== ""
      ? Math.max(
          scoreVariant(q, inspiration),
          brand !== "" ? scoreVariant(q, `${brand} ${inspiration}`.trim()) : 0,
        )
      : 0;

  return perfumeScore >= inspScore
    ? { entry, score: perfumeScore, matchedOn: "perfume" }
    : { entry, score: inspScore, matchedOn: "inspiration" };
}

/** Return the top-N catalog candidates for a query, best score first. */
export function matchLine(
  query: string,
  catalog: DecantCatalog,
  topN = 5,
): MatchCandidate[] {
  const scored = catalog.entries.map((e) => scoreEntry(query, e));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
