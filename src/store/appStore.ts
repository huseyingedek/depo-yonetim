import { create } from "zustand";
import i18n from "../i18n";
import type { Settings, User } from "../types";

const STORAGE_KEY = "aktuel-wms-state-v3";

export type Theme = "light" | "dark";

interface PersistedState {
  user: User | null;
  theme: Theme;
  trace: boolean;
}

export const defaultSettings: Settings = {
  company: "01", // COMPANY
  facility: "100", // PLANT
  warehouse: "", // Varsayılan Depo
  warehouseReceiving: "", // Mal Kabul Deposu
  warehousePackaging: "", // Paketleme Deposu
  warehouseDelivery: "", // Dağıtım Deposu
  warehouseQuality: "", // Kalite Deposu
  printerName: "", // Yazıcı Adı
  language: "tr",
};

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState & { settings?: unknown }>;
      // Eski sürümden kalan yerel ayarları temizle (ayarlar yalnızca CANIAS'tan çekilmeli)
      if ("settings" in parsed) {
        delete parsed.settings;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      return {
        user: parsed.user ?? null,
        theme: parsed.theme === "dark" ? "dark" : "light",
        trace: parsed.trace === true,
      };
    }
  } catch {

  }
  return { user: null, theme: "light", trace: false };
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

interface AppState {
  user: User | null;
  settings: Settings;
  theme: Theme;
  trace: boolean;
  login: (username: string, displayName?: string) => void;
  logout: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setTheme: (theme: Theme) => void;
  toggleTrace: () => void;
  setTrace: (trace: boolean) => void;
}

const initial = load();
applyTheme(initial.theme);

function persist(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {

  }
}

export const useAppStore = create<AppState>((set, get) => ({
  user: initial.user,
  settings: { ...defaultSettings },
  theme: initial.theme,
  trace: initial.trace,
  login: (username: string, displayName?: string) => {
    const user: User = {
      username,
      displayName:
        displayName ||
        username.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
        "Depo Kullanıcısı",
    };
    // Yeni kullanıcı girişi: Ayarları sıfırla, CANIAS MZYGetUserDefault'tan dolacak
    set({ user, settings: { ...defaultSettings } });
    persist({ user, theme: get().theme, trace: get().trace });
  },
  logout: () => {
    // Çıkış yapıldığında oturumu ve ayarları tamamen sıfırla (başka kullanıcıya geçmemesi için)
    set({ user: null, settings: { ...defaultSettings } });
    persist({ user: null, theme: get().theme, trace: get().trace });
  },
  updateSettings: (patch: Partial<Settings>) => {
    const prev = get().settings;
    const settings = {
      ...prev,
      ...patch,
      warehouse: patch.warehouse || patch.warehouseDelivery || prev.warehouse || prev.warehouseDelivery || "",
    };
    if (patch.language && patch.language !== i18n.language) {
      i18n.changeLanguage(patch.language);
    }
    // DİKKAT: Ayarlar ASLA localStorage'a yazılmaz! Yalnızca aktif oturumda bellekte tutulur.
    set({ settings });
  },
  setTheme: (theme: Theme) => {
    applyTheme(theme);
    set({ theme });
    persist({ user: get().user, theme, trace: get().trace });
  },
  toggleTrace: () => {
    const trace = !get().trace;
    set({ trace });
    persist({ user: get().user, theme: get().theme, trace });
  },
  setTrace: (trace: boolean) => {
    set({ trace });
    persist({ user: get().user, theme: get().theme, trace });
  },
}));
