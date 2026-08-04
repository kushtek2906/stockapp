import { useMemo, useState } from "react";
import { ImageIcon, Pencil, Search, Trash2 } from "lucide-react";
import type { Brand, Perfume, Sale } from "../../types";
import {
  cn,
  formatCurrency,
  formatDate,
  getStockStatus,
} from "../../lib/utils";
import type { EditPerfumeInput } from "../../hooks/useInventory";
import { EditPerfumeDialog } from "../dialogs/EditPerfumeDialog";
import { EditQuantityDialog } from "../dialogs/EditQuantityDialog";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface InventoryTableProps {
  perfumes: Perfume[];
  brands: Brand[];
  sales: Sale[];
  remainingMlMap: Record<string, number>;
  onEdit: (perfumeId: string, input: EditPerfumeInput) => void;
  onDelete: (perfumeId: string) => void;
  onSetStock: (perfumeId: string, stockMl: number) => void;
}

const STATUS_BADGE_VARIANT = {
  ok: "ok",
  low: "low",
  critical: "critical",
} as const;

const STATUS_ROW_CLASS = {
  ok: "",
  low: "bg-amber-50/60",
  critical: "bg-red-50/60",
} as const;

const STATUS_LABEL = {
  ok: "In Stock",
  low: "Low",
  critical: "Critical",
} as const;

export function InventoryTable({
  perfumes,
  brands,
  sales,
  remainingMlMap,
  onEdit,
  onDelete,
  onSetStock,
}: InventoryTableProps) {
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState<Perfume | null>(null);
  const [qtyTarget, setQtyTarget] = useState<Perfume | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const brandMap = useMemo<Record<string, Brand>>(() => {
    const m: Record<string, Brand> = {};
    for (const b of brands) {
      m[b.brandId] = b;
    }
    return m;
  }, [brands]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (q === "") return perfumes;
    return perfumes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (brandMap[p.brandId]?.name ?? "").toLowerCase().includes(q) ||
        p.perfumeId.toLowerCase().includes(q) ||
        p.perfumeCode.toLowerCase().includes(q),
    );
  }, [perfumes, brandMap, query]);

  const totalSalesMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const s of sales) {
      m[s.perfumeId] = (m[s.perfumeId] ?? 0) + s.totalPrice;
    }
    return m;
  }, [sales]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search by name, brand, or code…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Mobile: card list */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-400">
            No perfumes found.
          </div>
        ) : (
          filtered.map((p) => {
            const remaining = remainingMlMap[p.perfumeId] ?? 0;
            const status = getStockStatus(remaining);
            const isConfirming = confirmDeleteId === p.perfumeId;
            return (
              <div
                key={p.perfumeId}
                className={cn(
                  "rounded-xl border border-stone-200 bg-white p-3",
                  STATUS_ROW_CLASS[status],
                )}
              >
                <div className="flex items-start gap-3">
                  {p.imageUrl !== undefined ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="size-10 shrink-0 rounded border border-stone-200 object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded bg-stone-100 text-stone-400">
                      <ImageIcon className="size-4" aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-900">{p.name}</p>
                    <p className="text-xs text-stone-400">
                      {brandMap[p.brandId]?.name ?? "—"} ·{" "}
                      <span className="font-mono text-amber-700">{p.perfumeCode}</span>
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[status]}>
                    {STATUS_LABEL[status]}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setQtyTarget(p)}
                    className="rounded px-1 py-0.5 text-stone-700 hover:bg-amber-50 hover:text-amber-800"
                  >
                    {remaining.toFixed(1)} ml
                  </button>
                  <span className="text-stone-600">{formatCurrency(p.costPrice)}</span>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  {isConfirming ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          onDelete(p.perfumeId);
                          setConfirmDeleteId(null);
                        }}
                      >
                        Confirm delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditTarget(p)}>
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${p.name}`}
                        className="text-red-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setConfirmDeleteId(p.perfumeId)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80">
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Perfume
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Brand
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Stock
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Cost Price
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Revenue
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Purchased
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-stone-400">
                  No perfumes found.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const remaining = remainingMlMap[p.perfumeId] ?? 0;
                const status = getStockStatus(remaining);
                const isConfirming = confirmDeleteId === p.perfumeId;
                return (
                  <tr
                    key={p.perfumeId}
                    className={cn(
                      "border-b border-stone-100 last:border-0 transition-colors",
                      STATUS_ROW_CLASS[status],
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.imageUrl !== undefined ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="size-8 rounded border border-stone-200 object-cover shrink-0"
                          />
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded bg-stone-100 text-stone-400 shrink-0">
                            <ImageIcon className="size-4" aria-hidden />
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-stone-900">{p.name}</p>
                          <p className="font-mono text-xs text-amber-700">
                            {p.perfumeCode}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {brandMap[p.brandId]?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      <button
                        type="button"
                        onClick={() => setQtyTarget(p)}
                        title="Click to set stock quantity"
                        className="rounded px-1 py-0.5 text-left hover:bg-amber-50 hover:text-amber-800"
                      >
                        {remaining.toFixed(1)} ml
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE_VARIANT[status]}>
                        {STATUS_LABEL[status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {formatCurrency(p.costPrice)}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {formatCurrency(totalSalesMap[p.perfumeId] ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {formatDate(p.purchaseDate)}
                    </td>
                    <td className="px-4 py-3">
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              onDelete(p.perfumeId);
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
                            aria-label={`Edit ${p.name}`}
                            onClick={() => setEditTarget(p)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${p.name}`}
                            className="text-red-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => setConfirmDeleteId(p.perfumeId)}
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

      <p className="text-xs text-stone-400">
        {filtered.length} of {perfumes.length} perfumes
      </p>

      {editTarget !== null && (
        <EditPerfumeDialog
          open={editTarget !== null}
          onOpenChange={(o) => {
            if (!o) setEditTarget(null);
          }}
          perfume={editTarget}
          brand={brandMap[editTarget.brandId]}
          onSave={(values) => {
            onEdit(editTarget.perfumeId, values);
            setEditTarget(null);
          }}
        />
      )}

      {qtyTarget !== null && (
        <EditQuantityDialog
          open={qtyTarget !== null}
          onOpenChange={(o) => {
            if (!o) setQtyTarget(null);
          }}
          perfume={qtyTarget}
          onSave={(stockMl) => {
            onSetStock(qtyTarget.perfumeId, stockMl);
            setQtyTarget(null);
          }}
        />
      )}
    </div>
  );
}
