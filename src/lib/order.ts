import type {
  DecantCatalog,
  DecantCatalogEntry,
  DecantSize,
  Order,
  Perfume,
} from "../types";
import {
  HIGH_CONFIDENCE,
  LOW_CONFIDENCE,
  matchLine,
  similarity,
  type MatchCandidate,
} from "./match";
import { normalizeName, stripSizeToken } from "./normalize";

export type MatchStatus =
  | "confident" // strong name match + a price for the size
  | "needs_confirm" // a plausible match the user should verify
  | "no_match" // nothing close in the catalog
  | "no_size" // matched, but no/invalid size given
  | "no_price" // matched + size, but that size isn't offered
  | "custom"; // user set a custom ml + price by hand

export interface ParsedOrderLine {
  raw: string;
  index: number; // 1-based position in the pasted order
  nameQuery: string;
  size: DecantSize | null;
}

export interface MatchedOrderItem {
  line: ParsedOrderLine;
  status: MatchStatus;
  chosen: DecantCatalogEntry | null;
  candidates: MatchCandidate[];
  size: DecantSize | null;
  /** When true, this line ignores standard decant sizes: `customMl` holds the
   * hand-entered volume and `unitPrice` the manually-entered price. */
  custom: boolean;
  customMl: number | null;
  unitPrice: number | null;
  linkedPerfumeId: string | null;
  inTrackedInventory: boolean;
}

/** The effective volume (ml) for a line — custom if in custom mode, else the standard size. */
export function effectiveMl(item: MatchedOrderItem): number | null {
  return item.custom ? item.customMl : item.size;
}

/** Discount amount (rounded) for a subtotal and a discount percentage. */
export function discountAmount(subtotal: number, discountPct: number): number {
  return Math.round((subtotal * discountPct) / 100);
}

/**
 * Final amount charged to the customer: subtotal − discount + delivery. A legacy
 * `amountOverride` (old orders) still wins if present.
 */
export function computeChargedTotal(
  subtotal: number,
  discountPct: number,
  deliveryCharge: number,
  amountOverride: number | null = null,
): number {
  if (amountOverride !== null) return amountOverride;
  return subtotal - discountAmount(subtotal, discountPct) + deliveryCharge;
}

/** Charged total for a saved order (reads its discount / delivery / legacy override). */
export function orderChargedTotal(order: Order): number {
  return computeChargedTotal(
    order.total,
    order.discountPct ?? 0,
    order.deliveryCharge ?? 0,
    order.amountOverride ?? null,
  );
}

/** Split pasted text into order lines, stripping list numbering and pulling the size. */
export function parseOrder(text: string): ParsedOrderLine[] {
  const result: ParsedOrderLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed === "") continue;
    // strip leading "1.", "1)", "-", "*", "•" numbering/bullets
    const body = trimmed.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "");
    const { name, size } = stripSizeToken(body);
    if (name.trim() === "") continue;
    result.push({
      raw: trimmed,
      index: result.length + 1,
      nameQuery: name,
      size,
    });
  }
  return result;
}

/** Link a catalog entry to an existing app Perfume (by name) for stock decrement. */
function linkToInventory(
  entry: DecantCatalogEntry | null,
  perfumes: Perfume[],
): string | null {
  if (entry === null) return null;
  const targets = [entry.perfume, entry.inspiration].filter(
    (t) => t.trim() !== "",
  );
  if (targets.length === 0) return null;

  // 1) exact normalized name match
  for (const t of targets) {
    const nt = normalizeName(t);
    const hit = perfumes.find((p) => normalizeName(p.name) === nt);
    if (hit !== undefined) return hit.perfumeId;
  }
  // 2) high-confidence fuzzy fallback (handles minor spelling/casing drift)
  let best: { id: string; score: number } | null = null;
  for (const p of perfumes) {
    const pn = normalizeName(p.name);
    for (const t of targets) {
      const score = similarity(pn, normalizeName(t));
      if (best === null || score > best.score) {
        best = { id: p.perfumeId, score };
      }
    }
  }
  return best !== null && best.score >= HIGH_CONFIDENCE ? best.id : null;
}

function buildItem(
  line: ParsedOrderLine,
  candidates: MatchCandidate[],
  chosen: DecantCatalogEntry | null,
  size: DecantSize | null,
  perfumes: Perfume[],
  userConfirmed: boolean,
): MatchedOrderItem {
  let status: MatchStatus;
  let unitPrice: number | null = null;

  if (chosen === null) {
    status = "no_match";
  } else if (size === null) {
    status = "no_size";
  } else {
    const price = chosen.prices[size];
    if (price === undefined) {
      status = "no_price";
    } else {
      unitPrice = price;
      const topScore = candidates[0]?.score ?? 0;
      status = userConfirmed || topScore >= HIGH_CONFIDENCE ? "confident" : "needs_confirm";
    }
  }

  const linkedPerfumeId = linkToInventory(chosen, perfumes);
  return {
    line,
    status,
    chosen,
    candidates,
    size,
    custom: false,
    customMl: null,
    unitPrice,
    linkedPerfumeId,
    inTrackedInventory: linkedPerfumeId !== null,
  };
}

/** Match every parsed line against the catalog and link to inventory. */
export function matchOrder(
  lines: ParsedOrderLine[],
  catalog: DecantCatalog,
  perfumes: Perfume[],
): MatchedOrderItem[] {
  return lines.map((line) => {
    const candidates = matchLine(line.nameQuery, catalog);
    const top = candidates[0];
    const chosen = top !== undefined && top.score >= LOW_CONFIDENCE ? top.entry : null;
    return buildItem(line, candidates, chosen, line.size, perfumes, false);
  });
}

/**
 * Set an item's size (e.g. from the "set all sizes" action) without changing the
 * matched perfume. Confidence is preserved: an already-confirmed item stays
 * confident, while an uncertain name match stays flagged for review. Items with
 * no matched perfume are left untouched.
 */
export function setItemSize(
  item: MatchedOrderItem,
  size: DecantSize,
  perfumes: Perfume[],
): MatchedOrderItem {
  if (item.chosen === null) return item;
  const userConfirmed = item.status === "confident";
  return buildItem(
    item.line,
    item.candidates,
    item.chosen,
    size,
    perfumes,
    userConfirmed,
  );
}

/**
 * Clear a wrong match so the user can re-pick from the full catalog. The order
 * line and its parsed size are kept; only the matched perfume/price are reset.
 */
export function clearItemMatch(item: MatchedOrderItem): MatchedOrderItem {
  return {
    ...item,
    status: "no_match",
    chosen: null,
    custom: false,
    customMl: null,
    unitPrice: null,
    linkedPerfumeId: null,
    inTrackedInventory: false,
  };
}

/**
 * Put a line into custom mode with a hand-entered volume + price (for
 * unconventional orders). Clears the standard size; keeps the matched perfume so
 * profit still resolves. `ml`/`price` may be null while the user is typing.
 */
export function setCustomItem(
  item: MatchedOrderItem,
  ml: number | null,
  price: number | null,
): MatchedOrderItem {
  const hasMl = ml !== null && Number.isFinite(ml) && ml > 0;
  return {
    ...item,
    size: null,
    custom: true,
    customMl: ml,
    unitPrice: price !== null && Number.isFinite(price) ? price : null,
    status: hasMl ? "custom" : "no_size",
  };
}

/** Re-resolve an item after the user picks a different perfume and/or size. */
export function recomputeItem(
  item: MatchedOrderItem,
  chosen: DecantCatalogEntry,
  size: DecantSize | null,
  perfumes: Perfume[],
): MatchedOrderItem {
  const effSize = size ?? item.size;
  return buildItem(item.line, item.candidates, chosen, effSize, perfumes, true);
}

/** Display name for the bill — the sheet's perfume name (or inspiration fallback). */
export function displayName(item: MatchedOrderItem): string {
  if (item.chosen !== null) {
    return item.chosen.perfume !== "" ? item.chosen.perfume : item.chosen.inspiration;
  }
  return item.line.nameQuery;
}

/**
 * Render the bill exactly in the owner's format, with the decant size:
 *   1. Summer Oud (10ml)- 550
 *   --------
 *   TOTAL - 1090/-
 * When `showBrand` is true, the matched perfume's brand is prefixed in square
 * brackets (e.g. "[French Avenue] Aromatix Frostbite (5ml)- 260").
 * Items without a resolved price are listed as `- ?` and excluded from the total.
 */
export function formatBill(
  items: MatchedOrderItem[],
  showBrand = false,
  discountPct = 0,
  deliveryCharge = 0,
  amountOverride: number | null = null,
): string {
  const lines: string[] = [];
  let subtotal = 0;
  items.forEach((item, i) => {
    const base = displayName(item);
    const brand = item.chosen?.brand.trim() ?? "";
    const name = showBrand && brand !== "" ? `[${brand}] ${base}` : base;
    const effMl = effectiveMl(item);
    const label = effMl !== null ? `${name} (${effMl}ml)` : name;
    const sep = effMl !== null ? "- " : " - ";
    if (item.unitPrice !== null) {
      subtotal += item.unitPrice;
      lines.push(`${i + 1}. ${label}${sep}${item.unitPrice}`);
    } else {
      lines.push(`${i + 1}. ${label}${sep}?`);
    }
  });
  lines.push("--------");
  // A manual total override supersedes discount/delivery — show just the total.
  // Otherwise show the discount/delivery breakdown when either is present.
  if (amountOverride === null && (discountPct > 0 || deliveryCharge > 0)) {
    lines.push(`Subtotal - ${subtotal}`);
    if (discountPct > 0) {
      lines.push(`Discount (${discountPct}%) - -${discountAmount(subtotal, discountPct)}`);
    }
    if (deliveryCharge > 0) {
      lines.push(`Delivery - ${deliveryCharge}`);
    }
  }
  const finalTotal = computeChargedTotal(
    subtotal,
    discountPct,
    deliveryCharge,
    amountOverride,
  );
  lines.push(`TOTAL - ${finalTotal}/-`);
  return lines.join("\n");
}
