import {
  ChevronDown,
  Download,
  Package,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { BoxSettingsDialog } from "../components/dialogs/BoxSettingsDialog";
import { EditOrderDialog } from "../components/dialogs/EditOrderDialog";
import {
  PerfumePreviewDialog,
  type PerfumePreviewTarget,
} from "../components/dialogs/PerfumePreviewDialog";
import { Button } from "../components/ui/Button";
import type { EditOrderInput } from "../hooks/useInventory";
import { loadPrefs } from "../lib/prefs";
import { orderChargedTotal } from "../lib/order";
import {
  buildShipmentCsv,
  missingShippingFields,
  type ShipmentCsvFormat,
} from "../lib/shipmentCsv";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<ShipmentCsvFormat>("bulk-forward-shipment");
  const [boxSettingsOpen, setBoxSettingsOpen] = useState(false);
  const [boxes, setBoxes] = useState(() => loadPrefs().boxes);

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
      bottleMl: p?.bottleMl ?? null,
      bottleCost: p?.bottleCost ?? null,
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = sorted.length > 0 && sorted.every((o) => selected.has(o.id));
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(sorted.map((o) => o.id)));
  };

  const handleGenerateCsv = () => {
    const chosen = sorted.filter((o) => selected.has(o.id));
    if (chosen.length === 0) {
      toast.error("Select at least one order first.");
      return;
    }
    const incomplete = chosen.filter(
      (o) => missingShippingFields(o, exportFormat, boxes).length > 0,
    );
    if (incomplete.length > 0) {
      toast.warning(
        `${incomplete.length} selected order(s) are missing required ${exportFormat === "bulk-forward-shipment" ? "city/pincode/phone" : "customer, address, or parcel details"} — those cells will be blank. Edit the order or box settings to fill them.`,
      );
    }
    const csv = buildShipmentCsv(chosen, boxes, exportFormat);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = exportFormat === "bulk-forward-shipment"
      ? `swift_${date}.csv`
      : `shipmozo_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`CSV generated for ${chosen.length} order(s).`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Order History</h1>
          <p className="mt-1 text-sm text-stone-500">
            Every confirmed order. Editing or deleting one adjusts your stock to match.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="shipment-csv-format">
            Courier CSV format
          </label>
          <select
            id="shipment-csv-format"
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as ShipmentCsvFormat)}
            className="h-9 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-700 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
          >
            <option value="bulk-forward-shipment">Swift</option>
            <option value="forward-bulk-order">Shipmozo</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBoxSettingsOpen(true)}
          >
            <Package className="size-3.5" aria-hidden />
            Box sizes
          </Button>
          <Button
            size="sm"
            onClick={handleGenerateCsv}
            disabled={selected.size === 0}
          >
            <Download className="size-3.5" aria-hidden />
            Generate CSV ({selected.size})
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 bg-white p-10 text-center text-sm text-stone-400">
          No orders yet. Confirm an order from the <span className="font-medium">Order</span>{" "}
          tab and it'll show up here.
        </div>
      ) : (
        <>
        {/* Mobile: card list */}
        <div className="space-y-3 md:hidden">
          {sorted.map((order) => {
            const isOpen = expanded === order.id;
            const isConfirming = confirmDeleteId === order.id;
            const missing = missingShippingFields(order, exportFormat, boxes);
            return (
              <div key={order.id} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(order.id)}
                    onChange={() => toggleSelect(order.id)}
                    aria-label={`Select order ${order.customerName}`}
                    className="mt-1 size-4 accent-amber-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-stone-900">
                      {order.customerName !== "" ? order.customerName : "—"}
                    </p>
                    <p className="text-xs text-stone-400">
                      {formatDateTime(order.date)}
                      {order.customerPhone !== "" ? ` · ${order.customerPhone}` : ""}
                    </p>
                    {missing.length > 0 && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600">
                        <TriangleAlert className="size-3" aria-hidden />
                        needs {missing.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="block font-medium text-stone-800">
                      {formatCurrency(orderChargedTotal(order))}
                    </span>
                    {order.profit !== undefined && (
                      <span
                        className={cn(
                          "block text-xs font-medium",
                          order.profit >= 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {formatCurrency(order.profit)} profit
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  className="mt-2 flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700"
                >
                  <ChevronDown
                    className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                    aria-hidden
                  />
                  {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                </button>
                {isOpen && (
                  <div className="mt-2 border-t border-stone-100 pt-2">
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
                          >
                            {it.brand !== "" ? `${it.brand} ` : ""}
                            {it.perfumeName}
                            {it.size !== null ? ` (${it.size}ml)` : ` (${it.mlSold}ml)`}
                          </button>
                          <span className="font-medium text-stone-700">
                            {formatCurrency(it.unitPrice)}
                            {it.unitCost !== undefined && (
                              <span className="ml-1 text-xs font-normal text-stone-400">
                                cost {formatCurrency(it.unitCost)}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-2 flex justify-end gap-1">
                  {isConfirming ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          onDelete(order.id);
                          setConfirmDeleteId(null);
                        }}
                      >
                        Delete &amp; restore
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditTarget(order)}>
                        <Pencil className="size-3.5" aria-hidden />
                        Edit
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
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white md:block">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/80">
                <th className="w-8 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all orders"
                    className="size-3.5 accent-amber-700"
                  />
                </th>
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left font-medium text-stone-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Items</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Total</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Profit</th>
                <th className="px-4 py-3 text-left font-medium text-stone-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((order) => {
                const isOpen = expanded === order.id;
                const isConfirming = confirmDeleteId === order.id;
                const missing = missingShippingFields(order, exportFormat, boxes);
                return (
                  <Fragment key={order.id}>
                    <tr className="border-b border-stone-100 last:border-0">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          aria-label={`Select order ${order.customerName}`}
                          className="size-3.5 accent-amber-700"
                        />
                      </td>
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
                        {missing.length > 0 && (
                          <span
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600"
                            title={`Missing for selected CSV: ${missing.join(", ")}`}
                          >
                            <TriangleAlert className="size-3" aria-hidden />
                            needs {missing.join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {order.items.length}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800">
                        {formatCurrency(orderChargedTotal(order))}
                      </td>
                      <td className="px-4 py-3">
                        {order.profit !== undefined ? (
                          <span
                            className={cn(
                              "font-medium",
                              order.profit >= 0 ? "text-emerald-600" : "text-red-600",
                            )}
                          >
                            {formatCurrency(order.profit)}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
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
                        <td />
                        <td colSpan={6} className="px-4 py-3">
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
                                  {it.unitCost !== undefined && (
                                    <span className="ml-1 text-xs font-normal text-stone-400">
                                      cost {formatCurrency(it.unitCost)}
                                    </span>
                                  )}
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
        </>
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

      <BoxSettingsDialog
        open={boxSettingsOpen}
        onOpenChange={setBoxSettingsOpen}
        onSaved={() => setBoxes(loadPrefs().boxes)}
      />
    </div>
  );
}
