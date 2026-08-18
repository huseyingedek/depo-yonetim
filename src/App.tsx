import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import AppShell from "./components/AppShell";
import { useAppStore } from "./store/appStore";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";
import PickingListPage from "./pages/picking/PickingListPage";
import PickingDetailPage from "./pages/picking/PickingDetailPage";
import PickingSummaryPage from "./pages/picking/PickingSummaryPage";
import PickingRecordsPage from "./pages/picking/PickingRecordsPage";
import ReceivingListPage from "./pages/receiving/ReceivingListPage";
import ReceivingSupplierSelectPage from "./pages/receiving/ReceivingSupplierSelectPage";
import ReceivingDetailPage from "./pages/receiving/ReceivingDetailPage";
import ReceivingRecordsPage from "./pages/receiving/ReceivingRecordsPage";
import ReceivingSummaryPage from "./pages/receiving/ReceivingSummaryPage";
import PutawayListPage from "./pages/putaway/PutawayListPage";
import PutawayItemPage from "./pages/putaway/PutawayItemPage";
import TransferListPage from "./pages/transfer/TransferListPage";
import TransferTaskPage from "./pages/transfer/TransferTaskPage";
import CountListPage from "./pages/count/CountListPage";
import CountDetailPage from "./pages/count/CountDetailPage";
import InquiryPage from "./pages/inquiry/InquiryPage";
import LabelPrintingPage from "./pages/label-printing/LabelPrintingPage";
import PackagingLabelPage from "./pages/label-printing/PackagingLabelPage";
import WaybillLabelPage from "./pages/label-printing/WaybillLabelPage";
import ExpiryLabelPage from "./pages/label-printing/ExpiryLabelPage";
import ProductBarcodePage from "./pages/label-printing/ProductBarcodePage";
import ShelfLocationPage from "./pages/label-printing/ShelfLocationPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/home" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {}
        <Route path="/picking" element={<PickingListPage />} />
        <Route path="/picking/:id" element={<PickingDetailPage />} />
        <Route path="/picking/:id/kayitlar" element={<PickingRecordsPage />} />
        <Route path="/picking/:id/summary" element={<PickingSummaryPage />} />

        {/* Mal Kabul */}
        <Route path="/receiving" element={<ReceivingSupplierSelectPage />} />
        <Route path="/receiving/list" element={<ReceivingListPage />} />
        <Route path="/receiving/:id" element={<ReceivingDetailPage />} />
        <Route path="/receiving/:id/kayitlar" element={<ReceivingRecordsPage />} />
        <Route path="/receiving/:id/summary" element={<ReceivingSummaryPage />} />

        {}
        <Route path="/putaway" element={<PutawayListPage />} />
        <Route path="/putaway/:id" element={<PutawayItemPage />} />

        {}
        <Route path="/transfer" element={<TransferListPage />} />
        <Route path="/transfer/:id" element={<TransferTaskPage />} />

        {}
        <Route path="/count" element={<CountListPage />} />
        <Route path="/count/:id" element={<CountDetailPage />} />

        {}
        <Route path="/inquiry" element={<InquiryPage />} />

        {}
        <Route path="/label-printing" element={<LabelPrintingPage />} />
        <Route path="/label-printing/packaging" element={<PackagingLabelPage />} />
        <Route path="/label-printing/waybill" element={<WaybillLabelPage />} />
        <Route path="/label-printing/expiry" element={<ExpiryLabelPage />} />
        <Route path="/label-printing/product-barcode" element={<ProductBarcodePage />} />
        <Route path="/label-printing/shelf-location" element={<ShelfLocationPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

