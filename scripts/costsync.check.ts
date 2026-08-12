/* Temporary sanity check for the cost-sync logic. Run: npx tsx scripts/costsync.check.ts */
import { reconcileCostLinks, syncCostForPerfume } from "../src/lib/costSync";
import { normalizeStore, mergeStores } from "../src/lib/storage";
import type { InventoryStore } from "../src/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`ok    ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

const base: InventoryStore = {
  brands: [{ brandId: "b1", brandCode: "AFN", name: "Afnan" }],
  perfumes: [
    {
      perfumeId: "p1",
      perfumeCode: "AFN-001",
      brandId: "b1",
      name: "9PM Rebel",
      totalMl: 100,
      stockMl: 80,
      costPrice: 999, // stale — catalog says 1400
      purchaseDate: "2026-01-01",
    },
    {
      perfumeId: "p2",
      perfumeCode: "AFN-002",
      brandId: "b1",
      name: "Turathi Blue",
      totalMl: 0, // sheet import — no purchase volume
      stockMl: 0,
      costPrice: 1200,
      purchaseDate: "2026-01-01",
    },
  ],
  sales: [],
  orders: [],
  auditLog: [],
  costCatalog: [
    { key: "afnan 9pm rebel", brand: "Afnan", perfume: "9PM Rebel", bottleCost: 1400, bottleMl: 100 },
    { key: "lattafa asad", brand: "Lattafa", perfume: "Asad", bottleCost: 1100, bottleMl: 100 },
  ],
  pricebook: [],
};

// ── reconcile: link, adopt catalog cost, create missing, keep untracked ──────
const r1 = reconcileCostLinks(base);
const linked = r1.costCatalog.find((c) => c.perfumeId === "p1");
check("existing row linked to p1 by exact key", linked !== undefined);
check("p1 adopted catalog cost (1400)", r1.perfumes[0].costPrice === 1400, r1.perfumes[0].costPrice);
const created = r1.costCatalog.find((c) => c.perfumeId === "p2");
check("p2 got a created linked row", created !== undefined);
check("created row bottleCost = costPrice", created?.bottleCost === 1200, created);
check("created row bottleMl defaults to 100 (totalMl 0)", created?.bottleMl === 100, created);
const untracked = r1.costCatalog.find((c) => c.key === "lattafa asad");
check("unrelated untracked row kept", untracked !== undefined && untracked.perfumeId == null);
check("no duplicate rows", r1.costCatalog.length === 3, r1.costCatalog.length);

// idempotence: second run returns the exact same reference
const r2 = reconcileCostLinks(r1);
check("reconcile is idempotent (same reference)", r2 === r1);

// ── sync perfume→catalog ─────────────────────────────────────────────────────
const edited: InventoryStore = {
  ...r1,
  perfumes: r1.perfumes.map((p) => (p.perfumeId === "p1" ? { ...p, costPrice: 1500 } : p)),
};
const s1 = syncCostForPerfume(edited, "p1", "perfume");
check(
  "perfume edit pushes bottleCost 1500",
  s1.costCatalog.find((c) => c.perfumeId === "p1")?.bottleCost === 1500,
);
check("sync is stable (no-op returns same ref)", syncCostForPerfume(s1, "p1", "perfume") === s1);

// ── sync catalog→perfume ─────────────────────────────────────────────────────
const s2 = syncCostForPerfume(s1, "p1", "catalog", { bottleCost: 1600 });
check("catalog authority updates costPrice to 1600", s2.perfumes.find((p) => p.perfumeId === "p1")?.costPrice === 1600);
check("catalog authority updates bottleCost to 1600", s2.costCatalog.find((c) => c.perfumeId === "p1")?.bottleCost === 1600);

// ── brand rename keeps links, rewrites keys ──────────────────────────────────
const renamed: InventoryStore = {
  ...s2,
  brands: [{ brandId: "b1", brandCode: "AFN", name: "Afnan Perfumes" }],
};
const r3 = reconcileCostLinks(renamed);
const renamedRow = r3.costCatalog.find((c) => c.perfumeId === "p1");
check("brand rename rewrites key", renamedRow?.key === "afnan perfumes 9pm rebel", renamedRow?.key);
check("brand rename rewrites row brand", renamedRow?.brand === "Afnan Perfumes");
check("p1 costPrice untouched by rename", r3.perfumes.find((p) => p.perfumeId === "p1")?.costPrice === 1600);

// ── deleted perfume: dangling link nulled, row kept ──────────────────────────
const deleted: InventoryStore = { ...r3, perfumes: r3.perfumes.filter((p) => p.perfumeId !== "p2") };
const r4 = reconcileCostLinks(deleted);
const orphan = r4.costCatalog.find((c) => c.perfume === "Turathi Blue");
check("deleted perfume's row kept as untracked", orphan !== undefined && orphan.perfumeId == null, orphan);

// ── merge: id-linked rows merge by id; reconcile dedupes key/id pairs ────────
const deviceA = r3;
const deviceB: InventoryStore = {
  ...r3,
  costCatalog: r3.costCatalog.map((c) =>
    c.perfumeId === "p1" ? { ...c, bottleCost: 1700 } : c,
  ),
};
const merged = normalizeStore(mergeStores(deviceA, deviceB));
const mergedRows = merged.costCatalog.filter((c) => c.perfumeId === "p1");
check("merge keeps one row per perfume", mergedRows.length === 1, mergedRows.length);
check("merge: incoming wins (1700)", mergedRows[0]?.bottleCost === 1700);
check("merge heals perfume costPrice to 1700 (catalog wins)", merged.perfumes.find((p) => p.perfumeId === "p1")?.costPrice === 1700);

// ── normalizeStore end-to-end (raw doc without perfumeIds) ───────────────────
const rawNormalized = normalizeStore({
  brands: base.brands,
  perfumes: base.perfumes,
  sales: [],
  orders: [],
  auditLog: [],
  costCatalog: base.costCatalog,
  pricebook: [{ key: "afnan 9pm rebel", brand: "Afnan", perfume: "9PM Rebel", prices: { 5: 250 } }],
});
check(
  "normalizeStore links + creates rows",
  rawNormalized.costCatalog.filter((c) => c.perfumeId != null).length === 2,
);
check(
  "key-only pricebook rows untouched",
  rawNormalized.pricebook.length === 1 && rawNormalized.pricebook[0].perfumeId === undefined,
);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
