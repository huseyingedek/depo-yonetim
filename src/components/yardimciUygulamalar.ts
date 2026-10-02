// -----------------------------------------------------------------------------
// Yardımcı Uygulamalar — TEK liste (Bora: "teke düşsün", "bir kalksın").
// Eskiden menüde hem "Yardımcı İşlemler" (ayrı sayfa) hem "Yardımcı Uygulamalar"
// (açılır alt menü) vardı; aynı ekranlar iki yerde görünüyordu. Artık yalnızca
// bu 6 uygulama var; masaüstü sol menü ve mobil sağ FAB aynı listeyi kullanır.
// Hepsi işlem kapanmadan üstte overlay olarak açılır (AppOverlayHost).
// -----------------------------------------------------------------------------
import { ScanSearch, Barcode, CalendarDays, Package, FileText, Warehouse, type LucideIcon } from "lucide-react";
import type { OverlayAppId } from "../store/overlayStore";

export interface YardimciUygulama {
  id: OverlayAppId;
  icon: LucideIcon;
  label: string; // menüdeki ad
  short: string; // mobil radyal menüdeki kısa ad
  baslik: string; // overlay üst şeridindeki ad
}

export const YARDIMCI_UYGULAMALAR: YardimciUygulama[] = [
  { id: "inquiry", icon: ScanSearch, label: "Ürün Sorgulama", short: "Sorgu", baslik: "Stok Sorgulama" },
  { id: "barcode", icon: Barcode, label: "Barkod Oluşturma", short: "Barkod", baslik: "Barkod Oluşturma" },
  { id: "skt", icon: CalendarDays, label: "SKT Etiketi", short: "SKT", baslik: "SKT Etiketi" },
  { id: "paketEtiket", icon: Package, label: "Paketleme Etiketi", short: "Paket", baslik: "Paketleme Etiketi" },
  { id: "irsaliye", icon: FileText, label: "İrsaliye Etiketi", short: "İrsaliye", baslik: "İrsaliye Etiketi" },
  { id: "rafEtiket", icon: Warehouse, label: "Depo Raf Etiketi", short: "Raf", baslik: "Depo Raf Etiketi" },
];
