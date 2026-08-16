import {
  ClipboardCopy,
  RefreshCw,
  Search,
  Settings,
  Tags,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PublishSetupDialog } from "../components/dialogs/PublishSetupDialog";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import {
  buildPriceIndex,
  pricebookToCsv,
  priceKey,
  type PriceUpdate,
} from "../lib/pricebook";
import { normalizeName } from "../lib/normalize";
import { loadPrefs } from "../lib/prefs";
import { publishPrices } from "../lib/publish";
import {
  ORDER_COSTS,
  buildPerfumeIndex,
  decantPerfumeCost,
} from "../lib/profit";
import { cn } from "../lib/utils";
import {
  DECANT_SIZES,
  type Brand,
  type DecantCatalog,
  type DecantCatalogEntry,
  type DecantSize,
  type Perfume,
  type PerfumePrice,
} from "../types";

interface PricingPageProps {
  catalog: DecantCatalog | null;
  /** Inventory — the sole source of bottle cost + size, so of every margin. */
  perfumes: Perfume[];
  brands: Brand[];
  pricebook: PerfumePrice[];
  /** App prices that differ from the live sheet (unpublished). */
  pendingUpdates: PriceUpdate[];
  onSetPrice: (
    brand: string,
    perfume: string,
    size: DecantSize,
    value: number | null,
    perfumeId?: string | null,
  ) => void;
  /** Called after a successful publish so the sheet is re-read. */
  onPublished: () => void;
  syncing: boolean;
  onRefresh: () => void;
}

/** One Pricing row: a sheet entry, or an inventory perfume absent from the
 * sheet (local-only — its prices live in the app's pricebook and are never
 * published). */
interface PricingRow {
  entry: DecantCatalogEntry;
  localOnly: boolean;
  perfumeId: string | null;
}

/** Minimum margin over unit cost before a price is flagged as too thin (30% floor). */
const MIN_MARGIN = 0.3;

// ── One editable price cell ──────────────────────────────────────────────────

interface PriceCellProps {
  price: number | undefined; // effective (override or sheet)
  unitCost: number | null; // decant cost + vial, if known
  overridden: boolean;
  dirty: boolean; // app price differs from the live sheet (unpublished)
  showProfit: boolean; // secondary shows ₹ profit/decant instead of margin %
  onCommit: (value: number | null) => void;
}

function PriceCell({
  price,
  unitCost,
  overridden,
  dirty,
  showProfit,
  onCommit,
}: PriceCellProps) {
  const [val, setVal] = useState(price !== undefined ? String(price) : "");

  useEffect(() => {
    setVal(price !== undefined ? String(price) : "");
  }, [price]);

  const commit = () => {
    const trimmed = val.trim();
    if (trimmed === "") {
      if (overridden) onCommit(null); // clear override → fall back to sheet
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setVal(price !== undefined ? String(price) : "");
      return;
    }
    if (n !== price) onCommit(n);
  };

  // Secondary line: margin % or ₹ profit per decant. Colour is driven by margin
  // health either way (red below the floor, amber thin, green healthy).
  let tone = "text-stone-400";
  let label = "—";
  if (price !== undefined && unitCost !== null && unitCost > 0) {
    const marginPct = (price - unitCost) / unitCost;
    tone =
      marginPct < MIN_MARGIN
        ? "text-red-600"
        : marginPct < 0.6
          ? "text-amber-600"
          : "text-emerald-600";
    label = showProfit
      ? `₹${Math.round(price - unitCost)}`
      : `${Math.round(marginPct * 100)}%`;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative">
        <Input
          type="number"
          min="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="—"
          className={cn(
            "h-8 w-20 px-2 text-sm",
            overridden && "border-amber-400 bg-amber-50/40",
          )}
          aria-label="Price"
        />
        {dirty && (
          <span
            className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-500"
            title="Unpublished — not yet on the customer sheet"
            aria-hidden
          />
        )}
      </div>
      <span
        className={cn("pl-1 text-[10px]", tone)}
        title={
          showProfit
            ? "Profit per decant (price − perfume cost − ₹25 vial)"
            : "Margin over cost (per-ml × ml + ₹25 vial)"
        }
      >
        {label}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function PricingPage({
  catalog,
  perfumes,
  brands,
  pricebook,
  pendingUpdates,
  onSetPrice,
  onPublished,
  syncing,
  onRefresh,
}: PricingPageProps) {
  const [query, setQuery] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showProfit, setShowProfit] = useState(false);

  const perfumeById = useMemo(() => buildPerfumeIndex(perfumes), [perfumes]);
  const priceIndex = useMemo(() => buildPriceIndex(pricebook), [pricebook]);

  // Sheet rows carry no perfume id, so they resolve their cost by name — the
  // same basis the local-only split below uses.
  const perfumeByName = useMemo(() => {
    const brandNameById = new Map(brands.map((b) => [b.brandId, b.name]));
    const byKey = new Map<string, Perfume>();
    const byName = new Map<string, Perfume>();
    for (const p of perfumes) {
      byKey.set(priceKey(brandNameById.get(p.brandId) ?? "", p.name), p);
      const n = normalizeName(p.name);
      if (!byName.has(n)) byName.set(n, p);
    }
    return { byKey, byName };
  }, [perfumes, brands]);

  // Keys (`${priceKey}|${size}`) of the unpublished cells, for the dirty dots.
  const dirtySet = useMemo(
    () =>
      new Set(
        pendingUpdates.map(
          (u) => `${priceKey(u.brand, u.perfume)}|${u.size}`,
        ),
      ),
    [pendingUpdates],
  );

  // Pricebook rows for inventory perfumes not on the sheet, by perfume id.
  const priceByPerfumeId = useMemo(() => {
    const m = new Map<string, PerfumePrice>();
    for (const p of pricebook) {
      if (p.perfumeId != null) m.set(p.perfumeId, p);
    }
    return m;
  }, [pricebook]);

  // Sheet rows + local-only rows (inventory perfumes the sheet doesn't list).
  const allRows = useMemo<PricingRow[]>(() => {
    if (catalog === null) return [];
    const sheetNames = new Set<string>();
    for (const e of catalog.entries) {
      const n = normalizeName(e.perfume);
      if (n !== "") sheetNames.add(n);
      const i = normalizeName(e.inspiration);
      if (i !== "") sheetNames.add(i);
    }
    const brandNameById = new Map(brands.map((b) => [b.brandId, b.name]));
    const sheet: PricingRow[] = catalog.entries.map((e) => ({
      entry: e,
      localOnly: false,
      perfumeId: null,
    }));
    const local: PricingRow[] = perfumes
      .filter((p) => !sheetNames.has(normalizeName(p.name)))
      .map((p) => ({
        localOnly: true,
        perfumeId: p.perfumeId,
        entry: {
          rowIndex: -1,
          brand: brandNameById.get(p.brandId) ?? "",
          perfume: p.name,
          inspiration: "",
          prices: priceByPerfumeId.get(p.perfumeId)?.prices ?? {},
        },
      }));
    return [...sheet, ...local];
  }, [catalog, perfumes, brands, priceByPerfumeId]);

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered =
      q === ""
        ? allRows
        : allRows.filter(
            ({ entry: e }) =>
              e.perfume.toLowerCase().includes(q) ||
              e.brand.toLowerCase().includes(q) ||
              e.inspiration.toLowerCase().includes(q),
          );
    return [...filtered].sort(
      (a, b) =>
        a.entry.brand.localeCompare(b.entry.brand) ||
        a.entry.perfume.localeCompare(b.entry.perfume),
    );
  }, [allRows, query]);

  const localCount = useMemo(
    () => allRows.filter((r) => r.localOnly).length,
    [allRows],
  );

  const overrideCount = pricebook.reduce(
    (n, p) => n + Object.keys(p.prices).length,
    0,
  );

  /** Unit cost of one decant: perfume cost for that volume, plus the ₹25 vial.
   * Null when the perfume isn't in inventory or has no usable cost. */
  const unitCostFor = (row: PricingRow, size: DecantSize): number | null => {
    const perfume =
      row.perfumeId !== null
        ? (perfumeById.get(row.perfumeId) ?? null)
        : (perfumeByName.byKey.get(priceKey(row.entry.brand, row.entry.perfume)) ??
          perfumeByName.byName.get(normalizeName(row.entry.perfume)) ??
          null);
    if (perfume === null) return null;
    const cost = decantPerfumeCost(perfume, size);
    return cost === null ? null : cost + ORDER_COSTS.decantVial;
  };

  const handleCopyCsv = async () => {
    const csv = pricebookToCsv(catalog);
    try {
      await navigator.clipboard.writeText(csv);
      toast.success("Customer price sheet copied — paste it into your Google Sheet.");
    } catch {
      toast.error("Couldn't copy — try again.");
    }
  };

  const handlePublish = async () => {
    if (pendingUpdates.length === 0) return;
    if (loadPrefs().publishScriptUrl.trim() === "") {
      toast.info("Set up publishing first.");
      setSetupOpen(true);
      return;
    }
    setPublishing(true);
    const result = await publishPrices(
      loadPrefs().publishScriptUrl,
      pendingUpdates,
    );
    setPublishing(false);
    if (result.ok) {
      const skipped = result.skipped?.length ?? 0;
      toast.success(
        `Published ${result.written ?? pendingUpdates.length} price(s) to the sheet.` +
          (skipped > 0 ? ` ${skipped} not found on the sheet.` : ""),
      );
      onPublished(); // re-read the sheet so the dirty count clears
    } else {
      toast.error(`Publish failed: ${result.error ?? "unknown error"}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Pricing</h1>
          <p className="mt-1 text-sm text-stone-500">
            Your app-owned selling prices. Edits drive order pricing &amp; profit,
            then <span className="font-medium">Publish</span> writes them to the
            customer sheet. Under each price, toggle between{" "}
            <span className="font-medium">margin vs cost %</span> and{" "}
            <span className="font-medium">profit ₹ per decant</span> (both over
            per-ml × ml + ₹25 vial; exclude ₹70 delivery + ₹10 packaging).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Publish setup"
            onClick={() => setSetupOpen(true)}
          >
            <Settings className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={syncing}>
            <RefreshCw
              className={syncing ? "size-3.5 animate-spin" : "size-3.5"}
              aria-hidden
            />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyCsv}>
            <ClipboardCopy className="size-3.5" aria-hidden />
            Copy CSV
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={publishing || pendingUpdates.length === 0}
          >
            <UploadCloud
              className={publishing ? "size-3.5 animate-pulse" : "size-3.5"}
              aria-hidden
            />
            {publishing
              ? "Publishing…"
              : `Publish to sheet${pendingUpdates.length > 0 ? ` (${pendingUpdates.length})` : ""}`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search by perfume, brand, or inspiration…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div
          className="inline-flex rounded-lg border border-stone-200 p-0.5 text-xs"
          role="group"
          aria-label="Under-price metric"
        >
          <button
            type="button"
            onClick={() => setShowProfit(false)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              !showProfit ? "bg-amber-100 text-amber-800" : "text-stone-500 hover:text-stone-800",
            )}
          >
            Margin %
          </button>
          <button
            type="button"
            onClick={() => setShowProfit(true)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              showProfit ? "bg-amber-100 text-amber-800" : "text-stone-500 hover:text-stone-800",
            )}
          >
            Profit ₹/decant
          </button>
        </div>
      </div>

      {catalog === null ? (
        <div className="rounded-xl border border-dashed border-stone-200 bg-white p-10 text-center text-sm text-stone-400">
          Prices haven't loaded yet — try <span className="font-medium">Refresh sheet</span>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/80">
                <th className="px-4 py-3 text-left font-medium text-stone-500">
                  Perfume
                </th>
                {DECANT_SIZES.map((sz) => (
                  <th
                    key={sz}
                    className="px-3 py-3 text-left font-medium text-stone-500"
                  >
                    {sz}ml
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-400">
                    No perfumes found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const e = row.entry;
                  const key = priceKey(e.brand, e.perfume);
                  const override = row.localOnly
                    ? (row.perfumeId !== null
                        ? priceByPerfumeId.get(row.perfumeId)
                        : undefined)
                    : priceIndex.byKey.get(key);
                  return (
                    <tr
                      key={row.localOnly ? `local-${row.perfumeId}` : `${e.rowIndex}-${key}`}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-4 py-2">
                        <p className="font-medium text-stone-900">
                          {e.perfume}
                          {row.localOnly && (
                            <span
                              className="ml-1.5 rounded-sm bg-stone-100 px-1.5 py-0.5 align-middle text-[10px] font-medium text-stone-500"
                              title="In your inventory but not on the Google Sheet — prices stay in the app and are never published."
                            >
                              Local
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-stone-400">
                          {e.brand !== "" ? e.brand : "—"}
                        </p>
                      </td>
                      {DECANT_SIZES.map((sz) => (
                        <td key={sz} className="px-3 py-2">
                          <PriceCell
                            price={e.prices[sz]}
                            unitCost={unitCostFor(row, sz)}
                            overridden={override?.prices[sz] !== undefined}
                            dirty={!row.localOnly && dirtySet.has(`${key}|${sz}`)}
                            showProfit={showProfit}
                            onCommit={(value) =>
                              onSetPrice(e.brand, e.perfume, sz, value, row.perfumeId)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
        <Tags className="size-3.5" aria-hidden />
        {rows.length} of {allRows.length} perfumes
        {localCount > 0 ? ` (${localCount} inventory-only, "Local")` : ""} ·{" "}
        {overrideCount} app-owned price{overrideCount !== 1 ? "s" : ""} (amber) ·{" "}
        {pendingUpdates.length} unpublished (dot) · under each price:{" "}
        {showProfit ? "profit ₹ per decant" : "margin vs cost %"} (toggle above) ·
        below the {Math.round(MIN_MARGIN * 100)}% floor shown in red
      </p>

      <PublishSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onSaved={() => {
          /* prefs re-read lazily on next publish; nothing else needed */
        }}
      />
    </div>
  );
}
