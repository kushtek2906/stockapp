import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { Brand } from "../../types";
import { generateBrandCode } from "../../lib/utils";
import { Button } from "../ui/Button";
import { ImageUpload } from "../ui/ImageUpload";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

function buildSchema(existingCodes: string[]) {
  return z.object({
    name: z.string().min(1, "Brand name is required").max(80),
    brandCode: z
      .string()
      .min(1, "Brand code is required")
      .max(6, "Max 6 characters")
      .regex(/^[A-Z0-9]+$/i, "Letters and numbers only")
      .refine(
        (val) =>
          !existingCodes
            .map((c) => c.toUpperCase())
            .includes(val.toUpperCase()),
        "This code is already taken",
      ),
  });
}

type FormValues = { name: string; brandCode: string };

interface AddBrandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingBrands: Brand[];
  onAdd: (name: string, brandCode: string, imageUrl?: string) => void;
}

export function AddBrandDialog({
  open,
  onOpenChange,
  existingBrands,
  onAdd,
}: AddBrandDialogProps) {
  const existingCodes = existingBrands.map((b) => b.brandCode);
  const schema = buildSchema(existingCodes);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", brandCode: "" },
  });

  const nameValue = useWatch({ control, name: "name" });

  useEffect(() => {
    if (nameValue.length > 0) {
      const suggestion = generateBrandCode(nameValue);
      setValue("brandCode", suggestion.toUpperCase(), { shouldValidate: false });
    }
  }, [nameValue, setValue]);

  const onSubmit = (data: FormValues) => {
    onAdd(data.name, data.brandCode.toUpperCase(), imageUrl);
    reset();
    setImageUrl(undefined);
    onOpenChange(false);
  };

  const handleClose = () => {
    reset();
    setImageUrl(undefined);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Add Brand
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Create a new perfume brand with a unique code.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close dialog"
                onClick={handleClose}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Brand Name</Label>
              <Input
                id="brand-name"
                placeholder="e.g. Tom Ford"
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
              <Label htmlFor="brand-code">Brand Code</Label>
              <Input
                id="brand-code"
                placeholder="e.g. TF"
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
                2–6 characters. Auto-suggested from name — you can change it.
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={isSubmitting}>
                Add Brand
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
