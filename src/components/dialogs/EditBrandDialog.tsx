import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Brand } from "../../types";
import { Button } from "../ui/Button";
import { ImageUpload } from "../ui/ImageUpload";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

function buildSchema(brand: Brand, existingBrands: Brand[]) {
  const otherCodes = existingBrands
    .filter((b) => b.brandId !== brand.brandId)
    .map((b) => b.brandCode.toUpperCase());

  return z.object({
    name: z.string().min(1, "Brand name is required").max(80),
    brandCode: z
      .string()
      .min(1, "Brand code is required")
      .max(6, "Max 6 characters")
      .regex(/^[A-Z0-9]+$/i, "Letters and numbers only")
      .refine(
        (val) => !otherCodes.includes(val.toUpperCase()),
        "This code is already taken by another brand",
      ),
  });
}

type FormValues = { name: string; brandCode: string };

interface EditBrandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand;
  allBrands: Brand[];
  perfumeCount: number;
  onSave: (name: string, brandCode: string, imageUrl?: string) => void;
}

export function EditBrandDialog({
  open,
  onOpenChange,
  brand,
  allBrands,
  perfumeCount,
  onSave,
}: EditBrandDialogProps) {
  const schema = buildSchema(brand, allBrands);
  const [imageUrl, setImageUrl] = useState<string | undefined>(brand.imageUrl);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: brand.name, brandCode: brand.brandCode },
  });

  useEffect(() => {
    if (open) {
      reset({ name: brand.name, brandCode: brand.brandCode });
      setImageUrl(brand.imageUrl);
    }
  }, [open, brand, reset]);

  const onSubmit = (data: FormValues) => {
    onSave(data.name, data.brandCode.toUpperCase(), imageUrl);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Edit Brand
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Update brand details for{" "}
                <span className="font-medium">{brand.name}</span>.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          {perfumeCount > 0 && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
              <p>
                Changing the brand code will rename all{" "}
                <strong>{perfumeCount}</strong> perfume codes for this brand.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand-name">Brand Name</Label>
              <Input
                id="edit-brand-name"
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
              <Label htmlFor="edit-brand-code">Brand Code</Label>
              <Input
                id="edit-brand-code"
                autoComplete="off"
                className="uppercase"
                maxLength={6}
                {...register("brandCode")}
                onChange={(e) => {
                  setValue(
                    "brandCode",
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    { shouldValidate: true },
                  );
                }}
              />
              <p className="text-xs text-stone-400">
                Current: <strong>{brand.brandCode}</strong>
              </p>
              {errors.brandCode !== undefined && (
                <p className="text-xs text-red-500" role="alert">
                  {errors.brandCode.message}
                </p>
              )}
            </div>

            <ImageUpload
              value={imageUrl}
              onChange={(v) => setImageUrl(v ?? undefined)}
              label="Brand Image (optional)"
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
