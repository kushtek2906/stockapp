import type { Brand, Perfume } from "../types";

/**
 * Perfume codes are DERIVED, never stored independently: `BRANDCODE-INITIALS`,
 * built from the brand code and the perfume name. Rename either and the code
 * follows, so it can't drift out of step with what it describes.
 *
 *   Afnan · 9PM Rebel                  → AFN-9R
 *   Afnan · Supremacy Not Only Intense → AFN-SNOI
 *   Lattafa · Khamrah                  → LAT-KHA   (single word: 3 letters)
 *
 * Two perfumes in one brand can reduce to the same initials ("Hawas Viper" and
 * "Hawas Verde" are both HV). Rather than tack on a meaningless digit, the word
 * that actually differs is lengthened until the codes separate — HVI and HVE —
 * so every code stays readable back to the name it came from.
 */

/** Letters/digits only, accents folded, split into words. */
function tokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Minimum letters taken from a single-word name — one letter collides far too
 * often across a brand's line-up. */
const SINGLE_WORD_LETTERS = 3;

/**
 * Initials for a name. `depths[i]` overrides how many letters word `i`
 * contributes (default 1), which is how ties get broken.
 */
export function perfumeInitials(name: string, depths: number[] = []): string {
  const words = tokens(name);
  if (words.length === 0) return "X";
  if (words.length === 1) {
    const take = Math.max(SINGLE_WORD_LETTERS, depths[0] ?? 0);
    return words[0].slice(0, take).toUpperCase();
  }
  return words
    .map((w, i) => w.slice(0, depths[i] ?? 1))
    .join("")
    .toUpperCase();
}

/** How far a single word may be lengthened before we give up and use a digit. */
const MAX_DEPTH = 6;

/**
 * Codes for names that share the same initials. Walks left to right looking for
 * the word position that separates them, lengthening every member at that
 * position together (so neither one "wins" the short code). Falls back to a
 * numeric suffix only for genuinely identical names — i.e. real duplicates.
 */
function separate(names: string[]): string[] {
  const depths: number[][] = names.map(() => []);
  const codes = () => names.map((n, i) => perfumeInitials(n, depths[i]));

  let current = codes();
  if (new Set(current).size === current.length) return current;

  const wordCount = Math.max(...names.map((n) => tokens(n).length));
  for (let idx = 0; idx < wordCount; idx++) {
    for (let depth = 2; depth <= MAX_DEPTH; depth++) {
      for (const d of depths) d[idx] = depth;
      current = codes();
      if (new Set(current).size === current.length) return current;
    }
    // This position can't separate them — reset it and try the next word.
    for (const d of depths) d[idx] = 1;
  }

  // Identical names: nothing left to lengthen.
  const seen = new Map<string, number>();
  return codes().map((c) => {
    const n = (seen.get(c) ?? 0) + 1;
    seen.set(c, n);
    return n === 1 ? c : `${c}${n}`;
  });
}

/** Guarantee uniqueness within a brand after separation, as a final backstop. */
function dedupe(codes: string[]): string[] {
  const seen = new Map<string, number>();
  return codes.map((c) => {
    const n = (seen.get(c) ?? 0) + 1;
    seen.set(c, n);
    return n === 1 ? c : `${c}${n}`;
  });
}

/**
 * Recompute every perfume's code from its brand and name. Returns the same
 * array reference when nothing changed, so it's cheap to call on every load and
 * after any mutation that touches perfumes or brands.
 */
export function withPerfumeCodes(
  perfumes: Perfume[],
  brands: Brand[],
): Perfume[] {
  const brandCodeById = new Map(brands.map((b) => [b.brandId, b.brandCode]));

  const byBrand = new Map<string, Perfume[]>();
  for (const p of perfumes) {
    const list = byBrand.get(p.brandId);
    if (list !== undefined) list.push(p);
    else byBrand.set(p.brandId, [p]);
  }

  const codeById = new Map<string, string>();
  for (const [brandId, members] of byBrand) {
    const brandCode = brandCodeById.get(brandId) ?? "UNK";

    // Group by base initials, separate each clashing group, then dedupe across
    // the whole brand in case a lengthened code landed on someone else's.
    const groups = new Map<string, Perfume[]>();
    for (const p of members) {
      const base = perfumeInitials(p.name);
      const g = groups.get(base);
      if (g !== undefined) g.push(p);
      else groups.set(base, [p]);
    }

    const flat: Array<{ id: string; code: string }> = [];
    for (const group of groups.values()) {
      const resolved = separate(group.map((p) => p.name));
      group.forEach((p, i) => flat.push({ id: p.perfumeId, code: resolved[i] }));
    }

    const unique = dedupe(flat.map((f) => f.code));
    flat.forEach((f, i) => codeById.set(f.id, `${brandCode}-${unique[i]}`));
  }

  let changed = false;
  const next = perfumes.map((p) => {
    const code = codeById.get(p.perfumeId);
    if (code === undefined || code === p.perfumeCode) return p;
    changed = true;
    return { ...p, perfumeCode: code };
  });
  return changed ? next : perfumes;
}
