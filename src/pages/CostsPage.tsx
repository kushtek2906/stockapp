import { Check, Coins, Pencil, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { costPerMl, hasCostData } from "../lib/profit";
import { cn, formatCurrency } from "../lib/utils";
import type { Brand, Perfume } from "../types";

interface CostsPageProps {
  perfumes: Perfume[];
  brands: Brand[];
  /** Writes straight to the perfume — there is no second copy of these values. */
  onSetCost: (
    perfumeId: string,
    input: { name?: string; bottleCost: number; bottleMl: number },
  ) => void;
}

export function CostsPage({ perfumes, brands, onSetCost }: CostsPageProps) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Draft state for the row being edited (one at a time).
  const [name, setName] = useState("");
  const [costStr, setCostStr] = useState("");
  const [mlStr, setMlStr] = useState("");

  const brandNameById = useMemo(
    () => new Map(brands.map((b) => [b.brandId, b.name])),
    [brands],
  );

  const startEdit = (p: Perfume) => {
    setEditingId(p.perfumeId);
    setName(p.name);
    setCostStr(String(p.bottleCost));
    setMlStr(String(p.bottleMl));
  };

  const cancel = () => setEditingId(null);

  const save = (p: Perfume) => {
    const bottleCost = Number(costStr);
    const bottleMl = Number(mlStr);
    if (name.trim() === "") {
      toast.error("Enter a perfume name.");
      return;
    }
    if (!Number.isFinite(bottleCost) || bottleCost < 0) {
      toast.error("Bottle cost must be 0 or more.");
      return;
    }
    if (!Number.isFinite(bottleMl) || bottleMl <= 0) {
      toast.error("Bottle size must be greater than 0.");
      return;
    }
    onSetCost(p.perfumeId, { name, bottleCost, bottleMl });
    setEditingId(null);
  };

  const missingCount = useMemo(
    () => perfumes.filter((p) => !hasCostData(p)).length,
    [perfumes],
  );

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = perfumes.filter((p) => {
      if (onlyMissing && hasCostData(p)) return false;
      if (q === "") return true;
      const brand = (brandNameById.get(p.brandId) ?? "").toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        brand.includes(q) ||
        p.perfumeCode.toLowerCase().includes(q)
      );
    });
    return [...list].sort(
      (a, b) =>
        (brandNameById.get(a.brandId) ?? "").localeCompare(
          brandNameById.get(b.brandId) ?? "",
        ) || a.name.localeCompare(b.name),
    );
  }, [perfumes, brandNameById, query, onlyMissing]);

  // Live cost/ml preview while editing.
  const draftPerMl =
    Number(costStr) > 0 && Number(mlStr) > 0
      ? Number(costStr) / Number(mlStr)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Costs</h1>
        <p className="mt-1 text-sm text-stone-500">
          Bottle cost and bottle size for every perfume in your inventory. These
          two numbers live on the perfume itself, so a change here is the same
          change the Inventory tab, order profit and Pricing margins all read —
          cost-per-ml is simply cost ÷ size.
        </p>
      </div>

      {missingCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-amber-500"
            aria-hidden
          />
          <p className="text-amber-800">
            <span className="font-medium">
              {missingCount} perfume{missingCount !== 1 ? "s have" : " has"} no
              usable cost.
            </span>{" "}
            Their decants show “cost?” instead of profit — nothing is counted as
            free.{" "}
            <button
              type="button"
              onClick={() => setOnlyMissing(true)}
              className="font-medium underline underline-offset-2"
            >
              Show them
            </button>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search by perfume, brand, or code…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-600 select-none">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="size-3.5 accent-amber-700"
          />
          Only missing a cost
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[42rem] text-sm">
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-stone-400">
                  {perfumes.length === 0
                    ? "No perfumes yet — add them on the Inventory tab."
                    : "No perfumes match."}
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const isEditing = editingId === p.perfumeId;
                const perMl = costPerMl(p);

                if (isEditing) {
                  return (
                    <tr
                      key={p.perfumeId}
                      className="border-b border-stone-100 bg-amber-50/40 last:border-0"
                    >
                      <td className="px-4 py-2 text-stone-500">
                        {brandNameById.get(p.brandId) ?? "—"}
                        <span className="block text-xs text-stone-400">
                          rename on Inventory
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="h-8 px-2 text-sm"
                          aria-label="Perfume name"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          value={costStr}
                          onChange={(e) => setCostStr(e.target.value)}
                          className="h-8 w-24 px-2 text-sm"
                          aria-label="Bottle cost"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="1"
                          value={mlStr}
                          onChange={(e) => setMlStr(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") save(p);
                            if (e.key === "Escape") cancel();
                          }}
                          className="h-8 w-20 px-2 text-sm"
                          aria-label="Bottle size"
                        />
                      </td>
                      <td className="px-4 py-2 text-stone-500">
                        {draftPerMl !== null ? formatCurrency(draftPerMl) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button size="sm" onClick={() => save(p)}>
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
                  <tr
                    key={p.perfumeId}
                    className={cn(
                      "border-b border-stone-100 last:border-0",
                      !hasCostData(p) && "bg-amber-50/50",
                    )}
                  >
                    <td className="px-4 py-3 text-stone-600">
                      {brandNameById.get(p.brandId) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-stone-900">{p.name}</p>
                      <p className="font-mono text-xs text-amber-700">
                        {p.perfumeCode}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {p.bottleCost > 0 ? (
                        formatCurrency(p.bottleCost)
                      ) : (
                        <span className="text-amber-700">not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-700">{p.bottleMl} ml</td>
                    <td className="px-4 py-3 text-stone-700">
                      {perMl !== null ? (
                        formatCurrency(perMl)
                      ) : (
                        <span className="text-amber-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => startEdit(p)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
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
        {rows.length} of {perfumes.length} perfumes
        {missingCount > 0 ? ` · ${missingCount} without a usable cost` : ""}
      </p>
    </div>
  );
}
