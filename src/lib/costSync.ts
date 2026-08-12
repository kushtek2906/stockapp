import type { Brand, InventoryStore, Perfume, PerfumeCost } from "../types";
import { priceKey } from "./pricebook";

/**
 * Keeps the cost catalog and the inventory linked by `perfumeId` so the Costs
 * tab, Inventory, Order profit and Pricing margins all read the same numbers.
 *
 * Invariants maintained here:
 *  - every inventory perfume has exactly one cost row carrying its `perfumeId`;
 *  - a linked row's `brand`/`perfume`/`key` mirror the current entity names;
 *  - a linked row's `bottleCost` equals the perfume's `costPrice`;
 *  - rows without a `perfumeId` are untracked reference entries (kept as-is).
 *
 * `totalMl` (purchase record) and `bottleMl` (cost-reference size) stay
 * separate on purpose — `totalMl` is only used as the `bottleMl` default when a
 * row is first created.
 */

/** Bottle size used when a cost row is created for a perfume with no recorded
 * purchase volume (e.g. sheet imports set `totalMl` to 0). */
export const DEFAULT_BOTTLE_ML = 100;

/** Canonical cost/price key for a perfume, from its CURRENT brand + name. */
export function costKeyForPerfume(brands: Brand[], p: Perfume): string {
  const brand = brands.find((b) => b.brandId === p.brandId);
  return priceKey(brand?.name ?? "", p.name);
}

/** Which side wins when the perfume's costPrice and the row's bottleCost
 * disagree — the side the user just edited. */
export type CostAuthority = "perfume" | "catalog";

/**
 * Ensure `perfumeId`'s linked cost row exists and both sides agree, in ONE
 * next-store (no separate writes to fight each other). If the perfume has no
 * linked row yet, an untracked row with the exact same key is claimed
 * (preserving its bottleMl); otherwise a row is created.
 *
 * Returns the store unchanged (same reference) when nothing needs to move.
 */
export function syncCostForPerfume(
  store: InventoryStore,
  perfumeId: string,
  authority: CostAuthority,
  opts?: { bottleCost?: number; defaultBottleMl?: number },
): InventoryStore {
  const perfume = store.perfumes.find((p) => p.perfumeId === perfumeId);
  if (perfume === undefined) return store;
  const brand = store.brands.find((b) => b.brandId === perfume.brandId);
  const brandName = brand?.name ?? "";
  const key = priceKey(brandName, perfume.name);

  const linked = store.costCatalog.find((c) => c.perfumeId === perfumeId);
  const claimable =
    linked === undefined
      ? store.costCatalog.find((c) => c.perfumeId == null && c.key === key)
      : undefined;
  const current = linked ?? claimable;

  const bottleCost =
    authority === "perfume"
      ? perfume.costPrice
      : (opts?.bottleCost ?? current?.bottleCost ?? perfume.costPrice);
  const bottleMl =
    current !== undefined && current.bottleMl > 0
      ? current.bottleMl
      : perfume.totalMl > 0
        ? perfume.totalMl
        : (opts?.defaultBottleMl ?? DEFAULT_BOTTLE_ML);

  const nextRow: PerfumeCost = {
    key,
    brand: brandName,
    perfume: perfume.name,
    bottleCost,
    bottleMl,
    perfumeId,
  };

  const rowUnchanged =
    current !== undefined &&
    current.perfumeId === perfumeId &&
    current.key === nextRow.key &&
    current.brand === nextRow.brand &&
    current.perfume === nextRow.perfume &&
    current.bottleCost === nextRow.bottleCost &&
    current.bottleMl === nextRow.bottleMl;

  const nextCostPrice = authority === "catalog" ? bottleCost : perfume.costPrice;
  const perfumeUnchanged = nextCostPrice === perfume.costPrice;

  if (rowUnchanged && perfumeUnchanged) return store;

  // Replace the linked/claimed row (or append), dropping any leftover untracked
  // duplicate of the same key so the catalog never shows the perfume twice.
  const costCatalog = [
    ...store.costCatalog.filter(
      (c) => c !== current && !(c.perfumeId == null && c.key === key),
    ),
    nextRow,
  ];
  const perfumes = perfumeUnchanged
    ? store.perfumes
    : store.perfumes.map((p) =>
        p.perfumeId === perfumeId ? { ...p, costPrice: nextCostPrice } : p,
      );
  return { ...store, perfumes, costCatalog };
}

/**
 * Idempotent invariant repair, run on every load and after cross-device merges:
 *  1. drop dangling/duplicate `perfumeId` links (perfume deleted, or two rows
 *     merged in for the same perfume — first row wins);
 *  2. exact-key link untracked rows to perfumes (only when exactly ONE perfume
 *     matches the key and it has no linked row); on this FIRST link the catalog
 *     is treated as the freshest source, so `costPrice := bottleCost`;
 *  3. refresh linked rows' names/keys from the entities, and heal any
 *     costPrice/bottleCost divergence (catalog wins — divergence can only come
 *     from a merge, since mutations write both sides atomically);
 *  4. drop untracked rows whose key now duplicates a linked row's key;
 *  5. create linked rows for perfumes that still have none
 *     (`bottleCost := costPrice`, `bottleMl := totalMl || 100`).
 *
 * Returns the same reference when nothing changed.
 */
export function reconcileCostLinks(store: InventoryStore): InventoryStore {
  let changed = false;

  const perfumeById = new Map(store.perfumes.map((p) => [p.perfumeId, p]));
  const brandNameById = new Map(store.brands.map((b) => [b.brandId, b.name]));
  const keyOf = (p: Perfume) =>
    priceKey(brandNameById.get(p.brandId) ?? "", p.name);

  const perfumesByKey = new Map<string, Perfume[]>();
  for (const p of store.perfumes) {
    const k = keyOf(p);
    if (k === "") continue;
    const list = perfumesByKey.get(k);
    if (list !== undefined) list.push(p);
    else perfumesByKey.set(k, [p]);
  }

  // Every perfume that already has a (valid) linked row anywhere in the list.
  const linkedIds = new Set<string>();
  for (const c of store.costCatalog) {
    if (c.perfumeId != null && perfumeById.has(c.perfumeId)) {
      linkedIds.add(c.perfumeId);
    }
  }

  /** costPrice values the perfumes must adopt (catalog → inventory). */
  const costPriceOverrides = new Map<string, number>();
  const emittedIds = new Set<string>();
  const catalog: PerfumeCost[] = [];

  for (const c of store.costCatalog) {
    let row = c;

    if (row.perfumeId != null) {
      if (!perfumeById.has(row.perfumeId)) {
        row = { ...row, perfumeId: null };
        changed = true;
      } else if (emittedIds.has(row.perfumeId)) {
        changed = true;
        continue; // duplicate link for the same perfume — first row wins
      }
    }

    if (row.perfumeId == null) {
      const candidates = perfumesByKey.get(row.key) ?? [];
      if (
        candidates.length === 1 &&
        !linkedIds.has(candidates[0].perfumeId)
      ) {
        const p = candidates[0];
        row = { ...row, perfumeId: p.perfumeId };
        linkedIds.add(p.perfumeId);
        if (p.costPrice !== row.bottleCost) {
          costPriceOverrides.set(p.perfumeId, row.bottleCost);
        }
        changed = true;
      }
    }

    const pid = row.perfumeId;
    if (pid != null) {
      const p = perfumeById.get(pid);
      if (p !== undefined) {
        const k = keyOf(p);
        const brandName = brandNameById.get(p.brandId) ?? "";
        if (row.key !== k || row.brand !== brandName || row.perfume !== p.name) {
          row = { ...row, key: k, brand: brandName, perfume: p.name };
          changed = true;
        }
        if (!costPriceOverrides.has(pid) && p.costPrice !== row.bottleCost) {
          costPriceOverrides.set(pid, row.bottleCost);
          changed = true;
        }
        emittedIds.add(pid);
      }
    }

    catalog.push(row);
  }

  // Untracked rows whose key duplicates a linked row are stale leftovers.
  const linkedKeys = new Set(
    catalog.filter((c) => c.perfumeId != null).map((c) => c.key),
  );
  const deduped = catalog.filter((c) => {
    if (c.perfumeId != null || !linkedKeys.has(c.key)) return true;
    changed = true;
    return false;
  });

  // Every perfume still without a row gets one from its own data.
  for (const p of store.perfumes) {
    if (linkedIds.has(p.perfumeId)) continue;
    deduped.push({
      key: keyOf(p),
      brand: brandNameById.get(p.brandId) ?? "",
      perfume: p.name,
      bottleCost: p.costPrice,
      bottleMl: p.totalMl > 0 ? p.totalMl : DEFAULT_BOTTLE_ML,
      perfumeId: p.perfumeId,
    });
    linkedIds.add(p.perfumeId);
    changed = true;
  }

  const perfumes =
    costPriceOverrides.size === 0
      ? store.perfumes
      : store.perfumes.map((p) => {
          const v = costPriceOverrides.get(p.perfumeId);
          return v !== undefined ? { ...p, costPrice: v } : p;
        });

  // Pricebook: drop dangling links, keep id-carrying rows' names in sync.
  let pricebookChanged = false;
  const pricebook = store.pricebook.map((pr) => {
    if (pr.perfumeId == null) return pr;
    const p = perfumeById.get(pr.perfumeId);
    if (p === undefined) {
      pricebookChanged = true;
      return { ...pr, perfumeId: null };
    }
    const k = keyOf(p);
    const brandName = brandNameById.get(p.brandId) ?? "";
    if (pr.key !== k || pr.brand !== brandName || pr.perfume !== p.name) {
      pricebookChanged = true;
      return { ...pr, key: k, brand: brandName, perfume: p.name };
    }
    return pr;
  });

  if (!changed && !pricebookChanged) return store;
  return {
    ...store,
    perfumes,
    costCatalog: deduped,
    pricebook: pricebookChanged ? pricebook : store.pricebook,
  };
}
