import { create } from "zustand";
import i18n from "../i18n";
import type { Settings, User } from "../types";

const STORAGE_KEY = "aktuel-wms-state-v3";

export type Theme = "light" | "dark";

interface PersistedState {
  user: User | null;
  settings: Settings;
  theme: Theme;
  trace: boolean;
}

const defaultSettings: Settings = {
  company: "01", // COMPANY
  facility: "100", // PLANT
  warehouse: "D1", // WAREHOUSE
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
        trace: parsed.trace === true,
      };
    }
  } catch {

  }
  return { user: null, settings: defaultSettings, theme: "light", trace: false };
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
if (initial.settings.language !== i18n.language) {
  i18n.changeLanguage(initial.settings.language);
}
applyTheme(initial.theme);

function persist(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {

  }
}

export const useAppStore = create<AppState>((set, get) => ({
  user: initial.user,
  settings: initial.settings,
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
    set({ user });
    persist({ user, settings: get().settings, theme: get().theme, trace: get().trace });
  },
  logout: () => {
    set({ user: null });
    persist({ user: null, settings: get().settings, theme: get().theme, trace: get().trace });
  },
  updateSettings: (patch: Partial<Settings>) => {
    const settings = { ...get().settings, ...patch };
    if (patch.language && patch.language !== i18n.language) {
      i18n.changeLanguage(patch.language);
    }
    set({ settings });
    persist({ user: get().user, settings, theme: get().theme, trace: get().trace });
  },
  setTheme: (theme: Theme) => {
    applyTheme(theme);
    set({ theme });
    persist({ user: get().user, settings: get().settings, theme, trace: get().trace });
  },
  toggleTrace: () => {
    const trace = !get().trace;
    set({ trace });
    persist({ user: get().user, settings: get().settings, theme: get().theme, trace });
  },
  setTrace: (trace: boolean) => {
    set({ trace });
    persist({ user: get().user, settings: get().settings, theme: get().theme, trace });
  },
}));
