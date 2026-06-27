import { useMemo, useState } from "react";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import type { Brand, Perfume } from "../../types";
import type { EditBrandInput } from "../../hooks/useInventory";
import { EditBrandDialog } from "../dialogs/EditBrandDialog";
import { Button } from "../ui/Button";

interface BrandsTableProps {
  brands: Brand[];
  perfumes: Perfume[];
  onEdit: (brandId: string, input: EditBrandInput) => void;
  onDelete: (brandId: string) => void;
}

export function BrandsTable({
  brands,
  perfumes,
  onEdit,
  onDelete,
}: BrandsTableProps) {
  const [editTarget, setEditTarget] = useState<Brand | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const perfumeCountMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const p of perfumes) {
      m[p.brandId] = (m[p.brandId] ?? 0) + 1;
    }
    return m;
  }, [perfumes]);

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-100 bg-stone-50/80">
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Image
            </th>
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Code
            </th>
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Brand Name
            </th>
            <th className="px-4 py-3 text-right font-medium text-stone-500">
              Perfumes
            </th>
            <th className="px-4 py-3 text-left font-medium text-stone-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {brands.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-12 text-center text-stone-400">
                No brands yet.
              </td>
            </tr>
          ) : (
            brands.map((b) => {
              const count = perfumeCountMap[b.brandId] ?? 0;
              const isConfirming = confirmDeleteId === b.brandId;
              return (
                <tr
                  key={b.brandId}
                  className="border-b border-stone-100 last:border-0 transition-colors hover:bg-stone-50/50"
                >
                  <td className="px-4 py-3">
                    {b.imageUrl !== undefined ? (
                      <img
                        src={b.imageUrl}
                        alt={b.name}
                        className="size-8 rounded-full border border-stone-200 object-cover"
                      />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded-full bg-stone-100 text-stone-400">
                        <ImageIcon className="size-4" aria-hidden />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-semibold text-amber-700">
                      {b.brandCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-stone-900">
                    {b.name}
                  </td>
                  <td className="px-4 py-3 text-right text-stone-600">
                    {count}
                  </td>
                  <td className="px-4 py-3">
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            onDelete(b.brandId);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${b.name}`}
                          onClick={() => setEditTarget(b)}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${b.name}`}
                          className="text-red-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setConfirmDeleteId(b.brandId)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {editTarget !== null && (
        <EditBrandDialog
          open={editTarget !== null}
          onOpenChange={(o) => {
            if (!o) setEditTarget(null);
          }}
          brand={editTarget}
          allBrands={brands}
          perfumeCount={perfumeCountMap[editTarget.brandId] ?? 0}
          onSave={(name, brandCode, imageUrl) => {
            onEdit(editTarget.brandId, { name, brandCode, imageUrl });
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}
