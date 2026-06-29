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
  totalMl: number;
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
  amountOverride?: number | null; // overrides the line-item sum when set
}

export interface InventoryStore {
  brands: Brand[];
  perfumes: Perfume[];
  sales: Sale[];
  orders: Order[];
  auditLog: AuditEntry[];
}
