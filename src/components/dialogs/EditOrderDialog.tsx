import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { EditOrderInput, OrderItemInput } from "../../hooks/useInventory";
import { loadPrefs } from "../../lib/prefs";
import { computeChargedTotal } from "../../lib/order";
import { DECANT_SIZES, type Brand, type DecantSize, type Order, type Perfume } from "../../types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  perfumes: Perfume[];
  brands: Brand[];
  /** Saves the edited order; stock is adjusted (and may go negative). Returns
   * true on success so the dialog closes — insufficient stock only warns. */
  onSave: (orderId: string, input: EditOrderInput) => boolean;
}

interface EditableLine {
  perfumeId: string | null;
  perfumeName: string;
  brand: string;
  mlSold: number;
  unitPrice: number;
}

function sizeFromMl(ml: number): DecantSize | null {
  return (DECANT_SIZES as number[]).includes(ml) ? (ml as DecantSize) : null;
}

export function EditOrderDialog({
  open,
  onOpenChange,
  order,
  perfumes,
  brands,
  onSave,
}: EditOrderDialogProps) {
  const [name, setName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.customerPhone);
  const [address, setAddress] = useState(order.customerAddress);
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [email, setEmail] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [boxId, setBoxId] = useState("");
  const [weightStr, setWeightStr] = useState("");
  const [cod, setCod] = useState(false);
  const [discountStr, setDiscountStr] = useState("");
  const [deliveryStr, setDeliveryStr] = useState("100");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [addId, setAddId] = useState("");

  const boxes = useMemo(() => loadPrefs().boxes, []);

  const brandMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const b of brands) m[b.brandId] = b.name;
    return m;
  }, [brands]);

  useEffect(() => {
    if (open) {
      setName(order.customerName);
      setPhone(order.customerPhone);
      setAddress(order.customerAddress);
      setCity(order.customerCity ?? "");
      setPincode(order.customerPincode ?? "");
      setEmail(order.customerEmail ?? "");
      setAltPhone(order.customerAltPhone ?? "");
      setBoxId(order.boxId ?? boxes[0]?.id ?? "");
      setWeightStr(order.weightG != null ? String(order.weightG) : "");
      setCod((order.paymentMode ?? "Prepaid") === "COD");
      setDiscountStr(order.discountPct ? String(order.discountPct) : "");
      setDeliveryStr(
        order.deliveryCharge != null ? String(order.deliveryCharge) : "100",
      );
      setLines(
        order.items.map((i) => ({
          perfumeId: i.perfumeId,
          perfumeName: i.perfumeName,
          brand: i.brand,
          mlSold: i.mlSold,
          unitPrice: i.unitPrice,
        })),
      );
      setAddId("");
    }
  }, [open, order, boxes]);

  const updateLine = (idx: number, patch: Partial<EditableLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };
  const addLine = (perfumeId: string) => {
    const p = perfumes.find((pf) => pf.perfumeId === perfumeId);
    if (p === undefined) return;
    setLines((prev) => [
      ...prev,
      {
        perfumeId: p.perfumeId,
        perfumeName: p.name,
        brand: brandMap[p.brandId] ?? "",
        mlSold: 5,
        unitPrice: 0,
      },
    ]);
    setAddId("");
  };

  const total = lines.reduce((sum, l) => sum + (Number(l.unitPrice) || 0), 0);
  const chargedTotal = computeChargedTotal(
    total,
    Math.max(0, Number(discountStr) || 0),
    Math.max(0, Number(deliveryStr) || 0),
  );

  const handleSave = () => {
    const items: OrderItemInput[] = lines.map((l) => ({
      perfumeId: l.perfumeId,
      perfumeName: l.perfumeName,
      brand: l.brand,
      size: sizeFromMl(Number(l.mlSold) || 0),
      mlSold: Number(l.mlSold) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    }));
    const weight = weightStr.trim() === "" ? null : Number(weightStr);
    const ok = onSave(order.id, {
      customerName: name,
      customerAddress: address,
      customerPhone: phone,
      customerCity: city,
      customerPincode: pincode,
      customerEmail: email,
      customerAltPhone: altPhone,
      weightG: weight !== null && Number.isFinite(weight) ? weight : null,
      boxId: boxId || null,
      paymentMode: cod ? "COD" : "Prepaid",
      discountPct: Math.max(0, Number(discountStr) || 0),
      deliveryCharge: Math.max(0, Number(deliveryStr) || 0),
      items,
    });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Edit Order
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Changing quantities, removing or adding lines adjusts stock to match.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {/* Customer */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="eo-name" className="text-xs">Name</Label>
                  <Input id="eo-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eo-phone" className="text-xs">Phone</Label>
                  <Input id="eo-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eo-alt" className="text-xs">Alternate phone</Label>
                  <Input id="eo-alt" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eo-email" className="text-xs">Email</Label>
                  <Input id="eo-email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="eo-address" className="text-xs">Address</Label>
                <Input id="eo-address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="eo-city" className="text-xs">City</Label>
                  <Input id="eo-city" value={city} onChange={(e) => setCity(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eo-pin" className="text-xs">Pincode</Label>
                  <Input id="eo-pin" value={pincode} onChange={(e) => setPincode(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>

              {/* Shipping & payment */}
              <div className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-2">
                <div className="space-y-1">
                  <Label htmlFor="eo-box" className="text-xs">Box</Label>
                  <select
                    id="eo-box"
                    value={boxId}
                    onChange={(e) => setBoxId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-stone-200 bg-white px-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eo-weight" className="text-xs">Weight (g, optional)</Label>
                  <Input id="eo-weight" type="number" min="0" value={weightStr} onChange={(e) => setWeightStr(e.target.value)} className="h-9 text-sm" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-600 select-none">
                  <input
                    type="checkbox"
                    checked={cod}
                    onChange={(e) => setCod(e.target.checked)}
                    className="size-3.5 accent-amber-700"
                  />
                  COD (else Prepaid)
                </label>
                <div className="space-y-1">
                  <Label htmlFor="eo-discount" className="text-xs">Discount %</Label>
                  <Input id="eo-discount" type="number" min="0" max="100" value={discountStr} onChange={(e) => setDiscountStr(e.target.value)} placeholder="0" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="eo-delivery" className="text-xs">Delivery ₹</Label>
                  <Input id="eo-delivery" type="number" min="0" value={deliveryStr} onChange={(e) => setDeliveryStr(e.target.value)} placeholder="100" className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Lines */}
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_5rem_5rem_2rem] items-center gap-2 px-1 text-xs font-medium text-stone-400">
                <span>Item</span>
                <span>ml</span>
                <span>₹ price</span>
                <span />
              </div>
              {lines.map((l, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_5rem_5rem_2rem] items-center gap-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-800">{l.perfumeName}</p>
                    <p className="truncate text-xs text-stone-400">
                      {l.brand !== "" ? l.brand : "—"}
                      {l.perfumeId === null && " · not tracked"}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={String(l.mlSold)}
                    onChange={(e) => updateLine(idx, { mlSold: Number(e.target.value) })}
                    className="h-9 text-sm"
                    aria-label={`${l.perfumeName} ml`}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={String(l.unitPrice)}
                    onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })}
                    className="h-9 text-sm"
                    aria-label={`${l.perfumeName} price`}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    aria-label={`Remove ${l.perfumeName}`}
                    className="flex size-8 items-center justify-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              {lines.length === 0 && (
                <p className="px-1 text-xs text-stone-400">No items — add one below.</p>
              )}

              {/* Add a line */}
              <div className="flex items-center gap-2 pt-1">
                <Plus className="size-4 text-stone-400" aria-hidden />
                <select
                  value={addId}
                  onChange={(e) => {
                    if (e.target.value !== "") addLine(e.target.value);
                  }}
                  className="h-9 flex-1 rounded-lg border border-stone-200 bg-white px-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  aria-label="Add a perfume to this order"
                >
                  <option value="">Add a perfume…</option>
                  {[...perfumes]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.perfumeId} value={p.perfumeId}>
                        {p.name}
                        {brandMap[p.brandId] ? ` — ${brandMap[p.brandId]}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4">
            <span className="text-sm text-stone-500">
              Total: <span className="font-semibold text-stone-900">₹{chargedTotal}</span>
              {chargedTotal !== total && (
                <span className="ml-1 text-xs text-stone-400">(items ₹{total})</span>
              )}
            </span>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="button" onClick={handleSave}>
                Save changes
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
