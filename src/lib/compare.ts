import {
  DECANT_SIZES,
  type DecantCatalog,
  type DecantCatalogEntry,
  type DecantSize,
} from "../types";
import { scoreEntry } from "./match";
import { normalizeName } from "./normalize";

/** Words (len ≥ 2) used for blocking — keeps the comparison fast by only scoring
 * competitor entries that share at least one token with the query. */
function tokensOf(s: string): string[] {
  return normalizeName(s)
    .split(" ")
    .filter((t) => t.length >= 2);
}

/** A competitor entry must score at least this to be treated as the same perfume. */
export const COMPARE_MATCH_THRESHOLD = 0.7;

export interface SizeComparison {
  size: DecantSize;
  mine: number;
  theirs: number;
  diff: number; // mine - theirs (positive = I'm pricier)
  pct: number; // diff as % of theirs
}

export interface ComparisonRow {
  brand: string;
  perfume: string;
  competitorBrand: string;
  competitorPerfume: string;
  score: number; // mapping confidence (<0.82 worth a sanity check)
  sizes: SizeComparison[];
}

export interface ComparisonStats {
  myTotal: number;
  theirTotal: number;
  matchedCount: number;
  sizeComparisons: number;
  cheaper: number; // size comparisons where I'm cheaper
  pricier: number;
  same: number;
  avgDiff: number; // mean (mine - theirs) across size comparisons
}

export interface ComparisonReport {
  generatedAt: string;
  matched: ComparisonRow[];
  unmatchedMine: { brand: string; perfume: string }[];
  competitorOnlyCount: number;
  stats: ComparisonStats;
}

/**
 * Smart-map every perfume in `mine` to the closest in `theirs` (fuzzy, brand-aware),
 * then compare prices size-by-size on the sizes both list.
 */
export function buildComparison(
  mine: DecantCatalog,
  theirs: DecantCatalog,
): ComparisonReport {
  const matched: ComparisonRow[] = [];
  const unmatchedMine: { brand: string; perfume: string }[] = [];
  const usedTheirRows = new Set<number>();

  // Inverted index: token → competitor entries that contain it.
  const index = new Map<string, DecantCatalogEntry[]>();
  for (const ce of theirs.entries) {
    const toks = new Set(
      tokensOf(`${ce.brand} ${ce.perfume} ${ce.inspiration}`),
    );
    for (const t of toks) {
      const arr = index.get(t);
      if (arr) arr.push(ce);
      else index.set(t, [ce]);
    }
  }

  for (const e of mine.entries) {
    const query = `${e.brand} ${e.perfume}`.trim();
    const candidates = new Set<DecantCatalogEntry>();
    for (const t of new Set(tokensOf(query))) {
      const arr = index.get(t);
      if (arr) for (const c of arr) candidates.add(c);
    }

    let bestEntry: DecantCatalogEntry | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const scored = scoreEntry(query, c);
      if (scored.score > bestScore) {
        bestScore = scored.score;
        bestEntry = c;
      }
    }

    if (bestEntry === null || bestScore < COMPARE_MATCH_THRESHOLD) {
      unmatchedMine.push({ brand: e.brand, perfume: e.perfume });
      continue;
    }
    usedTheirRows.add(bestEntry.rowIndex);

    const sizes: SizeComparison[] = [];
    for (const sz of DECANT_SIZES) {
      const mineP = e.prices[sz];
      const theirP = bestEntry.prices[sz];
      if (mineP === undefined || theirP === undefined) continue;
      const diff = mineP - theirP;
      const pct = theirP !== 0 ? (diff / theirP) * 100 : 0;
      sizes.push({ size: sz, mine: mineP, theirs: theirP, diff, pct });
    }

    matched.push({
      brand: e.brand,
      perfume: e.perfume,
      competitorBrand: bestEntry.brand,
      competitorPerfume: bestEntry.perfume,
      score: bestScore,
      sizes,
    });
  }

  let cheaper = 0;
  let pricier = 0;
  let same = 0;
  let sumDiff = 0;
  let n = 0;
  for (const row of matched) {
    for (const s of row.sizes) {
      n += 1;
      sumDiff += s.diff;
      if (s.diff < 0) cheaper += 1;
      else if (s.diff > 0) pricier += 1;
      else same += 1;
    }
  }

  const competitorOnlyCount = theirs.entries.filter(
    (en) => !usedTheirRows.has(en.rowIndex),
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    matched,
    unmatchedMine,
    competitorOnlyCount,
    stats: {
      myTotal: mine.entries.length,
      theirTotal: theirs.entries.length,
      matchedCount: matched.length,
      sizeComparisons: n,
      cheaper,
      pricier,
      same,
      avgDiff: n > 0 ? sumDiff / n : 0,
    },
  };
}

interface FlatSize extends SizeComparison {
  name: string;
}

function flatten(report: ComparisonReport): FlatSize[] {
  return report.matched.flatMap((row) =>
    row.sizes.map((s) => ({ ...s, name: `${row.perfume} ${s.size}ml` })),
  );
}

/** A full, copy-pasteable text report. */
export function formatComparisonReport(r: ComparisonReport): string {
  const s = r.stats;
  const lines: string[] = [];
  lines.push("PRICE COMPARISON — me vs competitor");
  lines.push("");
  lines.push(
    `Matched ${s.matchedCount} of my ${s.myTotal} perfumes to the competitor's ${s.theirTotal}.`,
  );
  lines.push(`Size-by-size comparisons: ${s.sizeComparisons}`);
  lines.push(`  • I'm cheaper: ${s.cheaper}`);
  lines.push(`  • I'm pricier: ${s.pricier}`);
  lines.push(`  • Same price:  ${s.same}`);
  lines.push(
    `  • Avg difference (mine − theirs): ${s.avgDiff >= 0 ? "+" : ""}${s.avgDiff.toFixed(0)}`,
  );
  lines.push("");

  const flat = flatten(r);
  const pricier = flat.filter((f) => f.diff > 0).sort((a, b) => b.diff - a.diff);
  const cheaper = flat.filter((f) => f.diff < 0).sort((a, b) => a.diff - b.diff);

  lines.push(`WHERE I'M PRICIER (mine higher) — ${pricier.length} total:`);
  if (pricier.length === 0) lines.push("  (none)");
  pricier.slice(0, 20).forEach((f, i) => {
    lines.push(
      `  ${i + 1}. ${f.name}: mine ${f.mine} vs ${f.theirs} (+${f.diff}, +${f.pct.toFixed(0)}%)`,
    );
  });
  if (pricier.length > 20) lines.push(`  …and ${pricier.length - 20} more`);
  lines.push("");

  lines.push(`WHERE I'M CHEAPER (mine lower) — ${cheaper.length} total:`);
  if (cheaper.length === 0) lines.push("  (none)");
  cheaper.slice(0, 20).forEach((f, i) => {
    lines.push(
      `  ${i + 1}. ${f.name}: mine ${f.mine} vs ${f.theirs} (${f.diff}, ${f.pct.toFixed(0)}%)`,
    );
  });
  if (cheaper.length > 20) lines.push(`  …and ${cheaper.length - 20} more`);
  lines.push("");

  lines.push("FULL MATCHED LIST:");
  for (const row of r.matched) {
    const flag = row.score < 0.82 ? " (≈ check match)" : "";
    const parts = row.sizes.map(
      (s2) =>
        `${s2.size}ml ${s2.mine}/${s2.theirs}${s2.diff === 0 ? "" : s2.diff > 0 ? ` (+${s2.diff})` : ` (${s2.diff})`}`,
    );
    lines.push(
      `  • ${row.perfume} → ${row.competitorPerfume}${flag}: ${parts.length ? parts.join(", ") : "no common sizes"}`,
    );
  }
  lines.push("");
  lines.push(
    `UNMATCHED: ${r.unmatchedMine.length} of mine had no competitor match; ${r.competitorOnlyCount} of theirs aren't in my list.`,
  );

  return lines.join("\n");
}
