import { Coins, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { costPerMl } from "../lib/profit";
import { formatCurrency } from "../lib/utils";
import type { PerfumeCost } from "../types";

interface CostsPageProps {
  costCatalog: PerfumeCost[];
  onUpsert: (
    originalKey: string | null,
    input: { brand: string; perfume: string; bottleCost: number; bottleMl: number },
  ) => void;
  onDelete: (key: string) => void;
}

/** null = form closed, "new" = adding, PerfumeCost = editing that row. */
type FormState = null | "new" | PerfumeCost;

export function CostsPage({ costCatalog, onUpsert, onDelete }: CostsPageProps) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  // Controlled form fields.
  const [brand, setBrand] = useState("");
  const [perfume, setPerfume] = useState("");
  const [costStr, setCostStr] = useState("");
  const [mlStr, setMlStr] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openForm = (state: FormState) => {
    setForm(state);
    setError(null);
    if (state === "new" || state === null) {
      setBrand("");
      setPerfume("");
      setCostStr("");
      setMlStr("");
    } else {
      setBrand(state.brand);
      setPerfume(state.perfume);
      setCostStr(String(state.bottleCost));
      setMlStr(String(state.bottleMl));
    }
  };

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

  const handleSave = () => {
    const cost = Number(costStr);
    const ml = Number(mlStr);
    if (perfume.trim() === "") {
      setError("Enter a perfume name.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError("Bottle cost must be 0 or more.");
      return;
    }
    if (!Number.isFinite(ml) || ml <= 0) {
      setError("Bottle size must be greater than 0.");
      return;
    }
    onUpsert(form !== null && form !== "new" ? form.key : null, {
      brand,
      perfume,
      bottleCost: cost,
      bottleMl: ml,
    });
    setForm(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Costs</h1>
          <p className="mt-1 text-sm text-stone-500">
            Bottle cost + size per perfume. This drives the profit shown on the
            Order page (cost-per-ml = bottle cost ÷ bottle size).
          </p>
        </div>
        <Button size="sm" onClick={() => openForm("new")}>
          <Plus className="size-3.5" aria-hidden />
          Add cost
        </Button>
      </div>

      {form !== null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-stone-800">
              {form === "new" ? "Add a perfume cost" : `Edit ${form.perfume}`}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close form"
              onClick={() => setForm(null)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="cost-brand">Brand</Label>
              <Input
                id="cost-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Afnan"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost-perfume">Perfume</Label>
              <Input
                id="cost-perfume"
                value={perfume}
                onChange={(e) => setPerfume(e.target.value)}
                placeholder="e.g. 9PM Rebel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost-cost">Bottle cost (₹)</Label>
              <Input
                id="cost-cost"
                type="number"
                min="0"
                value={costStr}
                onChange={(e) => setCostStr(e.target.value)}
                placeholder="2600"
              />
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
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
          </div>
          {error !== null && (
            <p className="mt-2 text-xs text-red-500" role="alert">
              {error}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search by perfume or brand…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80">
              <th className="px-4 py-3 text-left font-medium text-stone-500">Brand</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Perfume</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Bottle cost</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Bottle size</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Cost / ml</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-stone-400">
                  No cost entries found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const isConfirming = confirmDeleteKey === c.key;
                return (
                  <tr
                    key={c.key}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="px-4 py-3 text-stone-600">
                      {c.brand !== "" ? c.brand : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-stone-900">
                      {c.perfume}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {formatCurrency(c.bottleCost)}
                    </td>
                    <td className="px-4 py-3 text-stone-700">{c.bottleMl} ml</td>
                    <td className="px-4 py-3 text-stone-700">
                      {formatCurrency(costPerMl(c))}
                    </td>
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteKey(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${c.perfume}`}
                            onClick={() => openForm(c)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${c.perfume}`}
                            className="text-red-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => setConfirmDeleteKey(c.key)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
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
