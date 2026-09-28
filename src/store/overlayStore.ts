// -----------------------------------------------------------------------------
// Yardımcı uygulama overlay durumu.
// Amaç (Bora): Toplama/Yerleştirme gibi bir işlem AÇIKKEN, o ekrandan
// AYRILMADAN üstte bir yardımcı uygulama (Ürün Sorgulama, Barkod Oluşturma,
// SKT Etiketi) açılabilsin; kapatınca kullanıcı kaldığı yerden devam etsin.
// Route DEĞİŞMEZ → alttaki işlem ekranı DOM'da mount kalır → tüm state korunur.
// -----------------------------------------------------------------------------
import { create } from "zustand";

export type OverlayAppId = "inquiry" | "barcode" | "skt";

interface OverlayState {
  openApp: OverlayAppId | null;
  open: (id: OverlayAppId) => void;
  close: () => void;
}

export const useOverlayStore = create<OverlayState>((set) => ({
  openApp: null,
  open: (id) => set({ openApp: id }),
  close: () => set({ openApp: null }),
}));
