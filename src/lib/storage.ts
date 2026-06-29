import type { Brand, InventoryStore, Perfume } from "../types";

const STORAGE_KEY_V2 = "perfume_inventory_v2";
const STORAGE_KEY_V1 = "perfume_inventory_v1";

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
      costPrice: 4500,
      purchaseDate: "2026-01-15",
    },
    {
      perfumeId: "brand-001-pfm-002",
      perfumeCode: "MMG-002",
      brandId: "brand-001",
      name: "Replica Flower Market",
      totalMl: 50,
      costPrice: 3200,
      purchaseDate: "2026-02-10",
    },
    {
      perfumeId: "brand-002-pfm-001",
      perfumeCode: "BYR-001",
      brandId: "brand-002",
      name: "Bal d'Afrique",
      totalMl: 100,
      costPrice: 5800,
      purchaseDate: "2026-03-01",
    },
    {
      perfumeId: "brand-002-pfm-002",
      perfumeCode: "BYR-002",
      brandId: "brand-002",
      name: "Mojave Ghost",
      totalMl: 30,
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
};

/**
 * Guarantee every array field exists. Older stores (saved before `orders` was
 * added, or partial data) won't have every key — default them so the app doesn't
 * crash on `store.orders.map(...)` etc.
 */
export function normalizeStore(
  raw: Partial<InventoryStore> | null | undefined,
): InventoryStore {
  return {
    brands: raw?.brands ?? [],
    perfumes: raw?.perfumes ?? [],
    sales: raw?.sales ?? [],
    orders: raw?.orders ?? [],
    auditLog: raw?.auditLog ?? [],
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
