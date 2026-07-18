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
import ReceivingListPage from "./pages/receiving/ReceivingListPage";
import ReceivingDetailPage from "./pages/receiving/ReceivingDetailPage";
import ReceivingSummaryPage from "./pages/receiving/ReceivingSummaryPage";
import PutawayListPage from "./pages/putaway/PutawayListPage";
import PutawayItemPage from "./pages/putaway/PutawayItemPage";
import TransferListPage from "./pages/transfer/TransferListPage";
import TransferTaskPage from "./pages/transfer/TransferTaskPage";
import CountListPage from "./pages/count/CountListPage";
import CountDetailPage from "./pages/count/CountDetailPage";
import InquiryPage from "./pages/inquiry/InquiryPage";

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

        {/* Sipariş Toplama */}
        <Route path="/picking" element={<PickingListPage />} />
        <Route path="/picking/:id" element={<PickingDetailPage />} />
        <Route path="/picking/:id/summary" element={<PickingSummaryPage />} />

        {/* Mal Kabul */}
        <Route path="/receiving" element={<ReceivingListPage />} />
        <Route path="/receiving/:id" element={<ReceivingDetailPage />} />
        <Route path="/receiving/:id/summary" element={<ReceivingSummaryPage />} />

        {/* Yerleştirme */}
        <Route path="/putaway" element={<PutawayListPage />} />
        <Route path="/putaway/:id" element={<PutawayItemPage />} />

        {/* Transfer */}
        <Route path="/transfer" element={<TransferListPage />} />
        <Route path="/transfer/:id" element={<TransferTaskPage />} />

        {/* Sayım */}
        <Route path="/count" element={<CountListPage />} />
        <Route path="/count/:id" element={<CountDetailPage />} />

        {/* Ürün Sorgulama */}
        <Route path="/inquiry" element={<InquiryPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
