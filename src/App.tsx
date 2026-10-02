import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { api } from "./api/client";
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
import ReceivingWaybillPage from "./pages/receiving/ReceivingWaybillPage";
import ReceivingDetailPage from "./pages/receiving/ReceivingDetailPage";
import ReceivingRecordsPage from "./pages/receiving/ReceivingRecordsPage";
import ReceivingDimensionsPage from "./pages/receiving/ReceivingDimensionsPage";
import ReceivingSummaryPage from "./pages/receiving/ReceivingSummaryPage";
import PutawayListPage from "./pages/putaway/PutawayListPage";
import PutawayItemPage from "./pages/putaway/PutawayItemPage";
import StockTransferPage from "./pages/transfer/StockTransferPage";
import TransferListPage from "./pages/transfer/TransferListPage";
import TransferTaskPage from "./pages/transfer/TransferTaskPage";
import CountListPage from "./pages/count/CountListPage";
import CountDetailPage from "./pages/count/CountDetailPage";
import CountSummaryPage from "./pages/count/CountSummaryPage";
import CountRecordsPage from "./pages/count/CountRecordsPage";
import InquiryPage from "./pages/inquiry/InquiryPage";
import PackagingListPage from "./pages/packaging/PackagingListPage";
import PackagingPage from "./pages/packaging/PackagingPage";
import DagitimPage from "./pages/dagitim/DagitimPage";
import ReportingPage from "./pages/reporting/ReportingPage";
import LabelPrintingPage from "./pages/label-printing/LabelPrintingPage";
import PackagingLabelPage from "./pages/label-printing/PackagingLabelPage";
import WaybillLabelPage from "./pages/label-printing/WaybillLabelPage";
import ExpiryLabelPage from "./pages/label-printing/ExpiryLabelPage";
import ProductBarcodePage from "./pages/label-printing/ProductBarcodePage";
import ShelfLocationPage from "./pages/label-printing/ShelfLocationPage";
import BarcodeGeneratorPage from "./pages/label-printing/BarcodeGeneratorPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user);
  const defaultsLoaded = useAppStore((s) => s.defaultsLoaded);
  const location = useLocation();

  // Kullanıcı localStorage'da kalıcı, ayarlar ise sadece bellekte. Sayfa yenilenince
  // ayarlar boşalır → hangi ekrana girilirse girilsin önce MZYGetUserDefault bir kez çekilir.
  useEffect(() => {
    if (!user || defaultsLoaded) return;
    let iptal = false;
    api
      .getUserDefault({ user: user.username })
      .then((res) => {
        if (!iptal && res.defaults) useAppStore.getState().updateSettings(res.defaults);
      })
      .catch((err) => console.warn("Kullanıcı öndeğerleri CANIAS'tan alınamadı:", err))
      .finally(() => {
        // Hata olsa da uygulamayı kilitleme; ayar eksikse ekranlar kendi uyarısını gösterir.
        if (!iptal) useAppStore.getState().setDefaultsLoaded(true);
      });
    return () => { iptal = true; };
  }, [user, defaultsLoaded]);

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!defaultsLoaded) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-subtle">
        <RotateCw className="h-6 w-6 animate-spin text-brand-600" />
        <p className="text-sm font-semibold">Kullanıcı ayarları yükleniyor…</p>
      </div>
    );
  }
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

        { }
        <Route path="/picking" element={<PickingListPage />} />
        <Route path="/picking/:id" element={<PickingDetailPage />} />
        <Route path="/picking/:id/kayitlar" element={<PickingRecordsPage />} />
        <Route path="/picking/:id/summary" element={<PickingSummaryPage />} />

        {/* Mal Kabul */}
        <Route path="/receiving" element={<ReceivingSupplierSelectPage />} />
        <Route path="/receiving/irsaliye" element={<ReceivingWaybillPage />} />
        <Route path="/receiving/list" element={<ReceivingListPage />} />
        <Route path="/receiving/:id" element={<ReceivingDetailPage />} />
        <Route path="/receiving/:id/kayitlar" element={<ReceivingRecordsPage />} />
        <Route path="/receiving/:id/olculer" element={<ReceivingDimensionsPage />} />
        <Route path="/receiving/:id/summary" element={<ReceivingSummaryPage />} />

        { }
        <Route path="/putaway" element={<PutawayListPage />} />
        <Route path="/putaway/:id" element={<PutawayItemPage />} />

        {/* Transfer (INVT00M1) */}
        <Route path="/transfer" element={<StockTransferPage />} />
        <Route path="/transfer/tasks" element={<TransferListPage />} />
        <Route path="/transfer/:id" element={<TransferTaskPage />} />

        { }
        <Route path="/count" element={<CountListPage />} />
        <Route path="/count/:id" element={<CountDetailPage />} />
        <Route path="/count/:id/sayilanlar" element={<CountRecordsPage />} />
        <Route path="/count/:id/summary" element={<CountSummaryPage />} />

        { }
        <Route path="/inquiry" element={<InquiryPage />} />

        {/* Paketleme (tasarım aşaması) */}
        <Route path="/packaging" element={<PackagingListPage />} />
        <Route path="/packaging/pack" element={<PackagingPage />} />

        {/* Dağıtım (tasarım aşaması) */}
        <Route path="/dagitim" element={<DagitimPage />} />

        { }
        <Route path="/reporting" element={<ReportingPage />} />

        { }
        <Route path="/label-printing" element={<LabelPrintingPage />} />
        <Route path="/label-printing/packaging" element={<PackagingLabelPage />} />
        <Route path="/label-printing/waybill" element={<WaybillLabelPage />} />
        <Route path="/label-printing/expiry" element={<ExpiryLabelPage />} />
        <Route path="/label-printing/product-barcode" element={<ProductBarcodePage />} />
        <Route path="/label-printing/shelf-location" element={<ShelfLocationPage />} />
        <Route path="/label-printing/barcode-generator" element={<BarcodeGeneratorPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

