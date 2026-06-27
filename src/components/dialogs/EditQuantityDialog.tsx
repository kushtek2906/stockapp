import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Perfume } from "../../types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

interface EditQuantityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  perfume: Perfume;
  remainingMl: number;
  /** Persist the new total stock quantity (ml) for this perfume. */
  onSave: (totalMl: number) => void;
}

export function EditQuantityDialog({
  open,
  onOpenChange,
  perfume,
  remainingMl,
  onSave,
}: EditQuantityDialogProps) {
  const [value, setValue] = useState(String(perfume.totalMl));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(String(perfume.totalMl));
      setError(null);
    }
  }, [open, perfume]);

  const soldMl = Math.max(0, perfume.totalMl - remainingMl);

  const handleSave = () => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      setError("Enter a quantity of 0 or more.");
      return;
    }
    if (num < soldMl) {
      setError(
        `At least ${soldMl} ml already sold — quantity can't be below that.`,
      );
      return;
    }
    onSave(num);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Set Stock Quantity
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                <span className="font-medium">{perfume.name}</span> ·{" "}
                <span className="font-mono text-amber-700">
                  {perfume.perfumeCode}
                </span>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qty-ml">Total stock (ml)</Label>
              <Input
                id="qty-ml"
                type="number"
                min="0"
                step="1"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              {error !== null && (
                <p className="text-xs text-red-500" role="alert">
                  {error}
                </p>
              )}
              {soldMl > 0 && (
                <p className="text-xs text-stone-400">
                  {soldMl} ml already sold · remaining shown in the table is
                  total minus sold.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
