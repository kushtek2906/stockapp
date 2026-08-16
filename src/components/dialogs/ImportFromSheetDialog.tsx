import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, CheckCircle2, Download, X } from "lucide-react";
import { useState } from "react";
import type {
  CatalogImportItem,
  CatalogImportResult,
} from "../../hooks/useInventory";
import { normalizeName } from "../../lib/normalize";
import { fetchCostRows } from "../../lib/sheet";
import type { DecantCatalog } from "../../types";
import { Button } from "../ui/Button";

interface ImportFromSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: DecantCatalog | null;
  costSheetId: string;
  costSheetGid: string;
  onImportCatalog: (items: CatalogImportItem[]) => CatalogImportResult;
}

export function ImportFromSheetDialog({
  open,
  onOpenChange,
  catalog,
  costSheetId,
  costSheetGid,
  onImportCatalog,
}: ImportFromSheetDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogImportResult | null>(null);

  const reset = () => {
    setBusy(false);
    setError(null);
    setResult(null);
  };

  const handleImport = async () => {
    if (catalog === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const costRows = await fetchCostRows(costSheetId, costSheetGid);
      // Look up cost by brand+perfume first, then fall back to perfume name.
      const byBrandName = new Map<string, number | null>();
      const byName = new Map<string, number | null>();
      for (const row of costRows) {
        byBrandName.set(`${normalizeName(row.brand)}|${normalizeName(row.perfume)}`, row.cost);
        byName.set(normalizeName(row.perfume), row.cost);
      }
      const items: CatalogImportItem[] = catalog.entries.map((e) => {
        const cost =
          byBrandName.get(`${normalizeName(e.brand)}|${normalizeName(e.perfume)}`) ??
          byName.get(normalizeName(e.perfume)) ??
          null;
        return { brand: e.brand, name: e.perfume, bottleCost: cost };
      });
      setResult(onImportCatalog(items));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const catalogCount = catalog?.entries.length ?? 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Import Perfumes from Sheet
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Adds every perfume from the price sheet into your inventory,
                with cost prices pulled from the price-revision tab.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-600">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  <span className="font-medium text-stone-800">
                    {catalogCount}
                  </span>{" "}
                  perfumes found in the price sheet.
                </li>
                <li>
                  Perfumes already in your inventory are skipped (matched by
                  name) — but a changed cost in the revision tab still updates
                  them.
                </li>
                <li>
                  Every imported perfume also appears on the Costs tab (bottle
                  size defaults to{" "}
                  <span className="font-medium text-stone-800">100 ml</span>).
                </li>
                <li>
                  Stock quantity is set to{" "}
                  <span className="font-medium text-stone-800">0 ml</span> — set
                  each perfume’s quantity afterwards from the inventory table.
                </li>
              </ul>
            </div>

            {error !== null && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {result !== null && (
              <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                  <span className="font-medium text-emerald-800">
                    Imported {result.perfumesAdded} perfume
                    {result.perfumesAdded !== 1 ? "s" : ""} and{" "}
                    {result.brandsAdded} brand
                    {result.brandsAdded !== 1 ? "s" : ""}.
                  </span>
                </div>
                {result.skipped > 0 && (
                  <p className="text-xs text-emerald-700">
                    {result.skipped} already in inventory (skipped).
                  </p>
                )}
                {result.costsUpdated > 0 && (
                  <p className="text-xs text-emerald-700">
                    {result.costsUpdated} existing perfume cost
                    {result.costsUpdated !== 1 ? "s" : ""} refreshed from the
                    revision tab.
                  </p>
                )}
                {result.missingCost > 0 && (
                  <p className="text-xs text-amber-700">
                    {result.missingCost} had no cost price in the revision tab —
                    imported with ₹0; edit them later.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                {result !== null ? "Done" : "Cancel"}
              </Button>
            </Dialog.Close>
            {result === null && (
              <Button
                type="button"
                onClick={handleImport}
                disabled={busy || catalog === null}
              >
                <Download className="size-4" aria-hidden />
                {busy
                  ? "Importing…"
                  : catalog === null
                    ? "Prices not loaded"
                    : `Import ${catalogCount} Perfumes`}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
