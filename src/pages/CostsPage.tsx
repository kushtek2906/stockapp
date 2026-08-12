import { Check, Coins, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { costPerMl } from "../lib/profit";
import { formatCurrency } from "../lib/utils";
import type { Perfume, PerfumeCost } from "../types";

interface CostsPageProps {
  costCatalog: PerfumeCost[];
  /** Inventory, to show which rows are linked (and lock their brand/delete). */
  perfumes: Perfume[];
  onUpsert: (
    originalKey: string | null,
    input: { brand: string; perfume: string; bottleCost: number; bottleMl: number },
  ) => void;
  onDelete: (key: string) => void;
}

/** Validate + hand off; returns false (and toasts) if the row is invalid. */
function commit(
  onUpsert: CostsPageProps["onUpsert"],
  originalKey: string | null,
  brand: string,
  perfume: string,
  costStr: string,
  mlStr: string,
): boolean {
  const cost = Number(costStr);
  const ml = Number(mlStr);
  if (perfume.trim() === "") {
    toast.error("Enter a perfume name.");
    return false;
  }
  if (!Number.isFinite(cost) || cost < 0) {
    toast.error("Bottle cost must be 0 or more.");
    return false;
  }
  if (!Number.isFinite(ml) || ml <= 0) {
    toast.error("Bottle size must be greater than 0.");
    return false;
  }
  onUpsert(originalKey, { brand, perfume, bottleCost: cost, bottleMl: ml });
  return true;
}

export function CostsPage({
  costCatalog,
  perfumes,
  onUpsert,
  onDelete,
}: CostsPageProps) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  // Shared field state — used by the Add form OR the inline-edit row (one at a time).
  const [brand, setBrand] = useState("");
  const [perfume, setPerfume] = useState("");
  const [costStr, setCostStr] = useState("");
  const [mlStr, setMlStr] = useState("");

  const reset = () => {
    setBrand("");
    setPerfume("");
    setCostStr("");
    setMlStr("");
  };

  const openAdd = () => {
    setEditingKey(null);
    setAdding(true);
    reset();
  };

  const startEdit = (c: PerfumeCost) => {
    setAdding(false);
    setConfirmDeleteKey(null);
    setEditingKey(c.key);
    setBrand(c.brand);
    setPerfume(c.perfume);
    setCostStr(String(c.bottleCost));
    setMlStr(String(c.bottleMl));
  };

  const cancel = () => {
    setAdding(false);
    setEditingKey(null);
    reset();
  };

  const saveAdd = () => {
    if (commit(onUpsert, null, brand, perfume, costStr, mlStr)) cancel();
  };
  const saveEdit = () => {
    if (commit(onUpsert, editingKey, brand, perfume, costStr, mlStr)) cancel();
  };

  const perfumeById = useMemo(
    () => new Map(perfumes.map((p) => [p.perfumeId, p])),
    [perfumes],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list =
      q === ""
        ? costCatalog
        : costCatalog.filter(
            (c) =>
              c.perfume.toLowerCase().includes(q) ||
              c.brand.toLowerCase().includes(q),
          );
    return [...list].sort(
      (a, b) =>
        a.brand.localeCompare(b.brand) || a.perfume.localeCompare(b.perfume),
    );
  }, [costCatalog, query]);

  const livePerMl =
    Number(costStr) > 0 && Number(mlStr) > 0
      ? Number(costStr) / Number(mlStr)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Costs</h1>
          <p className="mt-1 text-sm text-stone-500">
            Bottle cost + size per perfume. This drives the profit shown on the
            Order page (cost-per-ml = bottle cost ÷ bottle size). Rows marked{" "}
            <span className="font-medium">In inventory</span> are two-way synced
            with the Inventory tab — editing the cost or name here updates the
            perfume too.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-3.5" aria-hidden />
          Add cost
        </Button>
      </div>

      {adding && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-stone-800">Add a perfume cost</p>
            <Button variant="ghost" size="icon" aria-label="Close form" onClick={cancel}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="cost-brand">Brand</Label>
              <Input id="cost-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Afnan" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost-perfume">Perfume</Label>
              <Input id="cost-perfume" value={perfume} onChange={(e) => setPerfume(e.target.value)} placeholder="e.g. 9PM Rebel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost-cost">Bottle cost (₹)</Label>
              <Input id="cost-cost" type="number" min="0" value={costStr} onChange={(e) => setCostStr(e.target.value)} placeholder="2600" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost-ml">Bottle size (ml)</Label>
              <Input
                id="cost-ml"
                type="number"
                min="1"
                value={mlStr}
                onChange={(e) => setMlStr(e.target.value)}
                placeholder="100"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAdd();
                }}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button onClick={saveAdd}>Save</Button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
        <Input
          type="search"
          placeholder="Search by perfume or brand…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80">
              <th className="px-4 py-3 text-left font-medium text-stone-500">Brand</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Perfume</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Bottle cost</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Bottle size</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Cost / ml</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-stone-400">
                  No cost entries found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const isEditing = editingKey === c.key;
                const isConfirming = confirmDeleteKey === c.key;
                const linkedPerfume =
                  c.perfumeId != null ? perfumeById.get(c.perfumeId) : undefined;
                const isLinked = linkedPerfume !== undefined;
                const statusCell = isLinked ? (
                  <span
                    className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    title={`Synced with "${linkedPerfume.name}" (${linkedPerfume.perfumeCode}) in Inventory`}
                  >
                    In inventory · {linkedPerfume.perfumeCode}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
                    Not tracked
                  </span>
                );

                if (isEditing) {
                  return (
                    <tr key={c.key} className="border-b border-stone-100 bg-amber-50/40 last:border-0">
                      <td className="px-3 py-2">
                        <Input
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          className="h-8 px-2 text-sm"
                          aria-label="Brand"
                          disabled={isLinked}
                          title={isLinked ? "Brand comes from Inventory — rename it on the Inventory tab." : undefined}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={perfume} onChange={(e) => setPerfume(e.target.value)} className="h-8 px-2 text-sm" aria-label="Perfume" />
                      </td>
                      <td className="px-3 py-2">{statusCell}</td>
                      <td className="px-3 py-2">
                        <Input type="number" min="0" value={costStr} onChange={(e) => setCostStr(e.target.value)} className="h-8 w-24 px-2 text-sm" aria-label="Bottle cost" />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="1"
                          value={mlStr}
                          onChange={(e) => setMlStr(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") cancel();
                          }}
                          className="h-8 w-20 px-2 text-sm"
                          aria-label="Bottle size"
                        />
                      </td>
                      <td className="px-4 py-2 text-stone-500">
                        {livePerMl !== null ? formatCurrency(livePerMl) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button size="sm" onClick={saveEdit} aria-label={`Save ${c.perfume}`}>
                            <Check className="size-3.5" aria-hidden />
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancel}>
                            Cancel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={c.key} className="border-b border-stone-100 last:border-0">
                    <td className="px-4 py-3 text-stone-600">{c.brand !== "" ? c.brand : "—"}</td>
                    <td className="px-4 py-3 font-medium text-stone-900">{c.perfume}</td>
                    <td className="px-4 py-3">{statusCell}</td>
                    <td className="px-4 py-3 text-stone-700">{formatCurrency(c.bottleCost)}</td>
                    <td className="px-4 py-3 text-stone-700">{c.bottleMl} ml</td>
                    <td className="px-4 py-3 text-stone-700">{formatCurrency(costPerMl(c))}</td>
                    <td className="px-4 py-3">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              onDelete(c.key);
                              setConfirmDeleteKey(null);
                            }}
                          >
                            Confirm
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteKey(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" aria-label={`Edit ${c.perfume}`} onClick={() => startEdit(c)}>
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          {!isLinked && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete ${c.perfume}`}
                              className="text-red-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => setConfirmDeleteKey(c.key)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-stone-400">
        <Coins className="size-3.5" aria-hidden />
        {filtered.length} of {costCatalog.length} perfumes with cost data
      </p>
    </div>
  );
}
