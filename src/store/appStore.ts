import { create } from "zustand";
import i18n from "../i18n";
import type { Settings, User } from "../types";

const STORAGE_KEY = "aktuel-wms-state";

interface PersistedState {
  user: User | null;
  settings: Settings;
}

const defaultSettings: Settings = {
  company: "Aktüel Ofis",
  facility: "Merkez Tesis",
  warehouse: "Ana Depo (D01)",
  language: "tr",
};

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      return {
        user: parsed.user ?? null,
        settings: { ...defaultSettings, ...parsed.settings },
      };
    }
  } catch {
    /* ignore */
  }
  return { user: null, settings: defaultSettings };
}

interface AppState {
  user: User | null;
  settings: Settings;
  login: (username: string) => void;
  logout: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const initial = load();
// Ensure i18n matches persisted language on boot
if (initial.settings.language !== i18n.language) {
  i18n.changeLanguage(initial.settings.language);
}

function persist(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  user: initial.user,
  settings: initial.settings,
  login: (username: string) => {
    const user: User = {
      username,
      displayName: username
        .replace(/[._]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || "Depo Kullanıcısı",
    };
    set({ user });
    persist({ user, settings: get().settings });
  },
  logout: () => {
    set({ user: null });
    persist({ user: null, settings: get().settings });
  },
  updateSettings: (patch: Partial<Settings>) => {
    const settings = { ...get().settings, ...patch };
    if (patch.language && patch.language !== i18n.language) {
      i18n.changeLanguage(patch.language);
    }
    set({ settings });
    persist({ user: get().user, settings });
  },
}));
