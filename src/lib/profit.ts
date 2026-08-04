import type { PerfumeCost } from "../types";
import { normalizeName } from "./normalize";
import { tokenSetSimilarity } from "./match";

/**
 * Fixed order costs (INR). The decant vial is charged per decant; delivery and
 * packaging are charged once per order. Kept here as the single source of truth.
 */
export const ORDER_COSTS = {
  decantVial: 25,
  delivery: 70,
  packaging: 10,
} as const;

export interface CostIndex {
  byKey: Map<string, PerfumeCost>;
  list: PerfumeCost[];
}

export function buildCostIndex(costCatalog: PerfumeCost[]): CostIndex {
  const byKey = new Map<string, PerfumeCost>();
  for (const c of costCatalog) byKey.set(c.key, c);
  return { byKey, list: costCatalog };
}

/** Minimum token-set similarity to accept a fuzzy cost match. */
const LOOKUP_THRESHOLD = 0.62;

/**
 * Find the cost entry for a perfume. Tries an exact normalized-key hit first
 * (keys are `normalizeName(brand + " " + perfume)`, matching how the catalog
 * names perfumes), then a fuzzy token-set fallback for minor naming drift.
 */
export function lookupCost(
  index: CostIndex,
  brand: string,
  perfume: string,
): PerfumeCost | null {
  const q = normalizeName(`${brand} ${perfume}`.trim());
  if (q === "") return null;
  const exact = index.byKey.get(q);
  if (exact !== undefined) return exact;

  let best: PerfumeCost | null = null;
  let bestScore = 0;
  for (const c of index.list) {
    const score = tokenSetSimilarity(q, c.key);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= LOOKUP_THRESHOLD ? best : null;
}

export function costPerMl(pc: PerfumeCost): number {
  return pc.bottleMl > 0 ? pc.bottleCost / pc.bottleMl : 0;
}

/** Perfume cost for a single decant of `size` ml (excludes vial/delivery/packaging). */
export function decantPerfumeCost(pc: PerfumeCost, size: number): number {
  return costPerMl(pc) * size;
}

/**
 * Profit on a single decant = sale price − perfume cost − ₹25 vial. Delivery and
 * packaging are order-level, so they are NOT included here. Returns null when the
 * perfume has no cost data (caller shows "cost?").
 */
export function lineProfit(
  unitPrice: number,
  size: number,
  pc: PerfumeCost | null,
): number | null {
  if (pc === null) return null;
  return unitPrice - decantPerfumeCost(pc, size) - ORDER_COSTS.decantVial;
}

/**
 * Net profit from already-costed order lines (each carrying an optional
 * `unitCost`). Used when persisting an order and when backfilling profit for
 * past orders. Revenue is the amount actually charged.
 */
export function orderProfitFromItems(
  items: Array<{ unitCost?: number }>,
  revenue: number,
): number {
  const perfumeCost = items.reduce((s, it) => s + (it.unitCost ?? 0), 0);
  return (
    revenue -
    perfumeCost -
    ORDER_COSTS.decantVial * items.length -
    ORDER_COSTS.delivery -
    ORDER_COSTS.packaging
  );
}

export interface ProfitLine {
  unitPrice: number;
  size: number;
  pc: PerfumeCost | null;
}

export interface OrderProfit {
  /** Net profit: revenue − known perfume costs − ₹25×decants − ₹70 − ₹10. */
  profit: number;
  perfumeCost: number;
  decantCount: number;
  /** Billable lines with no cost data (profit is approximate by this much). */
  missingCost: number;
}

/**
 * Net profit for a whole order. `revenue` is the actual amount charged
 * (amount override if set, else the sum of unit prices). Lines with no cost are
 * counted in `missingCost` and still incur the ₹25 vial, but their perfume cost
 * is unknown, so profit is an upper bound when `missingCost > 0`.
 */
export function computeOrderProfit(
  lines: ProfitLine[],
  revenue: number,
): OrderProfit {
  let perfumeCost = 0;
  let missingCost = 0;
  for (const l of lines) {
    if (l.pc === null) missingCost += 1;
    else perfumeCost += decantPerfumeCost(l.pc, l.size);
  }
  const decantCount = lines.length;
  const profit =
    revenue -
    perfumeCost -
    ORDER_COSTS.decantVial * decantCount -
    ORDER_COSTS.delivery -
    ORDER_COSTS.packaging;
  return { profit, perfumeCost, decantCount, missingCost };
}
