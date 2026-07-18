import { create } from "zustand";
import i18n from "../i18n";
import type { Settings, User } from "../types";

const STORAGE_KEY = "aktuel-wms-state";

export type Theme = "light" | "dark";

interface PersistedState {
  user: User | null;
  settings: Settings;
  theme: Theme;
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
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        user: parsed.user ?? null,
        settings: { ...defaultSettings, ...parsed.settings },
        theme: parsed.theme === "dark" ? "dark" : "light",
      };
    }
  } catch {
    /* ignore */
  }
  return { user: null, settings: defaultSettings, theme: "light" };
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

interface AppState {
  user: User | null;
  settings: Settings;
  theme: Theme;
  login: (username: string) => void;
  logout: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setTheme: (theme: Theme) => void;
}

const initial = load();
if (initial.settings.language !== i18n.language) {
  i18n.changeLanguage(initial.settings.language);
}
applyTheme(initial.theme);

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
  theme: initial.theme,
  login: (username: string) => {
    const user: User = {
      username,
      displayName:
        username.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Depo Kullanıcısı",
    };
    set({ user });
    persist({ user, settings: get().settings, theme: get().theme });
  },
  logout: () => {
    set({ user: null });
    persist({ user: null, settings: get().settings, theme: get().theme });
  },
  updateSettings: (patch: Partial<Settings>) => {
    const settings = { ...get().settings, ...patch };
    if (patch.language && patch.language !== i18n.language) {
      i18n.changeLanguage(patch.language);
    }
    set({ settings });
    persist({ user: get().user, settings, theme: get().theme });
  },
  setTheme: (theme: Theme) => {
    applyTheme(theme);
    set({ theme });
    persist({ user: get().user, settings: get().settings, theme });
  },
}));
