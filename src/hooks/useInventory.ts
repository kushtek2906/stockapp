import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { loadStore } from "../lib/storage";
import {
  loadInventory,
  saveInventory,
  setOnStoreUpdate,
} from "../lib/remoteStore";
import type { ImportPayload } from "../lib/importSchema";
import { normalizeName } from "../lib/normalize";
import { computeChargedTotal } from "../lib/order";
import { priceKey } from "../lib/pricebook";
import { nextPerfumeCode, today } from "../lib/utils";
import {
  buildCostIndex,
  decantPerfumeCost,
  lookupCost,
  orderProfitFromItems,
} from "../lib/profit";
import type {
  AuditAction,
  AuditEntry,
  AuditEntity,
  Brand,
  DecantSize,
  InventoryStore,
  Order,
  OrderLineRecord,
  PaymentMode,
  Perfume,
  PerfumeCost,
  PerfumePrice,
  Sale,
} from "../types";


function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeAuditEntry(
  action: AuditAction,
  entity: AuditEntity,
  entityId: string,
  description: string,
): AuditEntry {
  return {
    id: generateId("audit"),
    timestamp: new Date().toISOString(),
    action,
    entity,
    entityId,
    description,
  };
}

export interface AddBrandInput {
  name: string;
  brandCode: string;
  imageUrl?: string;
}

export interface AddPerfumeInput {
  brandId: string;
  name: string;
  totalMl: number;
  costPrice: number;
  purchaseDate: string;
  imageUrl?: string;
}

export interface EditBrandInput {
  name: string;
  brandCode: string;
  imageUrl?: string;
}

export interface EditPerfumeInput {
  name: string;
  totalMl: number;
  costPrice: number;
  purchaseDate: string;
  imageUrl?: string;
}

export interface EditSaleInput {
  mlSold: number;
  totalPrice: number;
}

export interface RecordSaleInput {
  perfumeId: string;
  mlSold: number;
  totalPrice: number;
}

export interface OrderItemInput {
  perfumeId: string | null;
  perfumeName: string;
  brand: string;
  size: DecantSize | null;
  mlSold: number;
  unitPrice: number;
}

/** Customer + shipping/payment fields shared by confirm & edit. */
export interface OrderDetailsInput {
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerCity: string;
  customerPincode: string;
  customerEmail: string;
  customerAltPhone: string;
  weightG: number | null;
  boxId: string | null;
  paymentMode: PaymentMode;
  /** Percentage discount on the line-item subtotal, applied before delivery. */
  discountPct: number;
  /** Flat delivery charge added after the discount. */
  deliveryCharge: number;
  /** Manual final-amount override; when set it supersedes discount + delivery. */
  amountOverride: number | null;
}

export interface ConfirmOrderInput extends OrderDetailsInput {
  items: OrderItemInput[];
}

export interface ConfirmOrderResult {
  applied: number;
  /** Tracked lines whose deduction pushed stock negative (still applied). */
  oversold: number;
  skippedNoInv: number;
}

export interface EditOrderInput extends OrderDetailsInput {
  items: OrderItemInput[];
}

export interface CatalogImportItem {
  brand: string;
  name: string;
  costPrice: number | null;
}

export interface CatalogImportResult {
  brandsAdded: number;
  perfumesAdded: number;
  skipped: number;
  missingCost: number;
}

export function useInventory() {
  // Start from the synchronous local cache so the UI renders immediately, then
  // replace it with the authoritative copy from Supabase (which itself falls back
  // to this same local cache if the network/auth fails).
  const [store, setStore] = useState<InventoryStore>(loadStore);

  useEffect(() => {
    let active = true;
    // Reflect merges pulled in from another device/tab during a save.
    setOnStoreUpdate((s) => {
      if (active) setStore(s);
    });
    void loadInventory().then((s) => {
      if (active) setStore(s);
    });
    return () => {
      active = false;
      setOnStoreUpdate(null);
    };
  }, []);

  const persist = useCallback((next: InventoryStore) => {
    setStore(next);
    saveInventory(next);
  }, []);

  // Current stock is stored directly on each perfume now (mutable, may be
  // negative). The map is just a lookup over that stored value.
  const remainingMlMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const p of store.perfumes) {
      map[p.perfumeId] = p.stockMl;
    }
    return map;
  }, [store.perfumes]);

  // Total money invested to date — the sum of every perfume's cost price. Does
  // NOT shrink as stock is sold (that's what "Total Revenue" tracks instead).
  const totalInvestment = useMemo<number>(() => {
    return store.perfumes.reduce((sum, p) => sum + p.costPrice, 0);
  }, [store.perfumes]);

  // "Perfumes purchased" metric — count of products and total ml ever bought.
  const totalPurchasedCount = store.perfumes.length;
  const totalPurchasedMl = useMemo<number>(() => {
    return store.perfumes.reduce((sum, p) => sum + p.totalMl, 0);
  }, [store.perfumes]);

  const totalRevenue = useMemo<number>(() => {
    return store.sales.reduce((sum, s) => sum + s.totalPrice, 0);
  }, [store.sales]);

  // Total profit across all orders (backfilled for past orders on load).
  const totalProfit = useMemo<number>(() => {
    return store.orders.reduce((sum, o) => sum + (o.profit ?? 0), 0);
  }, [store.orders]);

  // ── Brand mutations ──────────────────────────────────────────────────────────

  const addBrand = useCallback(
    (input: AddBrandInput): Brand => {
      const existing = store.brands.find(
        (b) => b.brandCode.toUpperCase() === input.brandCode.toUpperCase(),
      );
      if (existing !== undefined) {
        toast.error(`Brand code "${input.brandCode}" is already in use.`);
        return existing;
      }
      const brand: Brand = {
        brandId: generateId("brand"),
        brandCode: input.brandCode.toUpperCase(),
        name: input.name.trim(),
        imageUrl: input.imageUrl,
      };
      const entry = makeAuditEntry(
        "create",
        "brand",
        brand.brandId,
        `Created brand "${brand.name}" (${brand.brandCode})`,
      );
      persist({
        ...store,
        brands: [...store.brands, brand],
        auditLog: [...store.auditLog, entry],
      });
      toast.success(`Brand "${brand.name}" added.`);
      return brand;
    },
    [store, persist],
  );

  const editBrand = useCallback(
    (brandId: string, input: EditBrandInput): void => {
      const brand = store.brands.find((b) => b.brandId === brandId);
      if (brand === undefined) return;

      const codeConflict = store.brands.find(
        (b) =>
          b.brandId !== brandId &&
          b.brandCode.toUpperCase() === input.brandCode.toUpperCase(),
      );
      if (codeConflict !== undefined) {
        toast.error(`Brand code "${input.brandCode}" is already in use.`);
        return;
      }

      const newCode = input.brandCode.toUpperCase();
      const codeChanged = brand.brandCode !== newCode;

      const updatedBrands = store.brands.map((b) =>
        b.brandId === brandId
          ? { ...b, name: input.name.trim(), brandCode: newCode, imageUrl: input.imageUrl ?? b.imageUrl }
          : b,
      );

      const updatedPerfumes = codeChanged
        ? store.perfumes.map((p) => {
            if (p.brandId !== brandId) return p;
            const serial = p.perfumeCode.split("-").at(-1) ?? "001";
            return { ...p, perfumeCode: `${newCode}-${serial}` };
          })
        : store.perfumes;

      const entry = makeAuditEntry(
        "edit",
        "brand",
        brandId,
        `Edited brand "${brand.name}" → "${input.name.trim()}"${codeChanged ? ` (code: ${brand.brandCode} → ${newCode})` : ""}`,
      );

      persist({
        ...store,
        brands: updatedBrands,
        perfumes: updatedPerfumes,
        auditLog: [...store.auditLog, entry],
      });
      toast.success(`Brand "${input.name.trim()}" updated.`);
    },
    [store, persist],
  );

  const deleteBrand = useCallback(
    (brandId: string): void => {
      const brand = store.brands.find((b) => b.brandId === brandId);
      if (brand === undefined) return;

      const hasPerfumes = store.perfumes.some((p) => p.brandId === brandId);
      if (hasPerfumes) {
        toast.error(
          `Cannot delete "${brand.name}" — remove all its perfumes first.`,
        );
        return;
      }

      const entry = makeAuditEntry(
        "delete",
        "brand",
        brandId,
        `Deleted brand "${brand.name}" (${brand.brandCode})`,
      );
      persist({
        ...store,
        brands: store.brands.filter((b) => b.brandId !== brandId),
        auditLog: [...store.auditLog, entry],
      });
      toast.success(`Brand "${brand.name}" deleted.`);
    },
    [store, persist],
  );

  // ── Perfume mutations ────────────────────────────────────────────────────────

  const addPerfume = useCallback(
    (input: AddPerfumeInput): Perfume => {
      const brand = store.brands.find((b) => b.brandId === input.brandId);
      if (brand === undefined) {
        toast.error("Brand not found.");
        throw new Error("Brand not found");
      }
      const existingCodes = store.perfumes.map((p) => p.perfumeCode);
      const perfumeCode = nextPerfumeCode(brand.brandCode, existingCodes);
      const perfume: Perfume = {
        perfumeId: generateId("pfm"),
        perfumeCode,
        brandId: input.brandId,
        name: input.name.trim(),
        totalMl: input.totalMl,
        stockMl: input.totalMl, // buy X ml → X ml in stock
        costPrice: input.costPrice,
        purchaseDate: input.purchaseDate,
        imageUrl: input.imageUrl,
      };
      const entry = makeAuditEntry(
        "create",
        "perfume",
        perfume.perfumeId,
        `Added perfume "${perfume.name}" (${perfume.perfumeCode}) — ${perfume.totalMl} ml @ ₹${perfume.costPrice}`,
      );
      persist({
        ...store,
        perfumes: [...store.perfumes, perfume],
        auditLog: [...store.auditLog, entry],
      });
      toast.success(`"${perfume.name}" (${perfume.perfumeCode}) added.`);
      return perfume;
    },
    [store, persist],
  );

  const editPerfume = useCallback(
    (perfumeId: string, input: EditPerfumeInput): void => {
      const perfume = store.perfumes.find((p) => p.perfumeId === perfumeId);
      if (perfume === undefined) return;

      const updatedPerfumes = store.perfumes.map((p) =>
        p.perfumeId === perfumeId
          ? {
              ...p,
              name: input.name.trim(),
              totalMl: input.totalMl,
              costPrice: input.costPrice,
              purchaseDate: input.purchaseDate,
              imageUrl: input.imageUrl ?? p.imageUrl,
            }
          : p,
      );

      const entry = makeAuditEntry(
        "edit",
        "perfume",
        perfumeId,
        `Edited "${perfume.name}" (${perfume.perfumeCode}): name="${input.name.trim()}", ml=${input.totalMl}, cost=₹${input.costPrice}`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        auditLog: [...store.auditLog, entry],
      });
      toast.success(`"${input.name.trim()}" updated.`);
    },
    [store, persist],
  );

  const setPerfumeImage = useCallback(
    (perfumeId: string, imageUrl: string | null): void => {
      const perfume = store.perfumes.find((p) => p.perfumeId === perfumeId);
      if (perfume === undefined) return;
      const updatedPerfumes = store.perfumes.map((p) =>
        p.perfumeId === perfumeId
          ? { ...p, imageUrl: imageUrl ?? undefined }
          : p,
      );
      const entry = makeAuditEntry(
        "edit",
        "perfume",
        perfumeId,
        `${imageUrl !== null ? "Set" : "Removed"} image for "${perfume.name}" (${perfume.perfumeCode})`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        auditLog: [...store.auditLog, entry],
      });
      toast.success(
        imageUrl !== null ? "Image saved." : "Image removed.",
      );
    },
    [store, persist],
  );

  /** Set a perfume's current stock to an absolute value (any finite number,
   * including negative). This overwrites stock outright — it does not subtract
   * past sales. */
  const setPerfumeStock = useCallback(
    (perfumeId: string, stockMl: number): void => {
      const perfume = store.perfumes.find((p) => p.perfumeId === perfumeId);
      if (perfume === undefined) return;

      const updatedPerfumes = store.perfumes.map((p) =>
        p.perfumeId === perfumeId ? { ...p, stockMl } : p,
      );
      const entry = makeAuditEntry(
        "edit",
        "perfume",
        perfumeId,
        `Set stock for "${perfume.name}" (${perfume.perfumeCode}): ${perfume.stockMl} ml → ${stockMl} ml`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        auditLog: [...store.auditLog, entry],
      });
      toast.success(`Stock set to ${stockMl} ml for ${perfume.name}.`);
    },
    [store, persist],
  );

  const deletePerfume = useCallback(
    (perfumeId: string): void => {
      const perfume = store.perfumes.find((p) => p.perfumeId === perfumeId);
      if (perfume === undefined) return;

      const hasSales = store.sales.some((s) => s.perfumeId === perfumeId);
      if (hasSales) {
        toast.error(
          `Cannot delete "${perfume.name}" — it has existing sales records.`,
        );
        return;
      }

      const entry = makeAuditEntry(
        "delete",
        "perfume",
        perfumeId,
        `Deleted perfume "${perfume.name}" (${perfume.perfumeCode})`,
      );
      persist({
        ...store,
        perfumes: store.perfumes.filter((p) => p.perfumeId !== perfumeId),
        auditLog: [...store.auditLog, entry],
      });
      toast.success(`"${perfume.name}" removed from inventory.`);
    },
    [store, persist],
  );

  // ── Sale mutations ───────────────────────────────────────────────────────────

  const recordSale = useCallback(
    (input: RecordSaleInput): boolean => {
      const perfume = store.perfumes.find(
        (p) => p.perfumeId === input.perfumeId,
      );
      const remaining = perfume?.stockMl ?? 0;

      const sale: Sale = {
        id: generateId("sale"),
        perfumeId: input.perfumeId,
        mlSold: input.mlSold,
        date: new Date().toISOString().slice(0, 10),
        totalPrice: input.totalPrice,
      };

      const perfumeName = perfume?.name ?? "Perfume";
      const perfumeCode = perfume?.perfumeCode ?? input.perfumeId;

      const entry = makeAuditEntry(
        "create",
        "sale",
        sale.id,
        `Recorded sale: ${input.mlSold} ml of "${perfumeName}" (${perfumeCode}) @ ₹${input.totalPrice}`,
      );

      // Decrement the perfume's stored stock (may go negative — that's fine).
      const updatedPerfumes = store.perfumes.map((p) =>
        p.perfumeId === input.perfumeId
          ? { ...p, stockMl: p.stockMl - input.mlSold }
          : p,
      );

      persist({
        ...store,
        perfumes: updatedPerfumes,
        sales: [...store.sales, sale],
        auditLog: [...store.auditLog, entry],
      });

      const afterRemaining = remaining - input.mlSold;
      toast.success(`Sale recorded — ${input.mlSold} ml of ${perfumeName}.`);

      if (afterRemaining < 0) {
        toast.warning(
          `${perfumeName} is now oversold (${afterRemaining.toFixed(1)} ml). Update stock when you restock.`,
        );
      } else if (afterRemaining < 10) {
        toast.warning(
          `Critical: ${perfumeName} is below 10 ml (${afterRemaining.toFixed(1)} ml left).`,
        );
      } else if (afterRemaining <= 30) {
        toast.warning(
          `Low stock: ${perfumeName} is at ${afterRemaining.toFixed(1)} ml.`,
        );
      }

      return true;
    },
    [store, persist],
  );

  const editSale = useCallback(
    (saleId: string, input: EditSaleInput): void => {
      const sale = store.sales.find((s) => s.id === saleId);
      if (sale === undefined) return;

      const perfume = store.perfumes.find((p) => p.perfumeId === sale.perfumeId);

      const updatedSales = store.sales.map((s) =>
        s.id === saleId
          ? { ...s, mlSold: input.mlSold, totalPrice: input.totalPrice }
          : s,
      );

      // Adjust stock by the delta: selling less returns ml, selling more takes
      // more. No cap — stock may go negative.
      const delta = sale.mlSold - input.mlSold;
      const updatedPerfumes = store.perfumes.map((p) =>
        p.perfumeId === sale.perfumeId
          ? { ...p, stockMl: p.stockMl + delta }
          : p,
      );

      const perfumeName = perfume?.name ?? "Perfume";
      const entry = makeAuditEntry(
        "edit",
        "sale",
        saleId,
        `Edited sale for "${perfumeName}": ${sale.mlSold} ml → ${input.mlSold} ml, ₹${sale.totalPrice} → ₹${input.totalPrice}`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        sales: updatedSales,
        auditLog: [...store.auditLog, entry],
      });
      toast.success("Sale updated.");
    },
    [store, persist],
  );

  const deleteSale = useCallback(
    (saleId: string): void => {
      const sale = store.sales.find((s) => s.id === saleId);
      if (sale === undefined) return;

      const perfume = store.perfumes.find((p) => p.perfumeId === sale.perfumeId);
      const perfumeName = perfume?.name ?? "Perfume";

      // Deleting a sale returns its ml to stock.
      const updatedPerfumes = store.perfumes.map((p) =>
        p.perfumeId === sale.perfumeId
          ? { ...p, stockMl: p.stockMl + sale.mlSold }
          : p,
      );

      const entry = makeAuditEntry(
        "delete",
        "sale",
        saleId,
        `Deleted sale: ${sale.mlSold} ml of "${perfumeName}" on ${sale.date} (₹${sale.totalPrice})`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        sales: store.sales.filter((s) => s.id !== saleId),
        auditLog: [...store.auditLog, entry],
      });
      toast.success("Sale removed.");
    },
    [store, persist],
  );

  const bulkImport = useCallback(
    (payload: ImportPayload): { brandsAdded: number; perfumesAdded: number } => {
      let nextStore = { ...store };
      let brandsAdded = 0;
      let perfumesAdded = 0;

      for (const b of payload.brands ?? []) {
        const alreadyExists = nextStore.brands.some(
          (existing) => existing.brandCode.toUpperCase() === b.brandCode.toUpperCase(),
        );
        if (alreadyExists) continue;
        const newBrand: Brand = {
          brandId: generateId("brand"),
          brandCode: b.brandCode.toUpperCase(),
          name: b.name.trim(),
        };
        nextStore = { ...nextStore, brands: [...nextStore.brands, newBrand] };
        brandsAdded += 1;
      }

      for (const p of payload.perfumes ?? []) {
        const brand = nextStore.brands.find(
          (b) => b.brandCode.toUpperCase() === p.brandCode.toUpperCase(),
        );
        if (brand === undefined) continue;
        const existingCodes = nextStore.perfumes.map((pf) => pf.perfumeCode);
        const perfumeCode = nextPerfumeCode(brand.brandCode, existingCodes);
        const newPerfume: Perfume = {
          perfumeId: generateId("pfm"),
          perfumeCode,
          brandId: brand.brandId,
          name: p.name.trim(),
          totalMl: p.totalMl,
          stockMl: p.totalMl,
          costPrice: p.costPrice,
          purchaseDate: p.purchaseDate,
        };
        nextStore = { ...nextStore, perfumes: [...nextStore.perfumes, newPerfume] };
        perfumesAdded += 1;
      }

      if (brandsAdded > 0 || perfumesAdded > 0) {
        const entry = makeAuditEntry(
          "create",
          "brand",
          "bulk-import",
          `Bulk import: ${brandsAdded} brand${brandsAdded !== 1 ? "s" : ""}, ${perfumesAdded} perfume${perfumesAdded !== 1 ? "s" : ""} added`,
        );
        nextStore = { ...nextStore, auditLog: [...nextStore.auditLog, entry] };
        persist(nextStore);
        toast.success(`Import complete — ${brandsAdded} brands, ${perfumesAdded} perfumes added.`);
      } else {
        toast.info("Nothing new to import — all items already exist.");
      }

      return { brandsAdded, perfumesAdded };
    },
    [store, persist],
  );

  const importCatalog = useCallback(
    (items: CatalogImportItem[]): CatalogImportResult => {
      const norm = (s: string) => normalizeName(s);
      const brands = [...store.brands];
      const perfumes = [...store.perfumes];
      const usedCodes = new Set(brands.map((b) => b.brandCode.toUpperCase()));
      const brandByName = new Map(
        brands.map((b) => [norm(b.name), b] as const),
      );
      const existingPerfumeKeys = new Set(
        perfumes.map((p) => `${p.brandId}|${norm(p.name)}`),
      );

      let brandsAdded = 0;
      let perfumesAdded = 0;
      let skipped = 0;
      let missingCost = 0;

      const makeCode = (name: string): string => {
        const words = name.trim().split(/\s+/).filter(Boolean);
        let base =
          words.length >= 2
            ? words.map((w) => w[0]).join("").slice(0, 4)
            : (words[0] ?? "BRD").slice(0, 3);
        base = base.toUpperCase() || "BRD";
        let code = base;
        let n = 2;
        while (usedCodes.has(code.toUpperCase())) {
          code = `${base}${n}`;
          n += 1;
        }
        usedCodes.add(code.toUpperCase());
        return code;
      };

      for (const item of items) {
        const brandName =
          item.brand.trim() === "" ? "Unbranded" : item.brand.trim();
        let brand = brandByName.get(norm(brandName));
        if (brand === undefined) {
          brand = {
            brandId: generateId("brand"),
            brandCode: makeCode(brandName),
            name: brandName,
          };
          brands.push(brand);
          brandByName.set(norm(brandName), brand);
          brandsAdded += 1;
        }

        const key = `${brand.brandId}|${norm(item.name)}`;
        if (item.name.trim() === "" || existingPerfumeKeys.has(key)) {
          skipped += 1;
          continue;
        }

        const perfumeCode = nextPerfumeCode(
          brand.brandCode,
          perfumes.map((p) => p.perfumeCode),
        );
        if (item.costPrice === null) missingCost += 1;
        perfumes.push({
          perfumeId: generateId("pfm"),
          perfumeCode,
          brandId: brand.brandId,
          name: item.name.trim(),
          totalMl: 0,
          stockMl: 0,
          costPrice: item.costPrice ?? 0,
          purchaseDate: today(),
        });
        existingPerfumeKeys.add(key);
        perfumesAdded += 1;
      }

      if (brandsAdded > 0 || perfumesAdded > 0) {
        const entry = makeAuditEntry(
          "create",
          "perfume",
          "catalog-import",
          `Catalog import from sheet: +${brandsAdded} brand(s), +${perfumesAdded} perfume(s), ${skipped} already present`,
        );
        persist({
          ...store,
          brands,
          perfumes,
          auditLog: [...store.auditLog, entry],
        });
        toast.success(
          `Imported ${perfumesAdded} perfume(s) and ${brandsAdded} brand(s).`,
        );
      } else {
        toast.info("Nothing to import — all catalog perfumes already exist.");
      }

      return { brandsAdded, perfumesAdded, skipped, missingCost };
    },
    [store, persist],
  );

  // ── Cost catalog (bottle cost + size per perfume, powers order profit) ───────

  const upsertCost = useCallback(
    (
      originalKey: string | null,
      input: { brand: string; perfume: string; bottleCost: number; bottleMl: number },
    ): void => {
      const key = normalizeName(`${input.brand} ${input.perfume}`);
      if (key === "") {
        toast.error("Enter a brand and perfume name.");
        return;
      }
      const entry: PerfumeCost = {
        key,
        brand: input.brand.trim(),
        perfume: input.perfume.trim(),
        bottleCost: input.bottleCost,
        bottleMl: input.bottleMl,
      };
      // Drop the row being edited (originalKey) and any existing row with the new
      // key, then append — so a rename can't create a duplicate.
      const costCatalog = [
        ...store.costCatalog.filter(
          (c) => c.key !== key && c.key !== originalKey,
        ),
        entry,
      ];
      persist({ ...store, costCatalog });
      toast.success(`Cost saved for ${entry.perfume}.`);
    },
    [store, persist],
  );

  const deleteCost = useCallback(
    (key: string): void => {
      persist({
        ...store,
        costCatalog: store.costCatalog.filter((c) => c.key !== key),
      });
      toast.success("Cost entry removed.");
    },
    [store, persist],
  );

  // ── Pricebook (app-owned selling prices; overlay on the read-only sheet) ─────

  /** Set (value) or clear (null) an app-owned selling price for a perfume/size.
   * Clearing falls back to the sheet price. Quiet — meant for inline grid edits. */
  const setPrice = useCallback(
    (
      brand: string,
      perfume: string,
      size: DecantSize,
      value: number | null,
    ): void => {
      const key = priceKey(brand, perfume);
      const existing = store.pricebook.find((p) => p.key === key);

      let pricebook: PerfumePrice[];
      if (value === null) {
        if (existing === undefined) return;
        const nextPrices = { ...existing.prices };
        delete nextPrices[size];
        pricebook =
          Object.keys(nextPrices).length === 0
            ? store.pricebook.filter((p) => p.key !== key)
            : store.pricebook.map((p) =>
                p.key === key ? { ...p, prices: nextPrices } : p,
              );
      } else if (existing !== undefined) {
        pricebook = store.pricebook.map((p) =>
          p.key === key
            ? { ...p, prices: { ...p.prices, [size]: value } }
            : p,
        );
      } else {
        pricebook = [
          ...store.pricebook,
          {
            key,
            brand: brand.trim(),
            perfume: perfume.trim(),
            prices: { [size]: value },
          },
        ];
      }
      persist({ ...store, pricebook });
    },
    [store, persist],
  );

  const clearAllInventory = useCallback((): void => {
    const removed = {
      brands: store.brands.length,
      perfumes: store.perfumes.length,
      sales: store.sales.length,
    };
    const entry = makeAuditEntry(
      "delete",
      "perfume",
      "clear-all",
      `Cleared all inventory: removed ${removed.brands} brand(s), ${removed.perfumes} perfume(s), ${removed.sales} sale(s)`,
    );
    persist({
      brands: [],
      perfumes: [],
      sales: [],
      orders: [],
      auditLog: [...store.auditLog, entry],
      costCatalog: store.costCatalog, // keep the cost reference intact
      pricebook: store.pricebook, // keep selling prices intact
    });
    toast.success("Inventory cleared — all brands, perfumes, and sales removed.");
  }, [store, persist]);

  // ── Customer orders (history) ────────────────────────────────────────────────

  const confirmOrder = useCallback(
    (input: ConfirmOrderInput): ConfirmOrderResult => {
      const sales = [...store.sales];
      const auditLog = [...store.auditLog];
      // Track stock locally so multiple lines for the same perfume stack.
      const stockLocal: Record<string, number> = {};
      for (const p of store.perfumes) stockLocal[p.perfumeId] = p.stockMl;

      const costIndex = buildCostIndex(store.costCatalog);
      const items: OrderLineRecord[] = [];
      let applied = 0;
      let oversold = 0;
      let skippedNoInv = 0;

      for (const it of input.items) {
        let saleId: string | null = null;
        if (it.perfumeId === null) {
          skippedNoInv += 1;
        } else {
          // Always deduct — never block. Stock may go negative.
          const rem = stockLocal[it.perfumeId] ?? 0;
          if (it.mlSold > rem) oversold += 1;
          const sale: Sale = {
            id: generateId("sale"),
            perfumeId: it.perfumeId,
            mlSold: it.mlSold,
            date: today(),
            totalPrice: it.unitPrice,
          };
          sales.push(sale);
          stockLocal[it.perfumeId] = rem - it.mlSold;
          saleId = sale.id;
          applied += 1;
        }
        const pc =
          it.mlSold > 0 ? lookupCost(costIndex, it.brand, it.perfumeName) : null;
        items.push({
          perfumeId: it.perfumeId,
          perfumeName: it.perfumeName,
          brand: it.brand,
          size: it.size,
          mlSold: it.mlSold,
          unitPrice: it.unitPrice,
          unitCost:
            pc !== null && it.mlSold > 0
              ? decantPerfumeCost(pc, it.mlSold)
              : undefined,
          saleId,
        });
      }

      const updatedPerfumes = store.perfumes.map((p) => ({
        ...p,
        stockMl: stockLocal[p.perfumeId] ?? p.stockMl,
      }));

      const total = items.reduce((sum, i) => sum + i.unitPrice, 0);
      const revenue = computeChargedTotal(
        total,
        input.discountPct,
        input.deliveryCharge,
        input.amountOverride,
      );
      const profit = orderProfitFromItems(items, revenue);
      const nextSeq =
        store.orders.reduce((max, o) => Math.max(max, o.seq ?? 0), 0) + 1;
      const order: Order = {
        id: generateId("order"),
        date: new Date().toISOString(),
        seq: nextSeq,
        customerName: input.customerName.trim(),
        customerAddress: input.customerAddress.trim(),
        customerPhone: input.customerPhone.trim(),
        customerCity: input.customerCity.trim(),
        customerPincode: input.customerPincode.trim(),
        customerEmail: input.customerEmail.trim(),
        customerAltPhone: input.customerAltPhone.trim(),
        weightG: input.weightG,
        boxId: input.boxId,
        paymentMode: input.paymentMode,
        discountPct: input.discountPct,
        deliveryCharge: input.deliveryCharge,
        amountOverride: input.amountOverride,
        items,
        total,
        profit,
      };
      const entry = makeAuditEntry(
        "create",
        "sale",
        order.id,
        `Order${order.customerName !== "" ? ` for ${order.customerName}` : ""}: ${applied} item(s) deducted, ₹${total} total, ₹${Math.round(profit)} profit`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        sales,
        orders: [...store.orders, order],
        auditLog: [...auditLog, entry],
      });

      toast.success(
        `Order saved — ${applied} item${applied !== 1 ? "s" : ""} deducted from stock.`,
      );
      if (skippedNoInv > 0) {
        toast.info(
          `${skippedNoInv} item${skippedNoInv !== 1 ? "s" : ""} billed but not in tracked inventory.`,
        );
      }
      if (oversold > 0) {
        toast.warning(
          `${oversold} item${oversold !== 1 ? "s" : ""} pushed stock negative — deducted anyway.`,
        );
      }
      return { applied, oversold, skippedNoInv };
    },
    [store, persist],
  );

  const deleteOrder = useCallback(
    (orderId: string): void => {
      const order = store.orders.find((o) => o.id === orderId);
      if (order === undefined) return;

      const saleIds = new Set(
        order.items.map((i) => i.saleId).filter((id): id is string => id !== null),
      );

      // Return each deducted line's ml back to its perfume's stock.
      const restoreByPerfume: Record<string, number> = {};
      for (const s of store.sales) {
        if (saleIds.has(s.id)) {
          restoreByPerfume[s.perfumeId] =
            (restoreByPerfume[s.perfumeId] ?? 0) + s.mlSold;
        }
      }
      const updatedPerfumes = store.perfumes.map((p) =>
        restoreByPerfume[p.perfumeId] !== undefined
          ? { ...p, stockMl: p.stockMl + restoreByPerfume[p.perfumeId] }
          : p,
      );

      const entry = makeAuditEntry(
        "delete",
        "sale",
        orderId,
        `Deleted order${order.customerName !== "" ? ` for ${order.customerName}` : ""} — restored ${saleIds.size} sale(s), ₹${order.total}`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        sales: store.sales.filter((s) => !saleIds.has(s.id)),
        orders: store.orders.filter((o) => o.id !== orderId),
        auditLog: [...store.auditLog, entry],
      });
      toast.success("Order deleted — stock restored.");
    },
    [store, persist],
  );

  const editOrder = useCallback(
    (orderId: string, input: EditOrderInput): boolean => {
      const order = store.orders.find((o) => o.id === orderId);
      if (order === undefined) return false;

      // Revert this order's existing sales, adding their ml back to stock.
      const oldSaleIds = new Set(
        order.items.map((i) => i.saleId).filter((id): id is string => id !== null),
      );
      let sales = store.sales.filter((s) => !oldSaleIds.has(s.id));

      const stockLocal: Record<string, number> = {};
      for (const p of store.perfumes) stockLocal[p.perfumeId] = p.stockMl;
      for (const s of store.sales) {
        if (oldSaleIds.has(s.id)) {
          stockLocal[s.perfumeId] = (stockLocal[s.perfumeId] ?? 0) + s.mlSold;
        }
      }

      // Re-apply the edited/added lines. Never block — warn only. Stock may go
      // negative ("what I say goes").
      const costIndex = buildCostIndex(store.costCatalog);
      const items: OrderLineRecord[] = [];
      let oversold = 0;
      for (const it of input.items) {
        let saleId: string | null = null;
        if (it.perfumeId !== null && it.mlSold > 0) {
          const rem = stockLocal[it.perfumeId] ?? 0;
          if (it.mlSold > rem) oversold += 1;
          const sale: Sale = {
            id: generateId("sale"),
            perfumeId: it.perfumeId,
            mlSold: it.mlSold,
            date: today(),
            totalPrice: it.unitPrice,
          };
          sales = [...sales, sale];
          stockLocal[it.perfumeId] = rem - it.mlSold;
          saleId = sale.id;
        }
        const pc =
          it.mlSold > 0 ? lookupCost(costIndex, it.brand, it.perfumeName) : null;
        items.push({
          perfumeId: it.perfumeId,
          perfumeName: it.perfumeName,
          brand: it.brand,
          size: it.size,
          mlSold: it.mlSold,
          unitPrice: it.unitPrice,
          unitCost:
            pc !== null && it.mlSold > 0
              ? decantPerfumeCost(pc, it.mlSold)
              : undefined,
          saleId,
        });
      }

      const updatedPerfumes = store.perfumes.map((p) => ({
        ...p,
        stockMl: stockLocal[p.perfumeId] ?? p.stockMl,
      }));

      const total = items.reduce((sum, i) => sum + i.unitPrice, 0);
      const revenue = computeChargedTotal(
        total,
        input.discountPct,
        input.deliveryCharge,
        input.amountOverride,
      );
      const profit = orderProfitFromItems(items, revenue);
      const updatedOrder: Order = {
        ...order,
        customerName: input.customerName.trim(),
        customerAddress: input.customerAddress.trim(),
        customerPhone: input.customerPhone.trim(),
        customerCity: input.customerCity.trim(),
        customerPincode: input.customerPincode.trim(),
        customerEmail: input.customerEmail.trim(),
        customerAltPhone: input.customerAltPhone.trim(),
        weightG: input.weightG,
        boxId: input.boxId,
        paymentMode: input.paymentMode,
        discountPct: input.discountPct,
        deliveryCharge: input.deliveryCharge,
        amountOverride: input.amountOverride,
        items,
        total,
        profit,
      };
      const entry = makeAuditEntry(
        "edit",
        "sale",
        orderId,
        `Edited order${updatedOrder.customerName !== "" ? ` for ${updatedOrder.customerName}` : ""} — now ₹${total}, ₹${Math.round(profit)} profit`,
      );
      persist({
        ...store,
        perfumes: updatedPerfumes,
        sales,
        orders: store.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        auditLog: [...store.auditLog, entry],
      });
      toast.success("Order updated — stock adjusted.");
      if (oversold > 0) {
        toast.warning(
          `${oversold} item${oversold !== 1 ? "s" : ""} pushed stock negative — saved anyway.`,
        );
      }
      return true;
    },
    [store, persist],
  );

  return {
    brands: store.brands,
    perfumes: store.perfumes,
    sales: store.sales,
    orders: store.orders,
    auditLog: store.auditLog,
    costCatalog: store.costCatalog,
    pricebook: store.pricebook,
    remainingMlMap,
    totalInvestment,
    totalPurchasedCount,
    totalPurchasedMl,
    totalRevenue,
    totalProfit,
    addBrand,
    editBrand,
    deleteBrand,
    addPerfume,
    editPerfume,
    deletePerfume,
    setPerfumeImage,
    setPerfumeStock,
    recordSale,
    editSale,
    deleteSale,
    bulkImport,
    importCatalog,
    clearAllInventory,
    upsertCost,
    deleteCost,
    setPrice,
    confirmOrder,
    deleteOrder,
    editOrder,
  };
}
