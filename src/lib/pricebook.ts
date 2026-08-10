import {
  DECANT_SIZES,
  type DecantCatalog,
  type DecantCatalogEntry,
  type DecantSize,
  type PerfumePrice,
} from "../types";
import { normalizeName } from "./normalize";

/** Canonical key for a perfume, shared with the cost catalog. */
export function priceKey(brand: string, perfume: string): string {
  return normalizeName(`${brand} ${perfume}`);
}

export interface PriceIndex {
  byKey: Map<string, PerfumePrice>;
}

export function buildPriceIndex(pricebook: PerfumePrice[]): PriceIndex {
  const byKey = new Map<string, PerfumePrice>();
  for (const p of pricebook) byKey.set(p.key, p);
  return { byKey };
}

/** Effective selling price for a perfume/size: the app-owned override if set, else the sheet price. */
export function effectivePrice(
  index: PriceIndex,
  brand: string,
  perfume: string,
  size: DecantSize,
  sheetPrice: number | undefined,
): number | undefined {
  const override = index.byKey.get(priceKey(brand, perfume))?.prices[size];
  return override ?? sheetPrice;
}

/**
 * Overlay the pricebook onto a catalog: every entry keeps its name/inspiration
 * but its `prices` become the effective (override-or-sheet) prices. Order pricing,
 * profit and the published sheet all read this. Returns null passthrough.
 */
export function applyPricebookToCatalog(
  catalog: DecantCatalog | null,
  pricebook: PerfumePrice[],
): DecantCatalog | null {
  if (catalog === null) return null;
  if (pricebook.length === 0) return catalog;
  const index = buildPriceIndex(pricebook);
  const entries: DecantCatalogEntry[] = catalog.entries.map((e) => {
    const override = index.byKey.get(priceKey(e.brand, e.perfume));
    if (override === undefined) return e;
    const prices: Partial<Record<DecantSize, number>> = { ...e.prices };
    for (const sz of DECANT_SIZES) {
      const v = override.prices[sz];
      if (v !== undefined) prices[sz] = v;
    }
    return { ...e, prices };
  });
  return { ...catalog, entries };
}

/** One price cell to write back to the sheet. */
export interface PriceUpdate {
  brand: string;
  perfume: string;
  size: DecantSize;
  price: number;
}

/**
 * Which app-owned prices differ from the live sheet — i.e. the "unpublished"
 * changes. Compares each pricebook override against the RAW (un-overlaid) sheet
 * catalog. An override for a perfume absent from the sheet is still pending.
 */
export function pendingPublishUpdates(
  sheetCatalog: DecantCatalog | null,
  pricebook: PerfumePrice[],
): PriceUpdate[] {
  const sheetByKey = new Map<string, Partial<Record<DecantSize, number>>>();
  for (const e of sheetCatalog?.entries ?? []) {
    sheetByKey.set(priceKey(e.brand, e.perfume), e.prices);
  }
  const updates: PriceUpdate[] = [];
  for (const p of pricebook) {
    const sheetPrices = sheetByKey.get(p.key);
    for (const sz of DECANT_SIZES) {
      const override = p.prices[sz];
      if (override === undefined) continue;
      if (override !== sheetPrices?.[sz]) {
        updates.push({ brand: p.brand, perfume: p.perfume, size: sz, price: override });
      }
    }
  }
  return updates;
}

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Render the effective catalog as the customer price sheet's column shape
 * (Brand, Perfume, Inspiration, 3ml, 5ml, 10ml, 30ml) for paste-back into the
 * Google Sheet. Pass the effective catalog (pricebook already applied).
 */
export function pricebookToCsv(catalog: DecantCatalog | null): string {
  const header = ["Brand", "Perfume", "Inspiration", ...DECANT_SIZES.map((s) => `${s}ml`)];
  const rows = (catalog?.entries ?? []).map((e) =>
    [
      e.brand,
      e.perfume,
      e.inspiration,
      ...DECANT_SIZES.map((sz) => e.prices[sz] ?? ""),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
