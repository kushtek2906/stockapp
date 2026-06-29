import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadPrefs, savePrefs } from "../../lib/prefs";
import type { BoxType } from "../../types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface BoxSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function BoxSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: BoxSettingsDialogProps) {
  const [boxes, setBoxes] = useState<BoxType[]>([]);

  useEffect(() => {
    if (open) setBoxes(loadPrefs().boxes.map((b) => ({ ...b })));
  }, [open]);

  const update = (idx: number, patch: Partial<BoxType>) => {
    setBoxes((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const handleSave = () => {
    savePrefs({ boxes });
    onSaved();
    onOpenChange(false);
    toast.success("Box sizes saved.");
  };

  const numField = (idx: number, key: keyof BoxType, value: number) => (
    <Input
      type="number"
      min="0"
      value={String(value)}
      onChange={(e) => update(idx, { [key]: Number(e.target.value) } as Partial<BoxType>)}
      className="h-9 text-sm"
      aria-label={`${key}`}
    />
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Box sizes
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                These fill the length/height/width and default weight in the pickup CSV.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_4rem_4rem_4rem_5rem] gap-2 px-1 text-xs font-medium text-stone-400">
              <span>Name</span>
              <span>L (cm)</span>
              <span>W (cm)</span>
              <span>H (cm)</span>
              <span>Wt (g)</span>
            </div>
            {boxes.map((b, idx) => (
              <div key={b.id} className="grid grid-cols-[1fr_4rem_4rem_4rem_5rem] gap-2">
                <Input
                  value={b.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  className="h-9 text-sm"
                  aria-label="Box name"
                />
                {numField(idx, "lengthCm", b.lengthCm)}
                {numField(idx, "widthCm", b.widthCm)}
                {numField(idx, "heightCm", b.heightCm)}
                {numField(idx, "weightG", b.weightG)}
              </div>
            ))}
            <p className="text-xs text-stone-400">
              Tip: the per-order weight (if entered) overrides a box's default weight.
            </p>
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
