// -----------------------------------------------------------------------------
// Overlay bağlamı: bir sayfa "yardımcı uygulama overlay'i" içinde mi render
// ediliyor? Eğer öyleyse PageHeader'ın geri tuşu /home'a gitmek yerine overlay'i
// KAPATIR (kullanıcı alttaki işleme geri döner). null → normal route sayfası.
// -----------------------------------------------------------------------------
import { createContext, useContext } from "react";

export interface OverlayCtx {
  close: () => void;
}

export const OverlayContext = createContext<OverlayCtx | null>(null);

export const useOverlay = (): OverlayCtx | null => useContext(OverlayContext);
