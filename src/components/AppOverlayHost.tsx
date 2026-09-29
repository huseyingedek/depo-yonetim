// -----------------------------------------------------------------------------
// AppOverlayHost — Yardımcı uygulamayı MEVCUT işlem ekranının ÜSTÜNDE açar.
//
// Bora'nın isteği: "Toplama yaparken menüden SKT etiketi aç, bas, kapat ve
// toplamaya kaldığın yerden devam et." Route DEĞİŞMEDİĞİ için alttaki işlem
// (PickingDetailPage vb.) DOM'da mount kalır; tüm local state + scroll korunur.
//
// İlk sürüm (Bora onayı sonrası genişletilecek): Ürün Sorgulama, Barkod
// Oluşturma, SKT Etiketi.
// -----------------------------------------------------------------------------
import { X } from "lucide-react";
import { useOverlayStore } from "../store/overlayStore";
import { OverlayContext } from "./overlayContext";
import InquiryPage from "../pages/inquiry/InquiryPage";
import BarcodeGeneratorPage from "../pages/label-printing/BarcodeGeneratorPage";
import ExpiryLabelPage from "../pages/label-printing/ExpiryLabelPage";

const BASLIK: Record<string, string> = {
  inquiry: "Stok Sorgulama",
  barcode: "Barkod Oluşturma",
  skt: "SKT Etiketi",
};

export default function AppOverlayHost() {
  const openApp = useOverlayStore((s) => s.openApp);
  const close = useOverlayStore((s) => s.close);

  if (!openApp) return null;

  const Icerik =
    openApp === "inquiry"
      ? InquiryPage
      : openApp === "barcode"
      ? BarcodeGeneratorPage
      : ExpiryLabelPage;

  return (
    <OverlayContext.Provider value={{ close }}>
      {/* Tam ekran overlay — z alt menünün (z-50) ve FAB'ın üstünde. */}
      <div className="app-bg fixed inset-0 z-[60] flex flex-col animate-fade-in">
        {/* Üst şerit: "yardımcı uygulama" olduğunu belli eder + İşleme Dön (kapat). */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface/95 px-3 backdrop-blur">
          <span className="flex items-center gap-2 text-[12px] font-bold text-brand-600">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-brand-500" />
            <span className="truncate">Yardımcı Uygulama · {BASLIK[openApp]}</span>
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="İşleme dön"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-muted transition hover:bg-elevated hover:text-fg active:scale-95"
          >
            İşleme Dön
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* İçerik — yardımcı sayfa kendi başlığı/adımlarıyla burada. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <Icerik />
        </div>
      </div>
    </OverlayContext.Provider>
  );
}
