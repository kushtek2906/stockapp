import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Brand, Perfume } from "../../types";
import { Button } from "../ui/Button";
import { ImageUpload } from "../ui/ImageUpload";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

const schema = z.object({
  name: z.string().min(1, "Perfume name is required").max(100),
  bottleMl: z.number({ error: "Must be a number > 0" }).positive("Must be > 0"),
  bottleCost: z
    .number({ error: "Must be a number ≥ 0" })
    .nonnegative("Must be ≥ 0"),
  purchaseDate: z.string().min(1, "Select a date"),
});

type FormValues = z.infer<typeof schema>;

interface EditPerfumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfume: Perfume;
  brand: Brand | undefined;
  onSave: (values: FormValues & { imageUrl?: string }) => void;
}

export function EditPerfumeDialog({
  open,
  onOpenChange,
  perfume,
  brand,
  onSave,
}: EditPerfumeDialogProps) {
  const [imageUrl, setImageUrl] = useState<string | undefined>(perfume.imageUrl);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: perfume.name,
      bottleMl: perfume.bottleMl,
      bottleCost: perfume.bottleCost,
      purchaseDate: perfume.purchaseDate,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: perfume.name,
        bottleMl: perfume.bottleMl,
        bottleCost: perfume.bottleCost,
        purchaseDate: perfume.purchaseDate,
      });
      setImageUrl(perfume.imageUrl);
    }
  }, [open, perfume, reset]);

  const onSubmit = (data: FormValues) => {
    onSave({ ...data, imageUrl });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Edit Perfume
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Update details for{" "}
                <span className="font-medium">{perfume.name}</span>.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mb-4 flex items-center gap-3 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5">
            <div>
              <p className="text-xs text-stone-400">Perfume Code</p>
              <p className="font-mono font-semibold text-amber-700">{perfume.perfumeCode}</p>
            </div>
            {brand !== undefined && (
              <>
                <div className="h-8 w-px bg-stone-200" />
                <div>
                  <p className="text-xs text-stone-400">Brand</p>
                  <p className="text-sm font-medium text-stone-700">
                    {brand.name}
                  </p>
                </div>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="edit-pfm-name">Perfume Name</Label>
                <Input
                  id="edit-pfm-name"
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
                <Label htmlFor="edit-pfm-ml">Bottle size (ml)</Label>
                <Input
                  id="edit-pfm-ml"
                  type="number"
                  min="1"
                  step="0.1"
                  {...register("bottleMl", { valueAsNumber: true })}
                />
                <p className="text-xs text-stone-400">
                  Size of one bottle — not how much is left. To change stock,
                  click the ml figure in the inventory table.
                </p>
                {errors.bottleMl !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.bottleMl.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-pfm-cost">Cost per bottle (₹)</Label>
                <Input
                  id="edit-pfm-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  {...register("bottleCost", { valueAsNumber: true })}
                />
                {errors.bottleCost !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.bottleCost.message}
                  </p>
                )}
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="edit-pfm-date">Purchase Date</Label>
                <Input
                  id="edit-pfm-date"
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

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
