import { useState } from "react";
import { Layout } from "./components/layout/Layout";
import { loadPrefs } from "./lib/prefs";
import { useCatalog } from "./hooks/useCatalog";
import { useInventory } from "./hooks/useInventory";
import { AuditPage } from "./pages/AuditPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComparisonPage } from "./pages/ComparisonPage";
import { InventoryPage } from "./pages/InventoryPage";
import { OrderPage } from "./pages/OrderPage";
import { SalesPage } from "./pages/SalesPage";
import type { Page } from "./types";

export default function App() {
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const {
    brands,
    perfumes,
    sales,
    auditLog,
    remainingMlMap,
    totalStockValue,
    totalRevenue,
    addBrand,
    editBrand,
    deleteBrand,
    addPerfume,
    editPerfume,
    deletePerfume,
    recordSale,
    editSale,
    deleteSale,
    bulkImport,
    importCatalog,
    clearAllInventory,
  } = useInventory();
  const appPrefs = loadPrefs();
  const {
    catalog,
    lastSynced,
    syncing,
    refresh,
    setSheetConfig,
    sheetId,
    gid,
  } = useCatalog();

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {activePage === "dashboard" && (
        <DashboardPage
          perfumes={perfumes}
          brands={brands}
          sales={sales}
          totalStockValue={totalStockValue}
          totalRevenue={totalRevenue}
          remainingMlMap={remainingMlMap}
        />
      )}
      {activePage === "inventory" && (
        <InventoryPage
          perfumes={perfumes}
          brands={brands}
          sales={sales}
          remainingMlMap={remainingMlMap}
          onAddBrand={addBrand}
          onAddPerfume={addPerfume}
          onEditBrand={editBrand}
          onDeleteBrand={deleteBrand}
          onEditPerfume={editPerfume}
          onDeletePerfume={deletePerfume}
          onBulkImport={bulkImport}
          catalog={catalog}
          costSheetId={appPrefs.costSheetId}
          costSheetGid={appPrefs.costSheetGid}
          onImportCatalog={importCatalog}
          onClearAll={clearAllInventory}
        />
      )}
      {activePage === "sales" && (
        <SalesPage
          perfumes={perfumes}
          brands={brands}
          sales={sales}
          remainingMlMap={remainingMlMap}
          onRecord={recordSale}
          onEdit={editSale}
          onDelete={deleteSale}
        />
      )}
      {activePage === "order" && (
        <OrderPage
          catalog={catalog}
          perfumes={perfumes}
          onRecord={recordSale}
          syncing={syncing}
          lastSynced={lastSynced}
          onRefresh={() => {
            void refresh();
          }}
          sheetId={sheetId}
          gid={gid}
          onSetSheetConfig={setSheetConfig}
        />
      )}
      {activePage === "compare" && <ComparisonPage myCatalog={catalog} />}
      {activePage === "audit" && <AuditPage auditLog={auditLog} />}
    </Layout>
  );
}
