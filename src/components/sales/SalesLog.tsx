import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Brand, Perfume, Sale } from "../../types";
import { formatCurrency, formatDate } from "../../lib/utils";
import type { EditSaleInput } from "../../hooks/useInventory";
import { EditSaleDialog } from "../dialogs/EditSaleDialog";
import { Button } from "../ui/Button";

interface SalesLogProps {
  sales: Sale[];
  perfumes: Perfume[];
  brands: Brand[];
  remainingMlMap: Record<string, number>;
  onEdit: (saleId: string, input: EditSaleInput) => void;
  onDelete: (saleId: string) => void;
}

export function SalesLog({
  sales,
  perfumes,
  brands,
  remainingMlMap,
  onEdit,
  onDelete,
}: SalesLogProps) {
  const [editTarget, setEditTarget] = useState<Sale | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const perfumeMap = useMemo<Record<string, Perfume>>(() => {
    const m: Record<string, Perfume> = {};
    for (const p of perfumes) {
      m[p.perfumeId] = p;
    }
    return m;
  }, [perfumes]);

  const brandMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const b of brands) {
      m[b.brandId] = b.name;
    }
    return m;
  }, [brands]);

  const sorted = useMemo(
    () => sales.toSorted((a, b) => b.date.localeCompare(a.date)),
    [sales],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-100 bg-stone-50/80">
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Date
            </th>
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Perfume
            </th>
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Brand
            </th>
            <th className="px-4 py-3 text-right font-medium text-stone-500">
              ML Sold
            </th>
            <th className="px-4 py-3 text-right font-medium text-stone-500">
              Revenue
            </th>
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 text-center text-stone-400">
                No sales recorded yet.
              </td>
            </tr>
          ) : (
            sorted.map((s) => {
              const perfume = perfumeMap[s.perfumeId];
              const brandName =
                perfume !== undefined ? (brandMap[perfume.brandId] ?? "—") : "—";
              const isConfirming = confirmDeleteId === s.id;
              return (
                <tr
                  key={s.id}
                  className="border-b border-stone-100 last:border-0 transition-colors hover:bg-stone-50/50"
                >
                  <td className="px-4 py-3 text-stone-500">
                    {formatDate(s.date)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-stone-900">
                      {perfume?.name ?? "—"}
                    </p>
                    {perfume !== undefined && (
                      <p className="font-mono text-xs text-amber-700">
                        {perfume.perfumeCode}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{brandName}</td>
                  <td className="px-4 py-3 text-right text-stone-700">
                    {s.mlSold.toFixed(1)} ml
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-stone-900">
                    {formatCurrency(s.totalPrice)}
                  </td>
                  <td className="px-4 py-3">
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            onDelete(s.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit sale"
                          onClick={() => setEditTarget(s)}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete sale"
                          className="text-red-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setConfirmDeleteId(s.id)}
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

      {editTarget !== null && (
        <EditSaleDialog
          open={editTarget !== null}
          onOpenChange={(o) => {
            if (!o) setEditTarget(null);
          }}
          sale={editTarget}
          perfume={perfumeMap[editTarget.perfumeId]}
          remainingMlMap={remainingMlMap}
          onSave={(input) => {
            onEdit(editTarget.id, input);
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
