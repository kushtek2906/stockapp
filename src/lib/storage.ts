import type { Brand, InventoryStore, PerfumeCost, Perfume } from "../types";
import costCatalogSeed from "../data/costCatalog.seed.json";
import { reconcileCostLinks } from "./costSync";
import {
  buildCostIndex,
  decantPerfumeCost,
  lookupCostForItem,
  orderProfitFromItems,
} from "./profit";

const STORAGE_KEY_V2 = "perfume_inventory_v2";
const STORAGE_KEY_V1 = "perfume_inventory_v1";

/** Bottle cost + size per perfume, generated from the cost PDF + master sheets.
 * Seeds `costCatalog` on first run; editable in-app thereafter. */
const COST_CATALOG_SEED = costCatalogSeed as PerfumeCost[];

const SEED_DATA: InventoryStore = {
  brands: [
    { brandId: "brand-001", brandCode: "MMG", name: "Maison Margiela" },
    { brandId: "brand-002", brandCode: "BYR", name: "Byredo" },
  ],
  perfumes: [
    {
      perfumeId: "brand-001-pfm-001",
      perfumeCode: "MMG-001",
      brandId: "brand-001",
      name: "Replica Beach Walk",
      totalMl: 100,
      stockMl: 70, // 100 purchased − 30 sold in seed sales
      costPrice: 4500,
      purchaseDate: "2026-01-15",
    },
    {
      perfumeId: "brand-001-pfm-002",
      perfumeCode: "MMG-002",
      brandId: "brand-001",
      name: "Replica Flower Market",
      totalMl: 50,
      stockMl: 45, // 50 − 5
      costPrice: 3200,
      purchaseDate: "2026-02-10",
    },
    {
      perfumeId: "brand-002-pfm-001",
      perfumeCode: "BYR-001",
      brandId: "brand-002",
      name: "Bal d'Afrique",
      totalMl: 100,
      stockMl: 85, // 100 − 15
      costPrice: 5800,
      purchaseDate: "2026-03-01",
    },
    {
      perfumeId: "brand-002-pfm-002",
      perfumeCode: "BYR-002",
      brandId: "brand-002",
      name: "Mojave Ghost",
      totalMl: 30,
      stockMl: 22, // 30 − 8
      costPrice: 4100,
      purchaseDate: "2026-04-01",
    },
  ],
  sales: [
    {
      id: "sale-001",
      perfumeId: "brand-001-pfm-001",
      mlSold: 10,
      date: getTodayMinus(6),
      totalPrice: 650,
    },
    {
      id: "sale-002",
      perfumeId: "brand-001-pfm-002",
      mlSold: 5,
      date: getTodayMinus(5),
      totalPrice: 420,
    },
    {
      id: "sale-003",
      perfumeId: "brand-002-pfm-001",
      mlSold: 15,
      date: getTodayMinus(3),
      totalPrice: 1050,
    },
    {
      id: "sale-004",
      perfumeId: "brand-002-pfm-002",
      mlSold: 8,
      date: getTodayMinus(2),
      totalPrice: 560,
    },
    {
      id: "sale-005",
      perfumeId: "brand-001-pfm-001",
      mlSold: 20,
      date: getTodayMinus(1),
      totalPrice: 1300,
    },
  ],
  orders: [],
  auditLog: [],
  costCatalog: COST_CATALOG_SEED,
  pricebook: [],
};

/**
 * Guarantee every array field exists. Older stores (saved before `orders` was
 * added, or partial data) won't have every key — default them so the app doesn't
 * crash on `store.orders.map(...)` etc.
 *
 * Also backfills `stockMl` on perfumes saved before current stock was stored
 * directly: for those, current stock was `totalMl − Σ mlSold`, so we bake that
 * in once. Unclamped, so any pre-existing oversell is preserved. Idempotent —
 * only perfumes still missing `stockMl` are touched.
 *
 * And backfills `profit` on past orders (placed before profit tracking): each
 * line's cost is looked up from the cost catalog and the net order profit is
 * computed. Idempotent — only orders still missing `profit` are touched.
 */
export function normalizeStore(
  raw: Partial<InventoryStore> | null | undefined,
): InventoryStore {
  const perfumes = raw?.perfumes ?? [];
  const sales = raw?.sales ?? [];
  const costCatalog = raw?.costCatalog ?? COST_CATALOG_SEED;

  const migratedPerfumes = perfumes.map((p) => {
    if (typeof p.stockMl === "number") return p;
    const sold = sales
      .filter((s) => s.perfumeId === p.perfumeId)
      .reduce((sum, s) => sum + s.mlSold, 0);
    return { ...p, stockMl: p.totalMl - sold };
  });

  // Standing invariant repair: link cost/price rows to perfumes by id, adopt
  // catalog costs on first link, and keep names/keys in sync. Runs before the
  // profit backfill so backfilled costs use the reconciled catalog.
  const reconciled = reconcileCostLinks({
    brands: raw?.brands ?? [],
    perfumes: migratedPerfumes,
    sales,
    orders: raw?.orders ?? [],
    auditLog: raw?.auditLog ?? [],
    // Seed the cost catalog only when the field is truly absent (first run or a
    // pre-cost-catalog store). An explicit empty array (user cleared it) is kept.
    costCatalog,
    pricebook: raw?.pricebook ?? [],
  });

  const costIndex = buildCostIndex(reconciled.costCatalog);
  const orders = reconciled.orders.map((order) => {
    if (typeof order.profit === "number") return order;
    const items = order.items.map((it) => {
      if (it.unitCost !== undefined) return it;
      const ml = it.size ?? it.mlSold;
      const pc = lookupCostForItem(costIndex, it.perfumeId, it.brand, it.perfumeName);
      return {
        ...it,
        unitCost: pc !== null && ml > 0 ? decantPerfumeCost(pc, ml) : undefined,
      };
    });
    const revenue = order.amountOverride ?? order.total;
    return { ...order, items, profit: orderProfitFromItems(items, revenue) };
  });

  return { ...reconciled, orders };
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
    // Rows linked to a perfume merge by that id (rename-proof); untracked rows
    // still merge by key. Any old-key/new-id duplicate pair this lets through is
    // cleaned up by reconcileCostLinks on the next normalize.
    costCatalog: mergeById(
      base.costCatalog,
      incoming.costCatalog,
      (c) => c.perfumeId ?? c.key,
    ),
    pricebook: mergeById(
      base.pricebook,
      incoming.pricebook,
      (p) => p.perfumeId ?? p.key,
    ),
  };
}

function getTodayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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
      totalMl: p.totalMl,
      stockMl: p.totalMl - (soldByPerfume[p.perfumeId] ?? 0),
      costPrice: p.costPrice,
      purchaseDate: p.purchaseDate,
    };
  });

  return {
    brands,
    perfumes,
    sales: v1.sales,
    orders: [],
    auditLog: [],
    costCatalog: COST_CATALOG_SEED,
    pricebook: [],
  };
}

export function loadStore(): InventoryStore {
  const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
  if (rawV2 !== null) {
    try {
      return normalizeStore(JSON.parse(rawV2) as Partial<InventoryStore>);
    } catch {
      // corrupted v2 data — fall through to seed
    }
  }

  const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
  if (rawV1 !== null) {
    try {
      const migrated = migrateV1(rawV1);
      saveStore(migrated);
      return migrated;
    } catch {
      // corrupted v1 data — fall through to seed
    }
  }

  saveStore(SEED_DATA);
  return structuredClone(SEED_DATA);
}

export function saveStore(store: InventoryStore): void {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(store));
}
