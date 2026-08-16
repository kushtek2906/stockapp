import type { Perfume } from "../types";

/**
 * Fixed order costs (INR). The decant vial is charged per decant; delivery and
 * packaging are charged once per order. Kept here as the single source of truth.
 */
export const ORDER_COSTS = {
  decantVial: 25,
  delivery: 70,
  packaging: 10,
} as const;

/** Bottle size assumed when a perfume is created without a known one (e.g. a
 * sheet import), so cost-per-ml still has a sensible denominator. */
export const DEFAULT_BOTTLE_ML = 100;

/** Perfumes by id — the only way an order line resolves its cost. */
export type PerfumeIndex = Map<string, Perfume>;

export function buildPerfumeIndex(perfumes: Perfume[]): PerfumeIndex {
  return new Map(perfumes.map((p) => [p.perfumeId, p]));
}

/**
 * The perfume an order line's cost comes from, or null when the line isn't
 * linked to tracked inventory. Costs live on the Perfume and nowhere else, so
 * there is no name matching and no fuzzy fallback: an unlinked line simply has
 * no cost, and the UI shows "cost?" rather than inventing a number.
 */
export function lookupPerfume(
  index: PerfumeIndex,
  perfumeId: string | null | undefined,
): Perfume | null {
  return perfumeId != null ? (index.get(perfumeId) ?? null) : null;
}

/** Whether this perfume can produce a cost at all. */
export function hasCostData(p: Perfume): boolean {
  return p.bottleMl > 0 && p.bottleCost > 0;
}

/**
 * Cost of one ml, or null when the perfume has no usable cost data. Null rather
 * than 0 on purpose — a missing cost must never be mistaken for a free perfume,
 * which would silently book the whole sale price as profit.
 */
export function costPerMl(p: Perfume): number | null {
  return hasCostData(p) ? p.bottleCost / p.bottleMl : null;
}

/** Perfume cost for a decant of `ml` (excludes vial/delivery/packaging). */
export function decantPerfumeCost(p: Perfume, ml: number): number | null {
  const perMl = costPerMl(p);
  return perMl === null ? null : perMl * ml;
}

/**
 * Profit on a single decant = sale price − perfume cost − ₹25 vial. Delivery and
 * packaging are order-level, so they are NOT included here. Returns null when the
 * perfume is unknown or has no cost data (caller shows "cost?").
 */
export function lineProfit(
  unitPrice: number,
  ml: number,
  p: Perfume | null,
): number | null {
  if (p === null) return null;
  const cost = decantPerfumeCost(p, ml);
  return cost === null ? null : unitPrice - cost - ORDER_COSTS.decantVial;
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
  ml: number;
  perfume: Perfume | null;
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
    const cost = l.perfume === null ? null : decantPerfumeCost(l.perfume, l.ml);
    if (cost === null) missingCost += 1;
    else perfumeCost += cost;
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
