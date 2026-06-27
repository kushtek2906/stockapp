import { useMemo } from "react";
import { SalesLog } from "../components/sales/SalesLog";
import { QuickSaleForm } from "../components/sales/QuickSaleForm";
import type { EditSaleInput, RecordSaleInput } from "../hooks/useInventory";
import { formatCurrency } from "../lib/utils";
import type { Brand, Perfume, Sale } from "../types";

interface SalesPageProps {
  perfumes: Perfume[];
  brands: Brand[];
  sales: Sale[];
  remainingMlMap: Record<string, number>;
  onRecord: (input: RecordSaleInput) => boolean;
  onEdit: (saleId: string, input: EditSaleInput) => void;
  onDelete: (saleId: string) => void;
}

export function SalesPage({
  perfumes,
  brands,
  sales,
  remainingMlMap,
  onRecord,
  onEdit,
  onDelete,
}: SalesPageProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const todaySales = useMemo(
    () => sales.filter((s) => s.date === todayStr),
    [sales, todayStr],
  );

  const todayRevenue = useMemo(
    () => todaySales.reduce((sum, s) => sum + s.totalPrice, 0),
    [todaySales],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Sales</h1>
          <p className="mt-1 text-sm text-stone-500">
            Record decant sales and manage transaction history.
          </p>
        </div>
        {todaySales.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
            <span className="font-medium text-emerald-600">
              Today: {todaySales.length} sale
              {todaySales.length !== 1 ? "s" : ""} ·{" "}
              {formatCurrency(todayRevenue)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <QuickSaleForm
            perfumes={perfumes}
            brands={brands}
            remainingMlMap={remainingMlMap}
            onRecord={onRecord}
          />
        </div>
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-900">
              Sales Log
            </h2>
            <span className="text-sm text-stone-400">{sales.length} total</span>
          </div>
          <SalesLog
            sales={sales}
            perfumes={perfumes}
            brands={brands}
            remainingMlMap={remainingMlMap}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
