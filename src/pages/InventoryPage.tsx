import * as Tabs from "@radix-ui/react-tabs";
import { FileJson, Plus, Sheet, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { AddBrandDialog } from "../components/dialogs/AddBrandDialog";
import { AddPerfumeDialog } from "../components/dialogs/AddPerfumeDialog";
import { ClearInventoryDialog } from "../components/dialogs/ClearInventoryDialog";
import { ImportDialog } from "../components/dialogs/ImportDialog";
import { ImportFromSheetDialog } from "../components/dialogs/ImportFromSheetDialog";
import { BrandsTable } from "../components/inventory/BrandsTable";
import { InventoryTable } from "../components/inventory/InventoryTable";
import { Button } from "../components/ui/Button";
import type {
  AddBrandInput,
  AddPerfumeInput,
  CatalogImportItem,
  CatalogImportResult,
  EditBrandInput,
  EditPerfumeInput,
} from "../hooks/useInventory";
import type { Brand, DecantCatalog, Perfume, Sale } from "../types";
import type { ImportPayload } from "../lib/importSchema";

interface InventoryPageProps {
  perfumes: Perfume[];
  brands: Brand[];
  sales: Sale[];
  remainingMlMap: Record<string, number>;
  onAddBrand: (input: AddBrandInput) => void;
  onAddPerfume: (input: AddPerfumeInput) => void;
  onEditBrand: (brandId: string, input: EditBrandInput) => void;
  onDeleteBrand: (brandId: string) => void;
  onEditPerfume: (perfumeId: string, input: EditPerfumeInput) => void;
  onDeletePerfume: (perfumeId: string) => void;
  onSetStock: (perfumeId: string, stockMl: number) => void;
  onBulkImport: (payload: ImportPayload) => void;
  catalog: DecantCatalog | null;
  costSheetId: string;
  costSheetGid: string;
  onImportCatalog: (items: CatalogImportItem[]) => CatalogImportResult;
  onClearAll: () => void;
}

const TAB_TRIGGER_CLASS =
  "px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:text-stone-900 data-[state=active]:border-b-2 data-[state=active]:border-amber-600 data-[state=active]:text-amber-700";

export function InventoryPage({
  perfumes,
  brands,
  sales,
  remainingMlMap,
  onAddBrand,
  onAddPerfume,
  onEditBrand,
  onDeleteBrand,
  onEditPerfume,
  onDeletePerfume,
  onSetStock,
  onBulkImport,
  catalog,
  costSheetId,
  costSheetGid,
  onImportCatalog,
  onClearAll,
}: InventoryPageProps) {
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [perfumeDialogOpen, setPerfumeDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Inventory</h1>
          <p className="mt-1 text-sm text-stone-500">
            Manage your perfume bottles and brand catalogue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setImportSheetOpen(true)}>
            <Sheet className="size-3.5" aria-hidden />
            Import from Sheet
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
          >
            <FileJson className="size-3.5" aria-hidden />
            Import JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClearOpen(true)}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Clear All
          </Button>
        </div>
      </div>

      <Tabs.Root defaultValue="perfumes">
        <div className="flex items-center justify-between border-b border-stone-200">
          <Tabs.List aria-label="Inventory sections" className="flex">
            <Tabs.Trigger value="perfumes" className={TAB_TRIGGER_CLASS}>
              Perfumes
              <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                {perfumes.length}
              </span>
            </Tabs.Trigger>
            <Tabs.Trigger value="brands" className={TAB_TRIGGER_CLASS}>
              Brands
              <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                {brands.length}
              </span>
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="perfumes" className="mt-0">
            <Button size="sm" onClick={() => setPerfumeDialogOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              Add Perfume
            </Button>
          </Tabs.Content>
          <Tabs.Content value="brands" className="mt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBrandDialogOpen(true)}
            >
              <Tag className="size-3.5" aria-hidden />
              Add Brand
            </Button>
          </Tabs.Content>
        </div>

        <Tabs.Content value="perfumes" className="pt-6">
          <InventoryTable
            perfumes={perfumes}
            brands={brands}
            sales={sales}
            remainingMlMap={remainingMlMap}
            onEdit={onEditPerfume}
            onDelete={onDeletePerfume}
            onSetStock={onSetStock}
          />
        </Tabs.Content>

        <Tabs.Content value="brands" className="pt-6">
          <BrandsTable
            brands={brands}
            perfumes={perfumes}
            onEdit={onEditBrand}
            onDelete={onDeleteBrand}
          />
        </Tabs.Content>
      </Tabs.Root>

      <AddBrandDialog
        open={brandDialogOpen}
        onOpenChange={setBrandDialogOpen}
        existingBrands={brands}
        onAdd={(name, brandCode, imageUrl) => onAddBrand({ name, brandCode, imageUrl })}
      />
      <AddPerfumeDialog
        open={perfumeDialogOpen}
        onOpenChange={setPerfumeDialogOpen}
        brands={brands}
        perfumes={perfumes}
        onAdd={onAddPerfume}
      />
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        existingBrands={brands}
        onImport={onBulkImport}
      />
      <ImportFromSheetDialog
        open={importSheetOpen}
        onOpenChange={setImportSheetOpen}
        catalog={catalog}
        costSheetId={costSheetId}
        costSheetGid={costSheetGid}
        onImportCatalog={onImportCatalog}
      />
      <ClearInventoryDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        counts={{
          brands: brands.length,
          perfumes: perfumes.length,
          sales: sales.length,
        }}
        onConfirm={onClearAll}
      />
    </div>
  );
}
