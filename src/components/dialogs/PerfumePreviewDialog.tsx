import * as Dialog from "@radix-ui/react-dialog";
import { ImageIcon, X } from "lucide-react";
import { useState } from "react";
import { formatCurrency, getStockStatus } from "../../lib/utils";
import type { DecantSize } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ImageUpload } from "../ui/ImageUpload";

export interface PerfumePreviewTarget {
  perfumeId: string | null;
  name: string;
  brand: string;
  imageUrl?: string;
  remainingMl: number | null;
  totalMl: number | null;
  costPrice: number | null;
  lineSize: DecantSize | null;
  lineMl: number;
  lineUnitPrice: number;
}

interface PerfumePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PerfumePreviewTarget | null;
  onSetImage: (perfumeId: string, imageUrl: string | null) => void;
}

const STATUS_LABEL = { ok: "In stock", low: "Low", critical: "Critical" } as const;

export function PerfumePreviewDialog({
  open,
  onOpenChange,
  target,
  onSetImage,
}: PerfumePreviewDialogProps) {
  const [zoom, setZoom] = useState(false);

  if (target === null) return null;

  const status =
    target.remainingMl !== null ? getStockStatus(target.remainingMl) : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                {target.name}
              </Dialog.Title>
              {target.brand !== "" && (
                <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                  {target.brand}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          {/* Image area */}
          {target.imageUrl !== undefined ? (
            <button
              type="button"
              onClick={() => setZoom(true)}
              className="block w-full overflow-hidden rounded-lg border border-stone-200"
              title="Click to enlarge"
            >
              <img
                src={target.imageUrl}
                alt={target.name}
                className="max-h-64 w-full object-contain bg-stone-50"
              />
            </button>
          ) : target.perfumeId !== null ? (
            <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 p-3">
              <p className="mb-2 text-xs text-stone-500">
                No image yet — add one and it'll show across the app.
              </p>
              <ImageUpload
                label="Perfume image"
                onChange={(dataUrl) => onSetImage(target.perfumeId as string, dataUrl)}
              />
            </div>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-200 bg-stone-50 text-stone-400">
              <ImageIcon className="size-6" aria-hidden />
              <span className="text-xs">Not in tracked inventory — no image</span>
            </div>
          )}

          {/* Details */}
          <div className="mt-4 space-y-2 text-sm">
            {status !== null && target.remainingMl !== null && (
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Stock</span>
                <span className="flex items-center gap-2">
                  <span className="text-stone-700">
                    {target.remainingMl.toFixed(1)} ml
                  </span>
                  <Badge variant={status}>{STATUS_LABEL[status]}</Badge>
                </span>
              </div>
            )}
            {target.costPrice !== null && target.costPrice > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Cost price</span>
                <span className="text-stone-700">{formatCurrency(target.costPrice)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-stone-100 pt-2">
              <span className="text-stone-500">This order</span>
              <span className="font-medium text-stone-800">
                {target.lineSize !== null ? `${target.lineSize}ml` : `${target.lineMl}ml`} —{" "}
                {formatCurrency(target.lineUnitPrice)}
              </span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Lightbox */}
      {zoom && target.imageUrl !== undefined && (
        <Dialog.Portal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
            role="button"
            tabIndex={0}
            aria-label="Close enlarged image"
            onClick={() => setZoom(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || e.key === "Enter" || e.key === " ") setZoom(false);
            }}
          >
            <img
              src={target.imageUrl}
              alt={target.name}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
          </div>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
