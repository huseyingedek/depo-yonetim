import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Boxes, Home, Settings as SettingsIcon, LogOut, Menu, X, Building2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { OPERATIONS } from "./operations";

/**
 * Web kabuğu: masaüstünde üst bar + sol menü + geniş içerik.
 * Mobilde sol menü gizlenir, hamburger ile açılan drawer olur; içerik tek kolon.
 */
export default function AppShell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Sayfa (route) değişince içeriği en üste al — "ekran kayması" olmasın
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo(0, 0);
    setOpen(false); // mobil menü açıksa kapat
  }, [location.pathname]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-ink-50">
      {/* Masaüstü sabit menü */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-ink-100 bg-white lg:flex">
        <SidebarContent onNavigate={() => {}} />
      </aside>

      {/* Mobil drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col bg-white shadow-soft">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-ink-400 hover:bg-ink-100"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Ana bölüm */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Üst bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 lg:hidden"
            aria-label="Menü"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <Boxes className="h-6 w-6 text-brand-600" />
            <span className="font-bold text-ink-900">{t("app.company")}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <UserBadge />
          </div>
        </header>

        {/* İçerik — asıl kaydırma kabı */}
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
      isActive ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:bg-ink-50 hover:text-ink-800"
    }`;

  return (
    <div className="flex h-full flex-col p-4">
      {/* Marka */}
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
          <Boxes className="h-6 w-6 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-extrabold text-ink-900">{t("app.company")}</p>
          <p className="text-xs text-ink-400">{t("app.name")}</p>
        </div>
      </div>

      {/* Çalışma bağlamı */}
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2.5">
        <Building2 className="h-4 w-4 shrink-0 text-ink-400" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold text-ink-700">{settings.facility}</p>
          <p className="truncate text-[11px] text-ink-400">{settings.warehouse}</p>
        </div>
      </div>

      {/* Menü */}
      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto no-scrollbar">
        <NavLink to="/home" className={linkClass} onClick={onNavigate} end>
          <Home className="h-5 w-5" />
          {t("home.selectOperation")}
        </NavLink>
        <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-300">
          {t("app.name")}
        </p>
        {OPERATIONS.map((op) => {
          const Icon = op.icon;
          return (
            <NavLink key={op.type} to={op.route} className={linkClass} onClick={onNavigate}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${op.iconBg}`}>
                <Icon className={`h-4 w-4 ${op.iconFg}`} />
              </span>
              <span className="flex-1">{t(`home.operations.${op.type}`)}</span>
              {!op.ready && (
                <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[9px] font-semibold text-ink-400">
                  yakında
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Alt */}
      <div className="mt-2 space-y-1 border-t border-ink-100 pt-3">
        <NavLink to="/settings" className={linkClass} onClick={onNavigate}>
          <SettingsIcon className="h-5 w-5" />
          {t("settings.title")}
        </NavLink>
        <LogoutButton />
      </div>
    </div>
  );
}

function LogoutButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAppStore((s) => s.logout);
  return (
    <button
      onClick={() => {
        logout();
        navigate("/login", { replace: true });
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
    >
      <LogOut className="h-5 w-5" />
      {t("settings.signOut")}
    </button>
  );
}

function UserBadge() {
  const user = useAppStore((s) => s.user);
  const initials = (user?.displayName ?? "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-sm font-semibold text-ink-800">{user?.displayName}</p>
        <p className="text-[11px] text-ink-400">{user?.username}</p>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {initials || "?"}
      </div>
    </div>
  );
}
