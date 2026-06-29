import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { EditOrderDialog } from "../components/dialogs/EditOrderDialog";
import {
  PerfumePreviewDialog,
  type PerfumePreviewTarget,
} from "../components/dialogs/PerfumePreviewDialog";
import { Button } from "../components/ui/Button";
import type { EditOrderInput } from "../hooks/useInventory";
import { cn, formatCurrency, formatDateTime } from "../lib/utils";
import type { Brand, Order, OrderLineRecord, Perfume } from "../types";

interface OrderHistoryPageProps {
  orders: Order[];
  perfumes: Perfume[];
  brands: Brand[];
  remainingMlMap: Record<string, number>;
  onDelete: (orderId: string) => void;
  onEdit: (orderId: string, input: EditOrderInput) => boolean;
  onSetPerfumeImage: (perfumeId: string, imageUrl: string | null) => void;
}

export function OrderHistoryPage({
  orders,
  perfumes,
  brands,
  remainingMlMap,
  onDelete,
  onEdit,
  onSetPerfumeImage,
}: OrderHistoryPageProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Order | null>(null);
  const [preview, setPreview] = useState<PerfumePreviewTarget | null>(null);

  const perfumeMap = useMemo<Map<string, Perfume>>(
    () => new Map(perfumes.map((p) => [p.perfumeId, p])),
    [perfumes],
  );

  const openPreview = (it: OrderLineRecord) => {
    const p = it.perfumeId !== null ? perfumeMap.get(it.perfumeId) : undefined;
    setPreview({
      perfumeId: it.perfumeId,
      name: it.perfumeName,
      brand: it.brand,
      imageUrl: p?.imageUrl,
      remainingMl:
        it.perfumeId !== null ? (remainingMlMap[it.perfumeId] ?? null) : null,
      totalMl: p?.totalMl ?? null,
      costPrice: p?.costPrice ?? null,
      lineSize: it.size,
      lineMl: it.mlSold,
      lineUnitPrice: it.unitPrice,
    });
  };

  const handleSetImage = (perfumeId: string, imageUrl: string | null) => {
    onSetPerfumeImage(perfumeId, imageUrl);
    setPreview((prev) =>
      prev !== null ? { ...prev, imageUrl: imageUrl ?? undefined } : prev,
    );
  };

  // Newest first.
  const sorted = useMemo(
    () => [...orders].sort((a, b) => b.date.localeCompare(a.date)),
    [orders],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Order History</h1>
        <p className="mt-1 text-sm text-stone-500">
          Every confirmed order. Editing or deleting one adjusts your stock to match.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 bg-white p-10 text-center text-sm text-stone-400">
          No orders yet. Confirm an order from the <span className="font-medium">Order</span>{" "}
          tab and it'll show up here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/80">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left font-medium text-stone-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Items</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Total</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((order) => {
                const isOpen = expanded === order.id;
                const isConfirming = confirmDeleteId === order.id;
                return (
                  <Fragment key={order.id}>
                    <tr className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          onClick={() => setExpanded(isOpen ? null : order.id)}
                          className="text-stone-400 hover:text-stone-700"
                        >
                          <ChevronDown
                            className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                            aria-hidden
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {formatDateTime(order.date)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-stone-900">
                          {order.customerName !== "" ? order.customerName : "—"}
                        </p>
                        {order.customerPhone !== "" && (
                          <p className="text-xs text-stone-400">{order.customerPhone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {order.items.length}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-4 py-3">
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                onDelete(order.id);
                                setConfirmDeleteId(null);
                              }}
                            >
                              Delete & restore stock
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
                              aria-label="Edit order"
                              onClick={() => setEditTarget(order)}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Delete order"
                              className="text-red-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => setConfirmDeleteId(order.id)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-stone-100 bg-stone-50/50 last:border-0">
                        <td />
                        <td colSpan={5} className="px-4 py-3">
                          {order.customerAddress !== "" && (
                            <p className="mb-2 text-xs text-stone-500">
                              <span className="text-stone-400">Address: </span>
                              {order.customerAddress}
                            </p>
                          )}
                          <ul className="space-y-1">
                            {order.items.map((it, i) => (
                              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                <button
                                  type="button"
                                  onClick={() => openPreview(it)}
                                  className="text-left text-stone-700 hover:text-amber-700 hover:underline"
                                  title="View perfume"
                                >
                                  {it.brand !== "" ? `${it.brand} ` : ""}
                                  {it.perfumeName}
                                  {it.size !== null ? ` (${it.size}ml)` : ` (${it.mlSold}ml)`}
                                  {it.perfumeId === null && (
                                    <span className="ml-1 text-xs text-amber-600">not tracked</span>
                                  )}
                                </button>
                                <span className="font-medium text-stone-700">
                                  {formatCurrency(it.unitPrice)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-stone-400">
        {sorted.length} order{sorted.length !== 1 ? "s" : ""}
      </p>

      {editTarget !== null && (
        <EditOrderDialog
          open={editTarget !== null}
          onOpenChange={(o) => {
            if (!o) setEditTarget(null);
          }}
          order={editTarget}
          perfumes={perfumes}
          brands={brands}
          onSave={onEdit}
        />
      )}

      <PerfumePreviewDialog
        open={preview !== null}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
        target={preview}
        onSetImage={handleSetImage}
      />
    </div>
  );
}
