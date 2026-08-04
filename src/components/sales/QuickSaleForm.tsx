import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ImageIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Brand, Perfume } from "../../types";
import { loadPrefs, savePrefs } from "../../lib/prefs";
import { getStockStatus } from "../../lib/utils";
import type { RecordSaleInput } from "../../hooks/useInventory";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { cn } from "../../lib/utils";

const schema = z.object({
  perfumeId: z.string().min(1, "Select a perfume"),
  mlSold: z.number({ error: "Must be a number > 0" }).positive("Must be > 0"),
  totalPrice: z.number({ error: "Must be a number ≥ 0" }).nonnegative("Must be ≥ 0"),
});

type FormValues = z.infer<typeof schema>;

interface QuickSaleFormProps {
  perfumes: Perfume[];
  brands: Brand[];
  remainingMlMap: Record<string, number>;
  onRecord: (input: RecordSaleInput) => boolean;
}

const STATUS_BADGE = {
  ok: "ok",
  low: "low",
  critical: "critical",
} as const;

export function QuickSaleForm({
  perfumes,
  brands,
  remainingMlMap,
  onRecord,
}: QuickSaleFormProps) {
  const [comboQuery, setComboQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPerfume, setSelectedPerfume] = useState<Perfume | null>(null);
  const comboRef = useRef<HTMLDivElement>(null);

  const prefs = loadPrefs();
  const [rememberLast, setRememberLast] = useState(prefs.rememberLastPerfume);

  const brandMap = useMemo<Record<string, Brand>>(() => {
    const m: Record<string, Brand> = {};
    for (const b of brands) {
      m[b.brandId] = b;
    }
    return m;
  }, [brands]);

  const filteredPerfumes = useMemo(() => {
    const q = comboQuery.toLowerCase().trim();
    if (q === "") return perfumes;
    return perfumes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (brandMap[p.brandId]?.name ?? "").toLowerCase().includes(q) ||
        p.perfumeCode.toLowerCase().includes(q),
    );
  }, [perfumes, brandMap, comboQuery]);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { perfumeId: "", mlSold: undefined, totalPrice: undefined },
  });

  useEffect(() => {
    const currentPrefs = loadPrefs();
    if (currentPrefs.rememberLastPerfume && currentPrefs.lastPerfumeId !== null) {
      const last = perfumes.find((p) => p.perfumeId === currentPrefs.lastPerfumeId);
      if (last !== undefined) {
        setSelectedPerfume(last);
        setComboQuery(last.name);
        setValue("perfumeId", last.perfumeId, { shouldValidate: false });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (comboRef.current !== null && !comboRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectPerfume = (p: Perfume) => {
    setSelectedPerfume(p);
    setComboQuery(p.name);
    setValue("perfumeId", p.perfumeId, { shouldValidate: true });
    setIsOpen(false);
  };

  const clearSelection = () => {
    setSelectedPerfume(null);
    setComboQuery("");
    setValue("perfumeId", "", { shouldValidate: false });
  };

  const handleToggleRemember = () => {
    const next = !rememberLast;
    setRememberLast(next);
    savePrefs({ rememberLastPerfume: next });
  };

  const onSubmit = (data: FormValues) => {
    const success = onRecord({
      perfumeId: data.perfumeId,
      mlSold: data.mlSold,
      totalPrice: data.totalPrice,
    });
    if (success) {
      if (rememberLast) {
        savePrefs({ lastPerfumeId: data.perfumeId });
        reset({ perfumeId: data.perfumeId, mlSold: undefined, totalPrice: undefined });
      } else {
        reset({ perfumeId: "", mlSold: undefined, totalPrice: undefined });
        clearSelection();
      }
    }
  };

  const remaining =
    selectedPerfume !== null
      ? (remainingMlMap[selectedPerfume.perfumeId] ?? 0)
      : null;
  const status =
    remaining !== null ? getStockStatus(remaining) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Sale Entry</CardTitle>
        <p className="text-sm text-stone-500">
          Record a decant sale and update stock automatically.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <input type="hidden" {...register("perfumeId")} />

          <div className="space-y-1.5">
            <Label htmlFor="sale-perfume-input">Perfume</Label>
            <div ref={comboRef} className="relative">
              <div className="relative">
                <Input
                  id="sale-perfume-input"
                  role="combobox"
                  aria-expanded={isOpen}
                  aria-autocomplete="list"
                  autoComplete="off"
                  placeholder="Search perfume by name, brand, or code…"
                  value={comboQuery}
                  onChange={(e) => {
                    setComboQuery(e.target.value);
                    setIsOpen(true);
                    if (selectedPerfume !== null) {
                      setSelectedPerfume(null);
                      setValue("perfumeId", "");
                    }
                  }}
                  onFocus={() => setIsOpen(true)}
                  className="pr-16"
                />
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  {selectedPerfume !== null && (
                    <button
                      type="button"
                      aria-label="Clear perfume selection"
                      onClick={clearSelection}
                      className="rounded p-0.5 text-stone-400 hover:text-stone-600"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                  <ChevronDown
                    className={cn(
                      "size-4 text-stone-400 transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </div>
              </div>

              {isOpen && filteredPerfumes.length > 0 && (
                <ul
                  role="listbox"
                  aria-label="Perfume options"
                  className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
                >
                  {filteredPerfumes.map((p) => {
                    const rem = remainingMlMap[p.perfumeId] ?? 0;
                    const s = getStockStatus(rem);
                    return (
                      <li
                        key={p.perfumeId}
                        role="option"
                        aria-selected={selectedPerfume?.perfumeId === p.perfumeId}
                        className={cn(
                          "flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm hover:bg-stone-50",
                          selectedPerfume?.perfumeId === p.perfumeId &&
                            "bg-amber-50",
                        )}
                        onMouseDown={() => selectPerfume(p)}
                      >
                        <div className="flex items-center gap-2.5">
                          {p.imageUrl !== undefined ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="size-6 rounded border border-stone-200 object-cover shrink-0"
                            />
                          ) : (
                            <span className="flex size-6 items-center justify-center rounded bg-stone-100 text-stone-400 shrink-0">
                              <ImageIcon className="size-3.5" aria-hidden />
                            </span>
                          )}
                          <div>
                            <p className="font-medium text-stone-900">{p.name}</p>
                            <p className="text-xs text-stone-400">
                              {brandMap[p.brandId]?.name ?? "—"} · <span className="font-mono text-amber-700">{p.perfumeCode}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-stone-500">
                            {rem.toFixed(1)} ml
                          </span>
                          <Badge variant={STATUS_BADGE[s]} className="text-[10px]">
                            {s}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-500 select-none">
              <input
                type="checkbox"
                checked={rememberLast}
                onChange={handleToggleRemember}
                className="size-3.5 accent-amber-700"
                aria-label="Remember last perfume selection"
              />
              Remember last selection
            </label>

            {selectedPerfume !== null && remaining !== null && status !== null && (
              <div className="flex items-center gap-2 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
                <span className="text-xs text-stone-500">
                  <span className="font-medium text-stone-700">
                    {remaining.toFixed(1)} ml
                  </span>{" "}
                  remaining
                </span>
                <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
              </div>
            )}

            {errors.perfumeId !== undefined && (
              <p className="text-xs text-red-500" role="alert">
                {errors.perfumeId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sale-ml">ML Sold</Label>
              <Input
                id="sale-ml"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 5"
                {...register("mlSold", { valueAsNumber: true })}
              />
              {errors.mlSold !== undefined && (
                <p className="text-xs text-red-500" role="alert">
                  {errors.mlSold.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sale-price">Sale Price (₹)</Label>
              <Input
                id="sale-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 350"
                {...register("totalPrice", { valueAsNumber: true })}
              />
              {errors.totalPrice !== undefined && (
                <p className="text-xs text-red-500" role="alert">
                  {errors.totalPrice.message}
                </p>
              )}
            </div>
          </div>

          <Button type="submit" className="w-full">
            Record Sale
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
