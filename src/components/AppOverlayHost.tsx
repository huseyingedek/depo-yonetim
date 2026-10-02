// -----------------------------------------------------------------------------
// AppOverlayHost — Yardımcı uygulamayı MEVCUT işlem ekranının ÜSTÜNDE açar.
//
// Bora'nın isteği: "Toplama yaparken menüden SKT etiketi aç, bas, kapat ve
// toplamaya kaldığın yerden devam et." Route DEĞİŞMEDİĞİ için alttaki işlem
// (PickingDetailPage vb.) DOM'da mount kalır; tüm local state + scroll korunur.
//
// Uygulamalar: components/yardimciUygulamalar.ts (Ürün Sorgulama, Barkod
// Oluşturma, SKT, Paketleme Etiketi, İrsaliye Etiketi, Depo Raf Etiketi).
// -----------------------------------------------------------------------------
import { useEffect, useRef, type ComponentType } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { useOverlayStore } from "../store/overlayStore";
import { OverlayContext } from "./overlayContext";
import InquiryPage from "../pages/inquiry/InquiryPage";
import BarcodeGeneratorPage from "../pages/label-printing/BarcodeGeneratorPage";
import ExpiryLabelPage from "../pages/label-printing/ExpiryLabelPage";
import PackagingLabelPage from "../pages/label-printing/PackagingLabelPage";
import WaybillLabelPage from "../pages/label-printing/WaybillLabelPage";
import ShelfLocationPage from "../pages/label-printing/ShelfLocationPage";
import { YARDIMCI_UYGULAMALAR } from "./yardimciUygulamalar";
import type { OverlayAppId } from "../store/overlayStore";

const BASLIK = Object.fromEntries(YARDIMCI_UYGULAMALAR.map((u) => [u.id, u.baslik])) as Record<OverlayAppId, string>;

const ICERIK: Record<OverlayAppId, ComponentType> = {
  inquiry: InquiryPage,
  barcode: BarcodeGeneratorPage,
  skt: ExpiryLabelPage,
  paketEtiket: PackagingLabelPage,
  irsaliye: WaybillLabelPage,
  rafEtiket: ShelfLocationPage,
};

export default function AppOverlayHost() {
  const openApp = useOverlayStore((s) => s.openApp);
  const close = useOverlayStore((s) => s.close);
  const { pathname } = useLocation();

  // Overlay içinden başka sayfaya gidilirse (ör. etiket ekranındaki "Ayarlar"
  // butonu) overlay kapanır; yoksa yeni sayfa overlay'in altında kalırdı.
  const ilkPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== ilkPath.current) {
      ilkPath.current = pathname;
      close();
    }
  }, [pathname, close]);

  if (!openApp) return null;

  const Icerik = ICERIK[openApp];

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
