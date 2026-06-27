import { DECANT_SIZES, type DecantSize } from "../types";

/**
 * Normalize a name for fuzzy comparison: strip accents, lowercase, replace
 * punctuation with spaces, and collapse whitespace. Used by BOTH the order
 * matcher and the inventory linker so they compare on the same basis.
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

// Matches a size token like "5ml", "5 ml", "5ML", "5.0 ml".
const SIZE_RE = /\b(\d+(?:\.\d+)?)\s*ml\b/i;

/**
 * Pull a decant size out of an order line and return the remaining name.
 * Only the standard sizes (3/5/10/30) resolve to a DecantSize; anything else
 * yields `size: null` so the UI can prompt for a valid size.
 */
export function stripSizeToken(s: string): { name: string; size: DecantSize | null } {
  const m = s.match(SIZE_RE);
  let size: DecantSize | null = null;
  if (m !== null) {
    const num = Number.parseFloat(m[1]);
    size = (DECANT_SIZES as number[]).includes(num) ? (num as DecantSize) : null;
  }
  const name = s.replace(SIZE_RE, " ").replace(/\s+/g, " ").trim();
  return { name, size };
}
