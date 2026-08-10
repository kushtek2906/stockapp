import {
  Check,
  ClipboardCopy,
  ChevronDown,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ConfirmOrderInput, ConfirmOrderResult } from "../hooks/useInventory";
import {
  clearItemMatch,
  computeChargedTotal,
  displayName,
  effectiveMl,
  formatBill,
  matchOrder,
  parseOrder,
  recomputeItem,
  setCustomItem,
  setItemSize,
  type MatchedOrderItem,
  type MatchStatus,
} from "../lib/order";
import { loadPrefs } from "../lib/prefs";
import { formatCurrency, formatDateTime } from "../lib/utils";
import { cn } from "../lib/utils";
import {
  buildCostIndex,
  computeOrderProfit,
  lineProfit,
  lookupCost,
  type CostIndex,
} from "../lib/profit";
import {
  DECANT_SIZES,
  type DecantCatalog,
  type DecantCatalogEntry,
  type DecantSize,
  type Perfume,
  type PerfumeCost,
} from "../types";
import { SheetSettingsDialog } from "../components/order/SheetSettingsDialog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";

interface OrderPageProps {
  catalog: DecantCatalog | null;
  perfumes: Perfume[];
  costCatalog: PerfumeCost[];
  onConfirmOrder: (input: ConfirmOrderInput) => ConfirmOrderResult;
  syncing: boolean;
  lastSynced: string | null;
  onRefresh: () => void;
  sheetId: string;
  gid: string;
  onSetSheetConfig: (sheetId: string, gid: string) => void;
}

const STATUS_META: Record<
  MatchStatus,
  { label: string; variant: "ok" | "low" | "critical" | "default" }
> = {
  confident: { label: "Matched", variant: "ok" },
  needs_confirm: { label: "Confirm?", variant: "low" },
  no_match: { label: "No match", variant: "critical" },
  no_size: { label: "Pick size", variant: "low" },
  no_price: { label: "Size N/A", variant: "critical" },
  custom: { label: "Custom", variant: "ok" },
};

// ── Searchable catalog picker (mirrors the QuickSaleForm combobox) ───────────

interface CatalogComboboxProps {
  catalog: DecantCatalog;
  value: DecantCatalogEntry | null;
  onSelect: (entry: DecantCatalogEntry) => void;
  onClear: () => void;
}

function CatalogCombobox({
  catalog,
  value,
  onSelect,
  onClear,
}: CatalogComboboxProps) {
  const [query, setQuery] = useState(value?.perfume ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value?.perfume ?? "");
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list =
      q === ""
        ? catalog.entries
        : catalog.entries.filter(
            (e) =>
              e.perfume.toLowerCase().includes(q) ||
              e.inspiration.toLowerCase().includes(q) ||
              e.brand.toLowerCase().includes(q),
          );
    return list.slice(0, 30);
  }, [catalog.entries, query]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          placeholder="Search the price sheet…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="h-9 pr-14 text-sm"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value !== null && (
            <button
              type="button"
              aria-label="Clear this match and search again"
              title="Delete match & search the full list"
              onClick={() => {
                onClear();
                setQuery("");
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="rounded p-0.5 text-stone-400 hover:text-red-500"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
          <ChevronDown
            className={cn(
              "pointer-events-none size-4 text-stone-400 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </div>
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((e) => (
            <li
              key={`${e.rowIndex}-${e.perfume}`}
              role="option"
              aria-selected={value?.rowIndex === e.rowIndex}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm hover:bg-stone-50",
                value?.rowIndex === e.rowIndex && "bg-amber-50",
              )}
              onMouseDown={() => {
                onSelect(e);
                setQuery(e.perfume);
                setOpen(false);
              }}
            >
              <p className="font-medium text-stone-900">{e.perfume}</p>
              <p className="text-xs text-stone-400">
                {e.brand !== "" ? e.brand : "—"}
                {e.inspiration !== "" ? ` · insp: ${e.inspiration}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── One order line row ───────────────────────────────────────────────────────

interface OrderItemRowProps {
  item: MatchedOrderItem;
  position: number;
  catalog: DecantCatalog;
  perfumes: Perfume[];
  costIndex: CostIndex;
  onChange: (next: MatchedOrderItem) => void;
}

function OrderItemRow({
  item,
  position,
  catalog,
  perfumes,
  costIndex,
  onChange,
}: OrderItemRowProps) {
  const meta = STATUS_META[item.status];
  const pc =
    item.chosen !== null
      ? lookupCost(costIndex, item.chosen.brand, item.chosen.perfume)
      : null;
  const effMl = effectiveMl(item);
  const profit =
    item.unitPrice !== null && effMl !== null && effMl > 0
      ? lineProfit(item.unitPrice, effMl, pc)
      : null;
  const isCustom = item.custom;
  const availableSizes = item.chosen
    ? DECANT_SIZES.filter((sz) => item.chosen!.prices[sz] !== undefined)
    : [];

  const pickEntry = (entry: DecantCatalogEntry) => {
    onChange(recomputeItem(item, entry, item.size, perfumes));
  };
  const pickSize = (size: DecantSize) => {
    if (item.chosen === null) return;
    onChange(recomputeItem(item, item.chosen, size, perfumes));
  };
  const enterCustom = () => {
    // Seed with the current size (if any) so a matched line pre-fills its ml.
    onChange(setCustomItem(item, item.customMl ?? item.size, item.unitPrice));
  };
  const changeCustomMl = (raw: string) => {
    onChange(setCustomItem(item, raw === "" ? null : Number(raw), item.unitPrice));
  };
  const changeCustomPrice = (raw: string) => {
    onChange(setCustomItem(item, item.customMl, raw === "" ? null : Number(raw)));
  };
  const clearMatch = () => {
    onChange(clearItemMatch(item));
  };

  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm text-stone-700">
          <span className="mr-1.5 font-mono text-xs text-stone-400">
            {position}.
          </span>
          {item.line.raw}
        </p>
        <Badge variant={meta.variant} className="shrink-0 text-[10px]">
          {meta.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <CatalogCombobox
          catalog={catalog}
          value={item.chosen}
          onSelect={pickEntry}
          onClear={clearMatch}
        />
        <div className="flex flex-wrap items-center gap-1">
          {availableSizes.map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => pickSize(sz)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                item.size === sz && !isCustom
                  ? "border-amber-600 bg-amber-50 text-amber-800"
                  : "border-stone-200 text-stone-600 hover:bg-stone-50",
              )}
            >
              {sz}ml
            </button>
          ))}
          <button
            type="button"
            onClick={enterCustom}
            title="Custom size & price for an unconventional order"
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              isCustom
                ? "border-amber-600 bg-amber-50 text-amber-800"
                : "border-dashed border-stone-300 text-stone-500 hover:bg-stone-50",
            )}
          >
            Custom
          </button>
        </div>
      </div>

      {isCustom && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-100 bg-amber-50/50 px-2 py-1.5">
          <label className="flex items-center gap-1 text-xs text-stone-500">
            <input
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              placeholder="ml"
              value={item.customMl ?? ""}
              onChange={(e) => changeCustomMl(e.target.value)}
              className="h-8 w-20 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label="Custom size in ml"
            />
            ml
          </label>
          <label className="flex items-center gap-1 text-xs text-stone-500">
            ₹
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="price"
              value={item.unitPrice ?? ""}
              onChange={(e) => changeCustomPrice(e.target.value)}
              className="h-8 w-24 rounded-md border border-stone-200 bg-white px-2 text-sm text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label="Custom price in rupees"
            />
          </label>
          <span className="text-[11px] text-stone-400">manual price</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-xs">
        <span>
          {item.unitPrice !== null ? (
            <>
              <span className="font-medium text-stone-800">₹{item.unitPrice}</span>
              {profit !== null ? (
                <span
                  className={cn(
                    "ml-2 font-medium",
                    profit >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  · profit ₹{Math.round(profit)}
                </span>
              ) : (
                <span className="ml-2 text-stone-400" title="No cost data for this perfume">
                  · cost?
                </span>
              )}
            </>
          ) : item.status === "no_price" ? (
            <span className="text-red-500">that size isn't offered</span>
          ) : item.status === "no_size" ? (
            <span className="text-amber-600">choose a size</span>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </span>
        {item.chosen !== null && (
          <Badge
            variant={item.inTrackedInventory ? "ok" : "low"}
            className="text-[10px]"
          >
            {item.inTrackedInventory ? "in inventory" : "not tracked"}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function OrderPage({
  catalog,
  perfumes,
  costCatalog,
  onConfirmOrder,
  syncing,
  lastSynced,
  onRefresh,
  sheetId,
  gid,
  onSetSheetConfig,
}: OrderPageProps) {
  const [rawOrder, setRawOrder] = useState("");
  const [items, setItems] = useState<MatchedOrderItem[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showBrand, setShowBrand] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerPincode, setCustomerPincode] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAltPhone, setCustomerAltPhone] = useState("");
  const [weightStr, setWeightStr] = useState("");
  const [cod, setCod] = useState(false);
  const [discountStr, setDiscountStr] = useState("");
  const [deliveryStr, setDeliveryStr] = useState("");
  const [deliveryTouched, setDeliveryTouched] = useState(false);
  const [finalAmountStr, setFinalAmountStr] = useState("");

  const boxes = useMemo(() => loadPrefs().boxes, []);
  const [boxId, setBoxId] = useState<string>(() => boxes[0]?.id ?? "");

  // Billable = has a resolved size + price (tracked or not). These go on the order;
  // only the tracked ones also deduct stock.
  const billableItems = useMemo(
    () =>
      items.filter((it) => {
        const ml = effectiveMl(it);
        return it.unitPrice !== null && ml !== null && ml > 0;
      }),
    [items],
  );
  const billable = billableItems.length;
  const computedTotal = useMemo(
    () => billableItems.reduce((s, it) => s + (it.unitPrice as number), 0),
    [billableItems],
  );

  const discountPct = Math.max(0, Number(discountStr) || 0);
  // Free delivery from ₹1000; otherwise ₹100 — the default, until the user edits it.
  const autoDelivery = computedTotal < 1000 ? 100 : 0;
  const deliveryValue = deliveryTouched ? deliveryStr : String(autoDelivery);
  const deliveryCharge = Math.max(0, Number(deliveryValue) || 0);
  const amountOverride =
    finalAmountStr.trim() !== "" && Number.isFinite(Number(finalAmountStr))
      ? Number(finalAmountStr)
      : null;

  const bill = useMemo(
    () =>
      formatBill(items, showBrand, discountPct, deliveryCharge, amountOverride),
    [items, showBrand, discountPct, deliveryCharge, amountOverride],
  );

  const costIndex = useMemo(() => buildCostIndex(costCatalog), [costCatalog]);

  // Live order profit: revenue = manual override, else subtotal − discount + delivery.
  const revenue = useMemo(
    () =>
      computeChargedTotal(computedTotal, discountPct, deliveryCharge, amountOverride),
    [computedTotal, discountPct, deliveryCharge, amountOverride],
  );

  const orderProfit = useMemo(
    () =>
      computeOrderProfit(
        billableItems.map((it) => ({
          unitPrice: it.unitPrice as number,
          size: effectiveMl(it) as number,
          pc: it.chosen
            ? lookupCost(costIndex, it.chosen.brand, it.chosen.perfume)
            : null,
        })),
        revenue,
      ),
    [billableItems, costIndex, revenue],
  );

  const resetCustomer = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerCity("");
    setCustomerPincode("");
    setCustomerEmail("");
    setCustomerAltPhone("");
    setWeightStr("");
    setCod(false);
    setDiscountStr("");
    setDeliveryStr("");
    setDeliveryTouched(false);
    setFinalAmountStr("");
  };

  const handleGenerate = () => {
    if (catalog === null) {
      toast.error("Prices haven't loaded yet — try Refresh.");
      return;
    }
    const lines = parseOrder(rawOrder);
    if (lines.length === 0) {
      toast.error("No order lines found. Paste one item per line.");
      return;
    }
    setItems(matchOrder(lines, catalog, perfumes));
    setConfirmed(false);
  };

  const updateItem = (index: number, next: MatchedOrderItem) => {
    setItems((prev) => prev.map((it, i) => (i === index ? next : it)));
    setConfirmed(false);
  };

  const applySizeToAll = (size: DecantSize) => {
    setItems((prev) => prev.map((it) => setItemSize(it, size, perfumes)));
    setConfirmed(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bill);
      toast.success("Bill copied to clipboard.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = bill;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast.success("Bill copied to clipboard.");
      } catch {
        toast.error("Couldn't copy — select the text and copy manually.");
      }
      document.body.removeChild(ta);
    }
  };

  const handleConfirm = () => {
    if (confirmed || billable === 0) return;
    const orderItems = billableItems.map((it) => ({
      perfumeId: it.linkedPerfumeId,
      perfumeName: displayName(it),
      brand: it.chosen?.brand ?? "",
      size: it.size,
      mlSold: effectiveMl(it) as number,
      unitPrice: it.unitPrice as number,
    }));

    const weight = weightStr.trim() === "" ? null : Number(weightStr);

    onConfirmOrder({
      customerName,
      customerAddress,
      customerPhone,
      customerCity,
      customerPincode,
      customerEmail,
      customerAltPhone,
      weightG: weight !== null && Number.isFinite(weight) ? weight : null,
      boxId: boxId || null,
      paymentMode: cod ? "COD" : "Prepaid",
      discountPct,
      deliveryCharge,
      amountOverride,
      items: orderItems,
    });

    setConfirmed(true);
    resetCustomer();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Order</h1>
          <p className="mt-1 text-sm text-stone-500">
            Paste an order, price it from the live sheet, and deduct stock.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400">
            {syncing
              ? "Syncing prices…"
              : lastSynced !== null
                ? `Prices synced: ${formatDateTime(lastSynced)}`
                : "Prices not synced"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={syncing}
          >
            <RefreshCw
              className={syncing ? "size-3.5 animate-spin" : "size-3.5"}
              aria-hidden
            />
            Refresh
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Price sheet settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: paste + bill — sticks in place while the review list scrolls */}
        <div className="space-y-6 lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Paste Order</CardTitle>
              <p className="text-sm text-stone-500">
                One item per line, e.g. “Costa de amalfi 5ml”.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="order-input" className="sr-only">
                Order text
              </Label>
              <textarea
                id="order-input"
                rows={8}
                value={rawOrder}
                onChange={(e) => setRawOrder(e.target.value)}
                placeholder={
                  "1. Costa de amalfi 5ml\n2. Jean Lowe immortel 5ml\n3. Rayhaan pacific aura 3ml"
                }
                className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              />
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={catalog === null || rawOrder.trim() === ""}
                className="w-full"
              >
                Generate Bill
              </Button>
              {catalog === null && (
                <p className="text-xs text-amber-600">
                  Waiting for prices to load from the sheet…
                </p>
              )}
            </CardContent>
          </Card>

          {items.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Bill</CardTitle>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-500 select-none">
                    <input
                      type="checkbox"
                      checked={showBrand}
                      onChange={(e) => setShowBrand(e.target.checked)}
                      className="size-3.5 accent-amber-700"
                      aria-label="Show brand names in the bill"
                    />
                    Show brands
                  </label>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 font-mono text-sm text-stone-800">
                  {bill}
                </pre>

                {billable > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm">
                    <span className="text-stone-600">
                      Est. profit
                      <span className="ml-1 text-xs text-stone-400">
                        (after ₹{25}/decant, ₹{70} delivery, ₹{10} packaging)
                      </span>
                    </span>
                    <span className="text-right">
                      <span
                        className={cn(
                          "font-semibold",
                          orderProfit.profit >= 0 ? "text-emerald-700" : "text-red-600",
                        )}
                      >
                        {formatCurrency(orderProfit.profit)}
                      </span>
                      {orderProfit.missingCost > 0 && (
                        <span className="ml-2 text-xs text-amber-600">
                          {orderProfit.missingCost} missing cost
                        </span>
                      )}
                    </span>
                  </div>
                )}

                <div className="space-y-2 rounded-lg border border-stone-100 bg-stone-50 p-3">
                  <p className="text-xs font-medium text-stone-500">
                    Customer & shipping{" "}
                    <span className="font-normal text-stone-400">
                      (optional — you can add/edit these later from Order History)
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Name"
                      className="h-9 text-sm"
                      aria-label="Customer name"
                    />
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone"
                      className="h-9 text-sm"
                      aria-label="Customer phone"
                    />
                    <Input
                      value={customerAltPhone}
                      onChange={(e) => setCustomerAltPhone(e.target.value)}
                      placeholder="Alternate phone"
                      className="h-9 text-sm"
                      aria-label="Alternate phone"
                    />
                    <Input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email"
                      className="h-9 text-sm"
                      aria-label="Customer email"
                    />
                  </div>
                  <Input
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Address"
                    className="h-9 text-sm"
                    aria-label="Customer address"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={customerCity}
                      onChange={(e) => setCustomerCity(e.target.value)}
                      placeholder="City"
                      className="h-9 text-sm"
                      aria-label="Customer city"
                    />
                    <Input
                      value={customerPincode}
                      onChange={(e) => setCustomerPincode(e.target.value)}
                      placeholder="Pincode"
                      className="h-9 text-sm"
                      aria-label="Customer pincode"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <select
                      value={boxId}
                      onChange={(e) => setBoxId(e.target.value)}
                      className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      aria-label="Shipping box"
                    >
                      {boxes.map((b) => (
                        <option key={b.id} value={b.id}>
                          📦 {b.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="0"
                      value={weightStr}
                      onChange={(e) => setWeightStr(e.target.value)}
                      placeholder="Weight (g, optional)"
                      className="h-9 text-sm"
                      aria-label="Weight in grams"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-stone-600 select-none">
                    <input
                      type="checkbox"
                      checked={cod}
                      onChange={(e) => setCod(e.target.checked)}
                      className="size-3.5 accent-amber-700"
                      aria-label="Cash on delivery"
                    />
                    COD {cod ? "" : "(default: Prepaid)"}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="ord-discount" className="text-xs">
                        Discount %
                      </Label>
                      <Input
                        id="ord-discount"
                        type="number"
                        min="0"
                        max="100"
                        value={discountStr}
                        onChange={(e) => setDiscountStr(e.target.value)}
                        placeholder="0"
                        className="h-9 text-sm"
                        aria-label="Discount percent"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ord-delivery" className="text-xs">
                        Delivery ₹
                      </Label>
                      <Input
                        id="ord-delivery"
                        type="number"
                        min="0"
                        value={deliveryValue}
                        onChange={(e) => {
                          setDeliveryTouched(true);
                          setDeliveryStr(e.target.value);
                        }}
                        placeholder="100"
                        className="h-9 text-sm"
                        aria-label="Delivery charge"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ord-total" className="text-xs">
                      Total ₹ (optional — overrides discount &amp; delivery)
                    </Label>
                    <Input
                      id="ord-total"
                      type="number"
                      min="0"
                      value={finalAmountStr}
                      onChange={(e) => setFinalAmountStr(e.target.value)}
                      placeholder={`${revenue}`}
                      className="h-9 text-sm"
                      aria-label="Manual total amount"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopy}
                    className="flex-1"
                  >
                    <ClipboardCopy className="size-4" aria-hidden />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={confirmed || billable === 0}
                    className="flex-1"
                  >
                    {confirmed ? (
                      <>
                        <Check className="size-4" aria-hidden />
                        Order Saved
                      </>
                    ) : (
                      `Confirm & Save Order (${billable})`
                    )}
                  </Button>
                </div>
                {confirmed && (
                  <p className="text-xs text-emerald-600">
                    Order saved to history & stock updated. Generate a new bill to start another.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: matched items / review */}
        <div className="lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-stone-900">
              Review Matches
            </h2>
            {items.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400">Set all to:</span>
                {DECANT_SIZES.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => applySizeToAll(sz)}
                    className="rounded-md border border-stone-200 px-2 py-1 text-xs font-medium text-stone-600 transition-colors hover:border-amber-600 hover:bg-amber-50 hover:text-amber-800"
                  >
                    {sz}ml
                  </button>
                ))}
                <span className="ml-1 text-sm text-stone-400">
                  {items.length} item{items.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-200 bg-white p-10 text-center text-sm text-stone-400">
              Paste an order and choose <span className="font-medium">Generate Bill</span>{" "}
              to see matched perfumes and prices here.
            </div>
          ) : catalog !== null ? (
            <div className="max-h-[calc(100vh-15rem)] space-y-3 overflow-y-auto pr-1">
              {items.map((item, i) => (
                <OrderItemRow
                  key={`${item.line.index}-${i}`}
                  item={item}
                  position={i + 1}
                  catalog={catalog}
                  perfumes={perfumes}
                  costIndex={costIndex}
                  onChange={(next) => updateItem(i, next)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <SheetSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        sheetId={sheetId}
        gid={gid}
        lastSynced={lastSynced}
        syncing={syncing}
        onSave={onSetSheetConfig}
        onRefresh={onRefresh}
      />
    </div>
  );
}
