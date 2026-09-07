import { create } from "zustand";

// Global hata durumu — uygulamanın herhangi bir yerinden tek satırla hata gösterilir.
// (Bkz. src/utils/hata.ts → hataGosterVe, ve components/GlobalHataToast.tsx)
interface HataState {
  mesaj: string | null;
  goster: (mesaj: string) => void;
  kapat: () => void;
}

export const useHataStore = create<HataState>((set) => ({
  mesaj: null,
  goster: (mesaj) => set({ mesaj: mesaj || null }),
  kapat: () => set({ mesaj: null }),
}));
