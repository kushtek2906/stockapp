import { useMemo, useState } from "react";
import { Layout } from "./components/layout/Layout";
import { loadPrefs } from "./lib/prefs";
import { applyPricebookToCatalog, pendingPublishUpdates } from "./lib/pricebook";
import { useCatalog } from "./hooks/useCatalog";
import { useInventory } from "./hooks/useInventory";
import { AuditPage } from "./pages/AuditPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComparisonPage } from "./pages/ComparisonPage";
import { CostsPage } from "./pages/CostsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { OrderPage } from "./pages/OrderPage";
import { OrderHistoryPage } from "./pages/OrderHistoryPage";
import { PricingPage } from "./pages/PricingPage";
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
    totalInvestment,
    totalRevenue,
    totalProfit,
    addBrand,
    editBrand,
    deleteBrand,
    addPerfume,
    editPerfume,
    deletePerfume,
    setPerfumeImage,
    setPerfumeStock,
    recordSale,
    editSale,
    deleteSale,
    bulkImport,
    importCatalog,
    clearAllInventory,
    setPerfumeCost,
    pricebook,
    setPrice,
    orders,
    confirmOrder,
    deleteOrder,
    editOrder,
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

  // The effective catalog: sheet names/inspiration with app-owned prices layered
  // on top. Order pricing, profit and comparisons all read this.
  const effectiveCatalog = useMemo(
    () => applyPricebookToCatalog(catalog, pricebook),
    [catalog, pricebook],
  );
  // App-owned prices that differ from the live sheet — the "unpublished" set.
  const pendingUpdates = useMemo(
    () => pendingPublishUpdates(catalog, pricebook),
    [catalog, pricebook],
  );

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {activePage === "dashboard" && (
        <DashboardPage
          sales={sales}
          totalInvestment={totalInvestment}
          totalRevenue={totalRevenue}
          totalProfit={totalProfit}
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
          onSetStock={setPerfumeStock}
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
          catalog={effectiveCatalog}
          perfumes={perfumes}
          onConfirmOrder={confirmOrder}
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
      {activePage === "history" && (
        <OrderHistoryPage
          orders={orders}
          perfumes={perfumes}
          brands={brands}
          remainingMlMap={remainingMlMap}
          onDelete={deleteOrder}
          onEdit={editOrder}
          onSetPerfumeImage={setPerfumeImage}
        />
      )}
      {activePage === "compare" && <ComparisonPage myCatalog={effectiveCatalog} />}
      {activePage === "costs" && (
        <CostsPage
          perfumes={perfumes}
          brands={brands}
          onSetCost={setPerfumeCost}
        />
      )}
      {activePage === "pricing" && (
        <PricingPage
          catalog={effectiveCatalog}
          perfumes={perfumes}
          brands={brands}
          pricebook={pricebook}
          pendingUpdates={pendingUpdates}
          onSetPrice={setPrice}
          onPublished={() => {
            void refresh();
          }}
          syncing={syncing}
          onRefresh={() => {
            void refresh();
          }}
        />
      )}
      {activePage === "audit" && <AuditPage auditLog={auditLog} />}
    </Layout>
  );
}
