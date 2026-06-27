import { z } from "zod";
import {
  DECANT_SIZES,
  type DecantCatalog,
  type DecantCatalogEntry,
  type DecantSize,
} from "../types";

const CATALOG_KEY = "decantverse_catalog_v1";

/**
 * The gviz CSV endpoint serves live sheet data directly from docs.google.com
 * with CORS-permissive headers and NO redirect, so a browser fetch() works
 * without a backend. (export?format=csv 307-redirects to googleusercontent.com
 * which drops CORS headers — do not use it from the client.)
 *
 * This module is the single I/O seam for the sheet; a future Apps Script
 * write-back (cross out perfumes below 5 ml) would be added here.
 */
export function buildGvizUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes (""),
 * and commas / newlines embedded inside quotes. Returns rows of raw cells.
 */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  // Drop a trailing all-empty row produced by a final newline.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parsePrice(cell: string | undefined): number | undefined {
  if (cell === undefined) return undefined;
  const cleaned = cell.replace(/[^0-9.]/g, "");
  if (cleaned === "") return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Fetch the decant tab and build a catalog. Throws on network/parse failure. */
export async function fetchCatalog(
  sheetId: string,
  gid: string,
): Promise<DecantCatalog> {
  const res = await fetch(buildGvizUrl(sheetId, gid));
  if (!res.ok) {
    throw new Error(`Sheet request failed (HTTP ${res.status}).`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error("Sheet has no data rows.");
  }

  // Header cells in this sheet have trailing spaces — trim before matching.
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string): number => header.indexOf(name);

  const perfumeIdx = colIndex("perfume");
  if (perfumeIdx === -1) {
    throw new Error('Could not find a "Perfume" column in the sheet.');
  }
  const brandIdx = colIndex("brand");
  const inspirationIdx = colIndex("inspiration");

  const sizeColumns: Partial<Record<DecantSize, number>> = {};
  for (const sz of DECANT_SIZES) {
    const idx = colIndex(`${sz}ml`);
    if (idx !== -1) sizeColumns[sz] = idx;
  }

  const entries: DecantCatalogEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const perfume = (cells[perfumeIdx] ?? "").trim();
    if (perfume === "") continue; // skip note / spacer rows

    const prices: Partial<Record<DecantSize, number>> = {};
    for (const sz of DECANT_SIZES) {
      const idx = sizeColumns[sz];
      if (idx === undefined) continue;
      const price = parsePrice(cells[idx]);
      if (price !== undefined) prices[sz] = price;
    }

    entries.push({
      brand: brandIdx === -1 ? "" : (cells[brandIdx] ?? "").trim(),
      perfume,
      inspiration: inspirationIdx === -1 ? "" : (cells[inspirationIdx] ?? "").trim(),
      prices,
      rowIndex: r,
    });
  }

  return {
    entries,
    lastSynced: new Date().toISOString(),
    sheetId,
    gid,
  };
}

export interface CostRow {
  brand: string;
  perfume: string;
  cost: number | null;
}

/**
 * Fetch the price-revision tab and return one row per perfume with its bottle
 * "cost price". Used to seed costPrice when importing the catalog into inventory.
 */
export async function fetchCostRows(
  sheetId: string,
  gid: string,
): Promise<CostRow[]> {
  const res = await fetch(buildGvizUrl(sheetId, gid));
  if (!res.ok) {
    throw new Error(`Cost sheet request failed (HTTP ${res.status}).`);
  }
  const rows = parseCsv(await res.text());
  if (rows.length < 2) {
    throw new Error("Cost sheet has no data rows.");
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const perfumeIdx = header.indexOf("perfume");
  const brandIdx = header.indexOf("brand");
  const costIdx = header.indexOf("cost price");
  if (perfumeIdx === -1 || costIdx === -1) {
    throw new Error('Cost sheet needs "Perfume" and "cost price" columns.');
  }

  const result: CostRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const perfume = (cells[perfumeIdx] ?? "").trim();
    if (perfume === "") continue;
    result.push({
      brand: brandIdx === -1 ? "" : (cells[brandIdx] ?? "").trim(),
      perfume,
      cost: parsePrice(cells[costIdx]) ?? null,
    });
  }
  return result;
}

/**
 * Fetch a competitor's price sheet. Their headers are often messy (banner text,
 * "Fragrance Name", "Clone Of"), so columns are found by keyword with positional
 * fallback (col 0 = brand, 1 = name, 2 = inspiration). Size columns (3/5/10/30 ml)
 * are matched by their clean header token; other sizes (8/20 ml, BNIB) are ignored
 * since they don't overlap with our catalog.
 */
export async function fetchCompetitorCatalog(
  sheetId: string,
  gid: string,
): Promise<DecantCatalog> {
  const res = await fetch(buildGvizUrl(sheetId, gid));
  if (!res.ok) {
    throw new Error(`Competitor sheet request failed (HTTP ${res.status}).`);
  }
  const rows = parseCsv(await res.text());
  if (rows.length < 2) {
    throw new Error("Competitor sheet has no data rows.");
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());

  let brandIdx = header.findIndex((h) => h.includes("brand"));
  let nameIdx = header.findIndex(
    (h, i) =>
      i !== brandIdx &&
      (h.includes("fragrance") || h.includes("perfume") || h.includes("name")),
  );
  let inspIdx = header.findIndex(
    (h, i) =>
      i !== brandIdx &&
      i !== nameIdx &&
      (h.includes("clone") || h.includes("inspiration")),
  );
  if (brandIdx === -1) brandIdx = 0;
  if (nameIdx === -1) nameIdx = 1;
  if (inspIdx === -1) inspIdx = 2;

  const sizeColumns: Partial<Record<DecantSize, number>> = {};
  for (const sz of DECANT_SIZES) {
    const idx = header.findIndex((h) => h === `${sz}ml`);
    if (idx !== -1) sizeColumns[sz] = idx;
  }

  const entries: DecantCatalogEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const perfume = (cells[nameIdx] ?? "").trim();
    if (perfume === "") continue;
    if (/^[.\-_=~ ]+$/.test(perfume)) continue; // skip separator rows

    const prices: Partial<Record<DecantSize, number>> = {};
    for (const sz of DECANT_SIZES) {
      const idx = sizeColumns[sz];
      if (idx === undefined) continue;
      const price = parsePrice(cells[idx]);
      if (price !== undefined) prices[sz] = price;
    }

    entries.push({
      brand: (cells[brandIdx] ?? "").trim(),
      perfume,
      inspiration: (cells[inspIdx] ?? "").trim(),
      prices,
      rowIndex: r,
    });
  }

  return { entries, lastSynced: new Date().toISOString(), sheetId, gid };
}

const catalogSchema = z.object({
  entries: z.array(
    z.object({
      brand: z.string(),
      perfume: z.string(),
      inspiration: z.string(),
      prices: z.record(z.string(), z.number()),
      rowIndex: z.number(),
    }),
  ),
  lastSynced: z.string(),
  sheetId: z.string(),
  gid: z.string(),
});

/** Load the last cached catalog (offline-first). Returns null if absent/corrupt. */
export function loadCachedCatalog(): DecantCatalog | null {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (raw === null) return null;
    const parsed = catalogSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data as unknown as DecantCatalog;
  } catch {
    return null;
  }
}

export function saveCatalog(catalog: DecantCatalog): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // ignore quota / serialization errors — the in-memory copy still works
  }
}
