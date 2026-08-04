export interface Brand {
  brandId: string;
  brandCode: string;
  name: string;
  imageUrl?: string;
}

export interface Perfume {
  perfumeId: string;
  perfumeCode: string;
  brandId: string;
  name: string;
  /** Original purchased volume (the bottle size at purchase). Set when the
   * perfume is added; feeds the "perfumes purchased" metric. NOT used to derive
   * current stock. */
  totalMl: number;
  /** Current stock in ml — the source of truth for "remaining". Mutable: set
   * absolutely from the stock editor, decremented by sales/orders, and allowed
   * to go negative so oversell stays visible. */
  stockMl: number;
  costPrice: number;
  purchaseDate: string;
  imageUrl?: string;
}

export interface Sale {
  id: string;
  perfumeId: string;
  mlSold: number;
  date: string;
  totalPrice: number;
}

export type AuditAction = "create" | "edit" | "delete";
export type AuditEntity = "brand" | "perfume" | "sale";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  description: string;
}

export type StockStatus = "ok" | "low" | "critical";

export type Page =
  | "dashboard"
  | "inventory"
  | "sales"
  | "order"
  | "history"
  | "compare"
  | "costs"
  | "audit";

// ── Google Sheet decant catalog (read-only pricing source) ───────────────────

export type DecantSize = 3 | 5 | 10 | 30;

export const DECANT_SIZES: DecantSize[] = [3, 5, 10, 30];

export interface DecantCatalogEntry {
  brand: string;
  perfume: string;
  inspiration: string;
  /** Price per size, in INR. A size is present only if the sheet lists a price for it. */
  prices: Partial<Record<DecantSize, number>>;
  /** 0-based source row in the sheet, kept for a future write-back feature. */
  rowIndex: number;
}

export interface DecantCatalog {
  entries: DecantCatalogEntry[];
  lastSynced: string; // ISO timestamp
  sheetId: string;
  gid: string;
}

// ── Customer orders (history) ────────────────────────────────────────────────

/** One line of a confirmed order. `saleId` links it to the Sale it deducted
 * (null if the item wasn't in tracked inventory or stock was insufficient). */
export interface OrderLineRecord {
  perfumeId: string | null;
  perfumeName: string;
  brand: string;
  size: DecantSize | null;
  mlSold: number;
  unitPrice: number;
  /** Perfume cost for this decant (cost-per-ml × ml), stored at confirm time.
   * Undefined for older orders / lines with no cost data. */
  unitCost?: number;
  saleId: string | null;
}

export type PaymentMode = "Prepaid" | "COD";

/** A shipping box preset — fills length/height/width/weight in the pickup CSV. */
export interface BoxType {
  id: string;
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightG: number;
}

export interface Order {
  id: string;
  date: string; // ISO timestamp
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  items: OrderLineRecord[];
  total: number;
  // ── Shipping / payment (all optional; fillable later from Order History) ──
  seq?: number; // running order number, used in the shipment id
  customerCity?: string;
  customerPincode?: string;
  customerEmail?: string;
  customerAltPhone?: string;
  weightG?: number | null; // optional per-order weight; falls back to the box's weight
  boxId?: string | null; // which BoxType this ships in
  paymentMode?: PaymentMode; // default "Prepaid"
  amountOverride?: number | null; // legacy manual final-amount override (old orders)
  /** Percentage discount applied to the line-item subtotal, before delivery. */
  discountPct?: number;
  /** Flat delivery charge added to the order after the discount (₹100 default). */
  deliveryCharge?: number;
  /** Net profit at confirm time: revenue − perfume costs − ₹25/decant − ₹70 − ₹10.
   * Undefined for orders placed before profit tracking. */
  profit?: number;
}

/**
 * Cost reference for one perfume — the full-bottle cost and size used to derive
 * cost-per-ml for order profit. Sourced from the cost PDF + master sheets, stored
 * in the DB, and editable in-app. `key` is `normalizeName(brand + " " + perfume)`.
 */
export interface PerfumeCost {
  key: string;
  brand: string;
  perfume: string;
  bottleCost: number;
  bottleMl: number;
}

export interface InventoryStore {
  brands: Brand[];
  perfumes: Perfume[];
  sales: Sale[];
  orders: Order[];
  auditLog: AuditEntry[];
  /** Per-perfume bottle cost + size, powering order profit. */
  costCatalog: PerfumeCost[];
}
