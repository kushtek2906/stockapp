import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { loadStore } from "../lib/storage";
import { loadInventory, saveInventory } from "../lib/remoteStore";
import type { ImportPayload } from "../lib/importSchema";
import { normalizeName } from "../lib/normalize";
import { computeRemainingMl, nextPerfumeCode, today } from "../lib/utils";
import type {
  AuditAction,
  AuditEntry,
  AuditEntity,
  Brand,
  DecantSize,
  InventoryStore,
  Order,
  OrderLineRecord,
  Perfume,
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

export interface ConfirmOrderInput {
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  items: OrderItemInput[];
}

export interface ConfirmOrderResult {
  applied: number;
  failed: number;
  skippedNoInv: number;
}

export interface EditOrderInput {
  customerName: string;
  customerAddress: string;
  customerPhone: string;
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
    void loadInventory().then((s) => {
      if (active) setStore(s);
    });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((next: InventoryStore) => {
    setStore(next);
    saveInventory(next);
  }, []);

  const remainingMlMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const p of store.perfumes) {
      map[p.perfumeId] = computeRemainingMl(p.totalMl, p.perfumeId, store.sales);
    }
    return map;
  }, [store.perfumes, store.sales]);

  const totalStockValue = useMemo<number>(() => {
    return store.perfumes.reduce((sum, p) => {
      const remaining = remainingMlMap[p.perfumeId] ?? 0;
      const costPerMl = p.totalMl > 0 ? p.costPrice / p.totalMl : 0;
      return sum + remaining * costPerMl;
    }, 0);
  }, [store.perfumes, remainingMlMap]);

  const totalRevenue = useMemo<number>(() => {
    return store.sales.reduce((sum, s) => sum + s.totalPrice, 0);
  }, [store.sales]);

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
      const remaining = remainingMlMap[input.perfumeId] ?? 0;
      if (input.mlSold > remaining) {
        toast.error(
          `Not enough stock. Only ${remaining.toFixed(1)} ml remaining.`,
        );
        return false;
      }

      const sale: Sale = {
        id: generateId("sale"),
        perfumeId: input.perfumeId,
        mlSold: input.mlSold,
        date: new Date().toISOString().slice(0, 10),
        totalPrice: input.totalPrice,
      };

      const perfume = store.perfumes.find(
        (p) => p.perfumeId === input.perfumeId,
      );
      const perfumeName = perfume?.name ?? "Perfume";
      const perfumeCode = perfume?.perfumeCode ?? input.perfumeId;

      const entry = makeAuditEntry(
        "create",
        "sale",
        sale.id,
        `Recorded sale: ${input.mlSold} ml of "${perfumeName}" (${perfumeCode}) @ ₹${input.totalPrice}`,
      );

      const nextStore = {
        ...store,
        sales: [...store.sales, sale],
        auditLog: [...store.auditLog, entry],
      };
      persist(nextStore);

      const afterRemaining = remaining - input.mlSold;
      toast.success(`Sale recorded — ${input.mlSold} ml of ${perfumeName}.`);

      if (afterRemaining < 10) {
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
    [store, persist, remainingMlMap],
  );

  const editSale = useCallback(
    (saleId: string, input: EditSaleInput): void => {
      const sale = store.sales.find((s) => s.id === saleId);
      if (sale === undefined) return;

      const perfume = store.perfumes.find((p) => p.perfumeId === sale.perfumeId);
      const remainingWithoutThis =
        (remainingMlMap[sale.perfumeId] ?? 0) + sale.mlSold;

      if (input.mlSold > remainingWithoutThis) {
        toast.error(
          `Cannot set ${input.mlSold} ml — only ${remainingWithoutThis.toFixed(1)} ml available for this perfume.`,
        );
        return;
      }

      const updatedSales = store.sales.map((s) =>
        s.id === saleId
          ? { ...s, mlSold: input.mlSold, totalPrice: input.totalPrice }
          : s,
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
        sales: updatedSales,
        auditLog: [...store.auditLog, entry],
      });
      toast.success("Sale updated.");
    },
    [store, persist, remainingMlMap],
  );

  const deleteSale = useCallback(
    (saleId: string): void => {
      const sale = store.sales.find((s) => s.id === saleId);
      if (sale === undefined) return;

      const perfume = store.perfumes.find((p) => p.perfumeId === sale.perfumeId);
      const perfumeName = perfume?.name ?? "Perfume";

      const entry = makeAuditEntry(
        "delete",
        "sale",
        saleId,
        `Deleted sale: ${sale.mlSold} ml of "${perfumeName}" on ${sale.date} (₹${sale.totalPrice})`,
      );
      persist({
        ...store,
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
    });
    toast.success("Inventory cleared — all brands, perfumes, and sales removed.");
  }, [store, persist]);

  // ── Customer orders (history) ────────────────────────────────────────────────

  const confirmOrder = useCallback(
    (input: ConfirmOrderInput): ConfirmOrderResult => {
      const sales = [...store.sales];
      const auditLog = [...store.auditLog];
      const remainingLocal: Record<string, number> = { ...remainingMlMap };

      const items: OrderLineRecord[] = [];
      let applied = 0;
      let failed = 0;
      let skippedNoInv = 0;

      for (const it of input.items) {
        let saleId: string | null = null;
        if (it.perfumeId === null) {
          skippedNoInv += 1;
        } else {
          const rem = remainingLocal[it.perfumeId] ?? 0;
          if (it.mlSold > rem) {
            failed += 1;
          } else {
            const sale: Sale = {
              id: generateId("sale"),
              perfumeId: it.perfumeId,
              mlSold: it.mlSold,
              date: today(),
              totalPrice: it.unitPrice,
            };
            sales.push(sale);
            remainingLocal[it.perfumeId] = rem - it.mlSold;
            saleId = sale.id;
            applied += 1;
          }
        }
        items.push({
          perfumeId: it.perfumeId,
          perfumeName: it.perfumeName,
          brand: it.brand,
          size: it.size,
          mlSold: it.mlSold,
          unitPrice: it.unitPrice,
          saleId,
        });
      }

      const total = items.reduce((sum, i) => sum + i.unitPrice, 0);
      const order: Order = {
        id: generateId("order"),
        date: new Date().toISOString(),
        customerName: input.customerName.trim(),
        customerAddress: input.customerAddress.trim(),
        customerPhone: input.customerPhone.trim(),
        items,
        total,
      };
      const entry = makeAuditEntry(
        "create",
        "sale",
        order.id,
        `Order${order.customerName !== "" ? ` for ${order.customerName}` : ""}: ${applied} item(s) deducted, ₹${total} total`,
      );
      persist({
        ...store,
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
      if (failed > 0) {
        toast.warning(
          `${failed} item${failed !== 1 ? "s" : ""} couldn't be deducted (insufficient stock).`,
        );
      }
      return { applied, failed, skippedNoInv };
    },
    [store, persist, remainingMlMap],
  );

  const deleteOrder = useCallback(
    (orderId: string): void => {
      const order = store.orders.find((o) => o.id === orderId);
      if (order === undefined) return;

      const saleIds = new Set(
        order.items.map((i) => i.saleId).filter((id): id is string => id !== null),
      );
      const entry = makeAuditEntry(
        "delete",
        "sale",
        orderId,
        `Deleted order${order.customerName !== "" ? ` for ${order.customerName}` : ""} — restored ${saleIds.size} sale(s), ₹${order.total}`,
      );
      persist({
        ...store,
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

      // Revert: drop this order's existing sales, then recompute remaining.
      const oldSaleIds = new Set(
        order.items.map((i) => i.saleId).filter((id): id is string => id !== null),
      );
      let sales = store.sales.filter((s) => !oldSaleIds.has(s.id));
      const remaining: Record<string, number> = {};
      for (const p of store.perfumes) {
        remaining[p.perfumeId] = computeRemainingMl(p.totalMl, p.perfumeId, sales);
      }

      // Re-apply the edited/added lines as new sales, validating stock.
      const items: OrderLineRecord[] = [];
      for (const it of input.items) {
        let saleId: string | null = null;
        if (it.perfumeId !== null && it.mlSold > 0) {
          const rem = remaining[it.perfumeId] ?? 0;
          if (it.mlSold > rem) {
            toast.error(
              `Not enough stock for ${it.perfumeName} — only ${rem.toFixed(1)} ml left.`,
            );
            return false;
          }
          const sale: Sale = {
            id: generateId("sale"),
            perfumeId: it.perfumeId,
            mlSold: it.mlSold,
            date: today(),
            totalPrice: it.unitPrice,
          };
          sales = [...sales, sale];
          remaining[it.perfumeId] = rem - it.mlSold;
          saleId = sale.id;
        }
        items.push({
          perfumeId: it.perfumeId,
          perfumeName: it.perfumeName,
          brand: it.brand,
          size: it.size,
          mlSold: it.mlSold,
          unitPrice: it.unitPrice,
          saleId,
        });
      }

      const total = items.reduce((sum, i) => sum + i.unitPrice, 0);
      const updatedOrder: Order = {
        ...order,
        customerName: input.customerName.trim(),
        customerAddress: input.customerAddress.trim(),
        customerPhone: input.customerPhone.trim(),
        items,
        total,
      };
      const entry = makeAuditEntry(
        "edit",
        "sale",
        orderId,
        `Edited order${updatedOrder.customerName !== "" ? ` for ${updatedOrder.customerName}` : ""} — now ₹${total}`,
      );
      persist({
        ...store,
        sales,
        orders: store.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        auditLog: [...store.auditLog, entry],
      });
      toast.success("Order updated — stock adjusted.");
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
    remainingMlMap,
    totalStockValue,
    totalRevenue,
    addBrand,
    editBrand,
    deleteBrand,
    addPerfume,
    editPerfume,
    deletePerfume,
    recordSale,
    editSale,
    deleteSale,
    bulkImport,
    importCatalog,
    clearAllInventory,
    confirmOrder,
    deleteOrder,
    editOrder,
  };
}
