import type { Brand, InventoryStore, Perfume } from "../types";
import { orderChargedTotal } from "./order";
import {
  DEFAULT_BOTTLE_ML,
  buildPerfumeIndex,
  decantPerfumeCost,
  lookupPerfume,
  orderProfitFromItems,
} from "./profit";

const STORAGE_KEY_V2 = "perfume_inventory_v2";
const STORAGE_KEY_V1 = "perfume_inventory_v1";

/** A brand-new install starts empty. Never seed sample rows: the store is shared
 * and merged across devices, so anything seeded here would be unioned into real
 * data the first time a load fails and this fallback is used. */
function emptyStore(): InventoryStore {
  return {
    brands: [],
    perfumes: [],
    sales: [],
    orders: [],
    auditLog: [],
    pricebook: [],
  };
}

// ── legacy shapes, read only by the migration below ──────────────────────────

/** Pre-unification perfume: bottle size and cost were split across the perfume
 * (`totalMl`/`costPrice`) and a parallel `costCatalog` row. */
type LegacyPerfume = Perfume & {
  totalMl?: number;
  costPrice?: number;
};

/** Pre-unification cost row. Rows carrying a `perfumeId` were the authority for
 * every profit and margin number, so they win the migration. */
interface LegacyCostRow {
  key: string;
  bottleCost: number;
  bottleMl: number;
  perfumeId?: string | null;
}

type LegacyStore = Partial<InventoryStore> & { costCatalog?: LegacyCostRow[] };

/**
 * Bring any stored document up to the current shape.
 *
 * The one-way migration: bottle cost and size used to live in two places at
 * once — on the perfume (`costPrice`/`totalMl`) and on a linked `costCatalog`
 * row (`bottleCost`/`bottleMl`) — kept loosely in step by a sync layer that
 * never propagated size. The catalog row is what every profit and margin number
 * was actually computed from, so it wins; `totalMl` had drifted into holding
 * remaining stock (already tracked by `stockMl`) and is dropped.
 *
 * Also: backfills `stockMl` for very old records, and backfills `profit` on
 * orders placed before profit tracking. Idempotent — a store that has already
 * been migrated passes through untouched.
 */
export function normalizeStore(
  raw: LegacyStore | null | undefined,
): InventoryStore {
  const rawPerfumes = (raw?.perfumes ?? []) as LegacyPerfume[];
  const sales = raw?.sales ?? [];

  // Linked cost rows, by perfume. First row wins if a merge left duplicates.
  const costByPerfumeId = new Map<string, LegacyCostRow>();
  for (const row of raw?.costCatalog ?? []) {
    if (row.perfumeId != null && !costByPerfumeId.has(row.perfumeId)) {
      costByPerfumeId.set(row.perfumeId, row);
    }
  }

  const perfumes: Perfume[] = rawPerfumes.map((p) => {
    const row = costByPerfumeId.get(p.perfumeId);

    // The catalog row is the authority; fall back to the perfume's own legacy
    // fields, then to a default size so cost-per-ml always has a denominator.
    const bottleMl =
      typeof p.bottleMl === "number" && p.bottleMl > 0
        ? p.bottleMl
        : row !== undefined && row.bottleMl > 0
          ? row.bottleMl
          : typeof p.totalMl === "number" && p.totalMl > 0
            ? p.totalMl
            : DEFAULT_BOTTLE_ML;

    const bottleCost =
      typeof p.bottleCost === "number"
        ? p.bottleCost
        : (row?.bottleCost ?? p.costPrice ?? 0);

    // Very old records predate stored stock: it was totalMl − Σ sold. Unclamped,
    // so any pre-existing oversell is preserved.
    const stockMl =
      typeof p.stockMl === "number"
        ? p.stockMl
        : (p.totalMl ?? 0) -
          sales
            .filter((s) => s.perfumeId === p.perfumeId)
            .reduce((sum, s) => sum + s.mlSold, 0);

    return {
      perfumeId: p.perfumeId,
      perfumeCode: p.perfumeCode,
      brandId: p.brandId,
      name: p.name,
      bottleMl,
      bottleCost,
      stockMl,
      purchaseDate: p.purchaseDate,
      ...(p.imageUrl !== undefined ? { imageUrl: p.imageUrl } : {}),
    };
  });

  // Backfill profit on orders placed before profit tracking. Revenue is the
  // amount actually charged (discount + delivery included), matching how a
  // freshly confirmed order computes it.
  const index = buildPerfumeIndex(perfumes);
  const orders = (raw?.orders ?? []).map((order) => {
    if (typeof order.profit === "number") return order;
    const items = order.items.map((it) => {
      if (it.unitCost !== undefined) return it;
      const ml = it.size ?? it.mlSold;
      const perfume = lookupPerfume(index, it.perfumeId);
      const cost =
        perfume !== null && ml > 0 ? decantPerfumeCost(perfume, ml) : null;
      return { ...it, unitCost: cost ?? undefined };
    });
    return {
      ...order,
      items,
      profit: orderProfitFromItems(items, orderChargedTotal(order)),
    };
  });

  return {
    brands: raw?.brands ?? [],
    perfumes,
    sales,
    orders,
    auditLog: raw?.auditLog ?? [],
    pricebook: raw?.pricebook ?? [],
  };
}

function mergeById<T>(base: T[], incoming: T[], idOf: (t: T) => string): T[] {
  const map = new Map<string, T>();
  for (const b of base) map.set(idOf(b), b);
  for (const i of incoming) map.set(idOf(i), i); // incoming wins on conflict
  return Array.from(map.values());
}

/**
 * Union two stores so concurrent additions from different devices/tabs are never
 * lost. `incoming` wins on id conflicts; ids present on only one side are kept.
 * This is what makes cloud sync non-destructive (the whole store is one blob, so
 * a plain overwrite would drop the other device's orders).
 *
 * Trade-off: a delete on one device can be undone if another device still holds
 * the row — preventing data LOSS is the priority; deletes reconcile on the next
 * edit once both sides have synced.
 */
export function mergeStores(
  base: InventoryStore,
  incoming: InventoryStore,
): InventoryStore {
  return {
    brands: mergeById(base.brands, incoming.brands, (b) => b.brandId),
    perfumes: mergeById(base.perfumes, incoming.perfumes, (p) => p.perfumeId),
    sales: mergeById(base.sales, incoming.sales, (s) => s.id),
    orders: mergeById(base.orders, incoming.orders, (o) => o.id),
    auditLog: mergeById(base.auditLog, incoming.auditLog, (a) => a.id),
    pricebook: mergeById(
      base.pricebook,
      incoming.pricebook,
      (p) => p.perfumeId ?? p.key,
    ),
  };
}

function deriveBrandCode(name: string): string {
  const words = name.trim().split(/\s+/);
  const letters = words.map((w) => w.charAt(0).toUpperCase()).join("");
  return letters.slice(0, 4) || "BRD";
}

function migrateV1(raw: string): InventoryStore {
  const v1 = JSON.parse(raw) as {
    brands: Array<{ brandId: string; name: string }>;
    perfumes: Array<{
      perfumeId: string;
      brandId: string;
      name: string;
      totalMl: number;
      costPrice: number;
      purchaseDate: string;
    }>;
    sales: Array<{
      id: string;
      perfumeId: string;
      mlSold: number;
      date: string;
      totalPrice: number;
    }>;
  };

  const brandCodeMap: Record<string, string> = {};
  const usedCodes = new Set<string>();

  const brands: Brand[] = v1.brands.map((b) => {
    const code = deriveBrandCode(b.name);
    let attempt = code;
    let suffix = 2;
    while (usedCodes.has(attempt)) {
      attempt = `${code}${suffix}`;
      suffix++;
    }
    usedCodes.add(attempt);
    brandCodeMap[b.brandId] = attempt;
    return { brandId: b.brandId, brandCode: attempt, name: b.name };
  });

  const soldByPerfume: Record<string, number> = {};
  for (const s of v1.sales) {
    soldByPerfume[s.perfumeId] = (soldByPerfume[s.perfumeId] ?? 0) + s.mlSold;
  }

  const serialMap: Record<string, number> = {};
  const perfumes: Perfume[] = v1.perfumes.map((p) => {
    const brandCode = brandCodeMap[p.brandId] ?? "UNK";
    serialMap[brandCode] = (serialMap[brandCode] ?? 0) + 1;
    const serial = String(serialMap[brandCode]).padStart(3, "0");
    return {
      perfumeId: p.perfumeId,
      perfumeCode: `${brandCode}-${serial}`,
      brandId: p.brandId,
      name: p.name,
      bottleMl: p.totalMl > 0 ? p.totalMl : DEFAULT_BOTTLE_ML,
      bottleCost: p.costPrice,
      stockMl: p.totalMl - (soldByPerfume[p.perfumeId] ?? 0),
      purchaseDate: p.purchaseDate,
    };
  });

  return {
    brands,
    perfumes,
    sales: v1.sales,
    orders: [],
    auditLog: [],
    pricebook: [],
  };
}

export function loadStore(): InventoryStore {
  const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
  if (rawV2 !== null) {
    try {
      return normalizeStore(JSON.parse(rawV2) as LegacyStore);
    } catch {
      // corrupted v2 data — fall through
    }
  }

  const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
  if (rawV1 !== null) {
    try {
      const migrated = migrateV1(rawV1);
      saveStore(migrated);
      return migrated;
    } catch {
      // corrupted v1 data — fall through
    }
  }

  // Nothing stored yet. Return empty WITHOUT persisting, so a transient load
  // failure can't write a placeholder that later merges into the real store.
  return emptyStore();
}

/** Persist the offline cache. Never throws: a full quota must not take down the
 * mutation that triggered the save (the in-memory store is still correct, and in
 * cloud mode the remote write is the durable one). */
export function saveStore(store: InventoryStore): void {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(store));
  } catch (e) {
    console.warn("Local cache write failed (data kept in memory).", e);
  }
}
