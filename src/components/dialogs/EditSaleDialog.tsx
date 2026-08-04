import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Perfume, Sale } from "../../types";
import { formatDate } from "../../lib/utils";
import type { EditSaleInput } from "../../hooks/useInventory";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

const schema = z.object({
  mlSold: z.number({ error: "Must be a number > 0" }).positive("Must be > 0"),
  totalPrice: z
    .number({ error: "Must be a number ≥ 0" })
    .nonnegative("Must be ≥ 0"),
});

type FormValues = EditSaleInput;

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  perfume: Perfume | undefined;
  remainingMlMap: Record<string, number>;
  onSave: (input: EditSaleInput) => void;
}

export function EditSaleDialog({
  open,
  onOpenChange,
  sale,
  perfume,
  remainingMlMap,
  onSave,
}: EditSaleDialogProps) {
  // Stock this perfume would have if this sale's ml were returned — shown as a
  // hint only. Editing beyond it is allowed (stock can go negative).
  const availableIfReverted =
    (remainingMlMap[sale.perfumeId] ?? 0) + sale.mlSold;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { mlSold: sale.mlSold, totalPrice: sale.totalPrice },
  });

  useEffect(() => {
    if (open) {
      reset({ mlSold: sale.mlSold, totalPrice: sale.totalPrice });
    }
  }, [open, sale, reset]);

  const onSubmit = (data: FormValues) => {
    onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Edit Sale
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                Correct this sale record.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-slate-800">
              {perfume?.name ?? "Unknown Perfume"}
            </p>
            <p className="text-xs text-slate-400">
              {perfume?.perfumeCode ?? sale.perfumeId} · {formatDate(sale.date)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Available:{" "}
              <span className="font-medium">
                {availableIfReverted.toFixed(1)} ml
              </span>{" "}
              (you can exceed it — stock will go negative)
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-sale-ml">ML Sold</Label>
                <Input
                  id="edit-sale-ml"
                  type="number"
                  min="1"
                  step="1"
                  {...register("mlSold", { valueAsNumber: true })}
                />
                {errors.mlSold !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.mlSold.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-sale-price">Sale Price (₹)</Label>
                <Input
                  id="edit-sale-price"
                  type="number"
                  min="0"
                  step="0.01"
                  {...register("totalPrice", { valueAsNumber: true })}
                />
                {errors.totalPrice !== undefined && (
                  <p className="text-xs text-red-500" role="alert">
                    {errors.totalPrice.message}
                  </p>
                )}
              </div>
            </div>

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
