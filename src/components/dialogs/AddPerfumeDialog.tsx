import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { Brand, Perfume } from "../../types";
import { loadPrefs, savePrefs } from "../../lib/prefs";
import { nextPerfumeCode, today } from "../../lib/utils";
import { Button } from "../ui/Button";
import { ImageUpload } from "../ui/ImageUpload";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

const schema = z.object({
  brandId: z.string().min(1, "Select a brand"),
  name: z.string().min(1, "Perfume name is required").max(100),
  totalMl: z.number({ error: "Must be a number > 0" }).positive("Must be > 0"),
  costPrice: z
    .number({ error: "Must be a number ≥ 0" })
    .nonnegative("Must be ≥ 0"),
  purchaseDate: z.string().min(1, "Select a date"),
});

type FormValues = z.infer<typeof schema>;

interface AddPerfumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  perfumes: Perfume[];
  onAdd: (values: FormValues & { imageUrl?: string }) => void;
}

export function AddPerfumeDialog({
  open,
  onOpenChange,
  brands,
  perfumes,
  onAdd,
}: AddPerfumeDialogProps) {
  const prefs = loadPrefs();
  const [rememberBrand, setRememberBrand] = useState(prefs.rememberLastBrand);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      purchaseDate: today(),
      brandId: rememberBrand && prefs.lastBrandId !== null ? prefs.lastBrandId : "",
    },
  });

  useEffect(() => {
    if (open && rememberBrand) {
      const currentPrefs = loadPrefs();
      if (currentPrefs.lastBrandId !== null) {
        setValue("brandId", currentPrefs.lastBrandId);
      }
    }
  }, [open, rememberBrand, setValue]);

  const selectedBrandId = useWatch({ control, name: "brandId" });
  const selectedBrand = brands.find((b) => b.brandId === selectedBrandId);
  const codePreview =
    selectedBrand !== undefined
      ? nextPerfumeCode(
          selectedBrand.brandCode,
          perfumes.map((p) => p.perfumeCode),
        )
      : null;

  const onSubmit = (data: FormValues) => {
    onAdd({ ...data, imageUrl });
    if (rememberBrand) {
      savePrefs({ rememberLastBrand: true, lastBrandId: data.brandId });
    }
    const keepBrandId = rememberBrand ? data.brandId : "";
    reset({ purchaseDate: today(), brandId: keepBrandId });
    setImageUrl(undefined);
    onOpenChange(false);
  };

  const handleToggleRemember = () => {
    const next = !rememberBrand;
    setRememberBrand(next);
    savePrefs({ rememberLastBrand: next });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Add Perfume
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Add a new bottle to your inventory.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close dialog"
                onClick={() => { reset(); setImageUrl(undefined); }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="pfm-brand">Brand</Label>
                <select
                  id="pfm-brand"
                  className="flex h-10 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  {...register("brandId")}
                >
                  <option value="">Select a brand…</option>
                  {brands.map((b) => (
                    <option key={b.brandId} value={b.brandId}>
                      {b.name} ({b.brandCode})
                    </option>
                  ))}
                </select>
                {codePreview !== null && (
                  <p className="text-xs text-amber-700">
                    Perfume code will be:{" "}
                    <span className="font-semibold">{codePreview}</span>
                  </p>
                )}
                {errors.brandId !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.brandId.message}
                  </p>
                )}
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="pfm-name">Perfume Name</Label>
                <Input
                  id="pfm-name"
                  placeholder="e.g. Oud Wood"
                  autoComplete="off"
                  {...register("name")}
                />
                {errors.name !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pfm-ml">Total ML</Label>
                <Input
                  id="pfm-ml"
                  type="number"
                  min="1"
                  step="0.1"
                  placeholder="100"
                  {...register("totalMl", { valueAsNumber: true })}
                />
                {errors.totalMl !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.totalMl.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pfm-cost">Cost Price (₹)</Label>
                <Input
                  id="pfm-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="5000"
                  {...register("costPrice", { valueAsNumber: true })}
                />
                {errors.costPrice !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.costPrice.message}
                  </p>
                )}
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="pfm-date">Purchase Date</Label>
                <Input
                  id="pfm-date"
                  type="date"
                  {...register("purchaseDate")}
                />
                {errors.purchaseDate !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.purchaseDate.message}
                  </p>
                )}
              </div>
            </div>

            <ImageUpload
              value={imageUrl}
              onChange={(v) => setImageUrl(v ?? undefined)}
              label="Perfume Image (optional)"
            />

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-500 select-none">
                <input
                  type="checkbox"
                  checked={rememberBrand}
                  onChange={handleToggleRemember}
                  className="size-3.5 accent-amber-700"
                  aria-label="Remember brand for next entry"
                />
                Remember brand for next entry
              </label>

              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { reset(); setImageUrl(undefined); }}
                  >
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={isSubmitting}>
                  Add Perfume
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
