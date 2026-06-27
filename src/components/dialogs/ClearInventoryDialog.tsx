import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

const CONFIRM_WORD = "DELETE";

interface ClearInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: { brands: number; perfumes: number; sales: number };
  onConfirm: () => void;
}

/**
 * Destructive: wipes ALL brands, perfumes and sales. Two safety layers — an
 * explicit red warning with counts, and a type-"DELETE"-to-enable confirm button.
 */
export function ClearInventoryDialog({
  open,
  onOpenChange,
  counts,
  onConfirm,
}: ClearInventoryDialogProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;
  const nothingToClear =
    counts.brands === 0 && counts.perfumes === 0 && counts.sales === 0;

  const handleConfirm = () => {
    if (!armed) return;
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="size-5" aria-hidden />
              </span>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Clear all inventory?
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-stone-600">
            This permanently removes{" "}
            <span className="font-medium text-stone-900">
              {counts.brands} brand{counts.brands !== 1 ? "s" : ""},{" "}
              {counts.perfumes} perfume{counts.perfumes !== 1 ? "s" : ""}
            </span>{" "}
            and{" "}
            <span className="font-medium text-stone-900">
              {counts.sales} sale{counts.sales !== 1 ? "s" : ""}
            </span>
            . This cannot be undone.
          </Dialog.Description>

          {nothingToClear ? (
            <p className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-500">
              The inventory is already empty.
            </p>
          ) : (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="clear-confirm">
                Type <span className="font-mono font-semibold text-red-600">{CONFIRM_WORD}</span>{" "}
                to confirm
              </Label>
              <Input
                id="clear-confirm"
                autoFocus
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                }}
                placeholder={CONFIRM_WORD}
              />
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={!armed || nothingToClear}
            >
              Delete everything
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
