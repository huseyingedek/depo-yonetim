import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Boxes, Home, Settings as SettingsIcon, LogOut, Building2, Bell, LayoutGrid, Menu, X, ChevronDown, type LucideIcon } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { usePickingStore } from "../store/pickingStore";
import { OPERATIONS } from "./operations";
import { useOverlayStore } from "../store/overlayStore";
import { YARDIMCI_UYGULAMALAR } from "./yardimciUygulamalar";
import AppOverlayHost from "./AppOverlayHost";
import GlobalHataToast from "./GlobalHataToast";

export default function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  // Kenar çubuğu aç/kapa (masaüstü/tablet). Hamburger ile toggle.
  // Paketleme ekranı monitörde geniş alan gerektirdiğinden varsayılan olarak kapalı gelir.
  const isPackaging = location.pathname.startsWith("/packaging");
  const [sidebarAcik, setSidebarAcik] = useState(() => !isPackaging);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo(0, 0);

    const isCurrentPackaging = location.pathname.startsWith("/packaging");
    const wasPackaging = prevPathRef.current.startsWith("/packaging");

    if (isCurrentPackaging && !wasPackaging) {
      // Paketleme ekranına gelindiğinde sol menüyü varsayılan olarak kapalı getir
      setSidebarAcik(false);
    } else if (!isCurrentPackaging && wasPackaging) {
      // Paketleme ekranından diğer ekranlara geçildiğinde sol menüyü varsayılan olarak açık getir
      setSidebarAcik(true);
    }

    const wasPicking = prevPathRef.current.startsWith("/picking");
    const isPicking = location.pathname.startsWith("/picking");
    if (wasPicking && !isPicking) {
      // Sipariş Toplama modülünden çıkıldı (Ana Sayfa veya başka bir menüye gidildi).
      // Bir sonraki girişte CANIAS'tan taze liste çekilmesi için liste önbelleğini sıfırla.
      usePickingStore.getState().resetOrderList();
    }

    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  return (
    <div className="app-bg flex h-[100dvh] overflow-hidden">
      {/* Kenar Çubuğu (Büyük Ekran - lg+) */}
      <aside
        className={`hidden w-72 shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-ink-900 via-brand-900 to-brand-950 ${
          sidebarAcik ? "lg:flex" : "lg:hidden"
        }`}
      >
        <SidebarContent onNavigate={() => {}} />
      </aside>

      {/* Ana Gövde */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Üst Çubuk (Masaüstü/Tablet lg+) */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:px-8 short:hidden lg:!flex">
          {/* Sol menü toggle (sadece masaüstü/tablet lg+) */}
          <button
            type="button"
            onClick={() => setSidebarAcik((v) => !v)}
            aria-label="Menüyü aç/kapat"
            title={sidebarAcik ? "Menüyü Kapat" : "Menüyü Aç"}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-elevated hover:text-fg lg:flex"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-fg">{t("app.company")}</p>
              <p className="text-[11px] text-subtle">{t("app.name")}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Alt menü göründüğünde (lg altı) gizle; sadece lg+ header'da göster */}
            <span className="hidden lg:flex">
              <TraceSwitch header />
            </span>
            <button className="flex h-10 w-10 items-center justify-center rounded-xl text-subtle transition hover:bg-elevated" aria-label="Bildirimler">
              <Bell className="h-5 w-5" />
            </button>
            <UserBadge />
          </div>
        </header>

        {}
        {}
        <main
          ref={mainRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-24 lg:pb-0 short:pb-0"
        >
          <div key={location.pathname} className="min-w-0 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {}
      <MobileTabBar />

      {/* Yardımcı uygulama overlay altyapısı (tetikleyici eski barın üzerine eklenecek) */}
      <AppOverlayHost />

      {/* Tek yerden global hata bildirimi */}
      <GlobalHataToast />
    </div>
  );
}

type RadialItem = {
  key: string;
  label: string;
  onClick: () => void;
  active: boolean;
  short?: string;
  isTrace?: boolean;
  icon?: LucideIcon;
};

// Ortak çeyrek daire (radyal) menü. side="right" → saat 12→9 (sola açılır),
// side="left" → saat 12→3 (sağa açılır). Yalnız ikon, zemin şeffaf.
function RadialMenu({
  items,
  open,
  onClose,
  side,
  trace,
  halkalar,
}: {
  items: RadialItem[];
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  trace: boolean;
  /** Halka başına öğe sayısı (içten dışa). Verilmezse 4'e kadar tek halka, fazlası 3'erli. */
  halkalar?: number[];
}) {
  // Öğeler iç içe halkalara bölünür (tek halkada 8 ikon + etiket üst üste binerdi).
  const boyutlar = halkalar ?? (items.length > 4 ? Array.from({ length: Math.ceil(items.length / 3) }, () => 3) : [items.length]);
  const tekHalka = boyutlar.length === 1;
  const YARICAP = [108, 200, 288];
  const halkaOf = (idx: number) => {
    let bas = 0;
    for (let h = 0; h < boyutlar.length; h++) {
      if (idx < bas + boyutlar[h]) return { halka: h, i: idx - bas, N: boyutlar[h] };
      bas += boyutlar[h];
    }
    return { halka: boyutlar.length - 1, i: 0, N: 1 };
  };
  const anchor = side === "right" ? { right: "32px" } : { left: "32px" };
  return (
    <div
      className={`fixed z-[55] lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ ...anchor, bottom: "56px", width: 0, height: 0 }}
    >
      {items.map((item, idx) => {
        const { halka, i, N } = halkaOf(idx);
        const R = tekHalka ? 116 : YARICAP[halka] ?? 288 + (halka - 2) * 88;
        const f = N === 1 ? 0 : i / (N - 1);
        const deg = side === "right" ? 90 + f * 90 : 90 - f * 90; // sağ: 12→9, sol: 12→3
        const a = (deg * Math.PI) / 180;
        const dx = Math.round(R * Math.cos(a));
        const dy = Math.round(-R * Math.sin(a));
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            style={{
              transform: open
                ? `translate(${dx}px, ${dy}px) translate(-50%, -50%) scale(1)`
                : "translate(-50%, -50%) scale(0.4)",
              opacity: open ? 1 : 0,
              transitionDelay: open ? `${idx * 30}ms` : "0ms",
            }}
            className="absolute left-0 top-0 flex flex-col items-center gap-1 transition-all duration-200 ease-soft"
          >
            <button
              type="button"
              onClick={() => { item.onClick(); onClose(); }}
              aria-label={item.label}
              title={item.label}
              className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200 ease-soft hover:scale-110 active:scale-95 ${
                // iOS "buzlu cam" hissi: yarı saydam zemin + arkadaki içeriği bulanıklaştır
                item.isTrace
                  ? trace
                    ? "border-rose-300/60 bg-rose-500/75 text-white"
                    : "border-white/60 bg-white/45 text-muted dark:border-white/15 dark:bg-slate-800/45"
                  : item.active
                  ? "border-brand-300/60 bg-brand-600/75 text-white"
                  : "border-white/60 bg-white/45 text-fg dark:border-white/15 dark:bg-slate-800/45"
              }`}
            >
              {item.isTrace ? (
                <span className="text-sm font-black">{trace ? "1" : "0"}</span>
              ) : Icon ? (
                <Icon className="h-[20px] w-[20px]" />
              ) : null}
            </button>
            <span
              className={`whitespace-nowrap rounded-full bg-white/45 px-1.5 py-0.5 text-[10px] font-bold leading-none shadow-sm backdrop-blur-xl backdrop-saturate-150 dark:bg-slate-800/45 ${
                item.isTrace ? (trace ? "text-rose-600" : "text-fg") : item.active ? "text-brand-700" : "text-fg"
              }`}
            >
              {item.short ?? item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MobileTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const overlayOpen = useOverlayStore((s) => s.open);
  const overlayApp = useOverlayStore((s) => s.openApp);
  const trace = useAppStore((s) => s.trace);
  const toggleTrace = useAppStore((s) => s.toggleTrace);

  const [sagAcik, setSagAcik] = useState(false);

  // Yardımcı uygulamalar (işlem kapanmadan overlay açar).
  const helperItems: RadialItem[] = YARDIMCI_UYGULAMALAR.map((u) => ({
    key: u.id, icon: u.icon, label: u.label, short: u.short, onClick: () => overlayOpen(u.id), active: overlayApp === u.id,
  }));

  // Sol alttaki ayrı buton kaldırıldı (Hüseyin). Tek buton, iki halka:
  //   iç halka (3): SKT · Ayarlar · Trace
  //   dış halka (5): Sorgu · Barkod · Paket · İrsaliye · Raf
  // "Ana Menü" radyalden çıkarıldı (ana sayfaya sayfa başlığındaki geri tuşuyla dönülür).
  const sktItem = helperItems.find((h) => h.key === "skt")!;
  const systemItems: RadialItem[] = [
    sktItem,
    { key: "settings", icon: SettingsIcon, label: "Ayarlar", short: "Ayarlar", onClick: () => navigate("/settings"), active: pathname.startsWith("/settings") && !overlayApp },
    { key: "trace", label: "Trace", short: "Trace", onClick: () => toggleTrace(), active: trace, isTrace: true },
  ];

  const menuItems = [...systemItems, ...helperItems.filter((h) => h.key !== "skt")];
  const acik = sagAcik;
  const closeAll = () => setSagAcik(false);

  return (
    <>
      {/* Karartma — açıkken dışarı dokununca kapanır (zemin şeffaf) */}
      {acik && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          onClick={closeAll}
          className="fixed inset-0 z-[54] bg-transparent lg:hidden"
        />
      )}

      {/* İç halka: SKT/ayarlar/trace · dış halka: diğer 5 yardımcı uygulama (çeyrek daire, sola açılır) */}
      <RadialMenu items={menuItems} open={sagAcik} onClose={closeAll} side="right" trace={trace} halkalar={[3, 5]} />

      {/* Sağ alt FAB — tek menü butonu */}
      <button
        type="button"
        onClick={() => setSagAcik((v) => !v)}
        aria-label={sagAcik ? "Menüyü kapat" : "Menü"}
        className="fixed bottom-2 right-2 z-[56] flex h-11 w-11 items-center justify-center rounded-full bg-brand-600/85 text-white shadow-soft ring-1 ring-white/30 backdrop-blur-xl backdrop-saturate-150 transition active:scale-95 lg:!hidden"
      >
        {sagAcik ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const overlayOpen = useOverlayStore((s) => s.open);
  const overlayApp = useOverlayStore((s) => s.openApp);
  const [yardimciAcik, setYardimciAcik] = useState(true);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ease-soft ${
      isActive ? "bg-white/15 text-white shadow-soft" : "text-white/70 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <div className="flex h-full flex-col p-4">
      {}
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
          <Boxes className="h-6 w-6 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-extrabold text-white">{t("app.company")}</p>
          <p className="text-xs text-brand-200">{t("app.name")}</p>
        </div>
      </div>

      {}
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
        <Building2 className="h-4 w-4 shrink-0 text-brand-200" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold text-white">{settings.facility}</p>
          <p className="truncate text-[11px] text-brand-200">{settings.warehouse}</p>
        </div>
      </div>

      {}
      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto ince-scrollbar -mr-2 pr-2">
        <NavLink to="/home" className={linkClass} onClick={onNavigate} end>
          <Home className="h-5 w-5" />
          {t("home.selectOperation")}
        </NavLink>
        <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-white/40">
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
                <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[9px] font-semibold text-subtle">
                  yakında
                </span>
              )}
            </NavLink>
          );
        })}

        {/* Yardımcı Uygulamalar — mavi menüde AÇILIR alt menü; seçilince işlem
            KAPANMADAN üstte overlay açılır ("İşleme Dön" ile kaldığın yere dönersin). */}
        <button
          type="button"
          onClick={() => setYardimciAcik((v) => !v)}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/70 transition-all duration-200 ease-soft hover:bg-white/10 hover:text-white"
        >
          <LayoutGrid className="h-5 w-5" />
          <span className="flex-1 text-left">Yardımcı Uygulamalar</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${yardimciAcik ? "rotate-180" : ""}`} />
        </button>
        {yardimciAcik && (
          <div className="ml-3 space-y-0.5 border-l border-white/10 pl-2">
            {YARDIMCI_UYGULAMALAR.map((h) => {
              const Icon = h.icon;
              const aktif = overlayApp === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => { overlayOpen(h.id); onNavigate(); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-semibold transition-all duration-200 ease-soft ${
                    aktif ? "bg-white/15 text-white shadow-soft" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-left">{h.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {}
      <div className="mt-2 space-y-1 border-t border-white/10 pt-3">
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
        usePickingStore.getState().clear();
        usePickingStore.getState().resetOrderList();
        logout();
        navigate("/login", { replace: true });
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-300 transition-all duration-200 ease-soft hover:bg-white/10 hover:text-rose-200"
    >
      <LogOut className="h-5 w-5" />
      {t("settings.signOut")}
    </button>
  );
}

// Kaydırmalı aç/kapa (0 kapalı, 1 açık) — alt menüde (bar) ve PC header'da (header)
function TraceSwitch({ header = false }: { header?: boolean }) {
  const trace = useAppStore((s) => s.trace);
  const toggleTrace = useAppStore((s) => s.toggleTrace);
  const raylı = (
    <span
      className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
        trace ? "bg-rose-500" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold shadow transition-transform duration-200 ${
          trace ? "translate-x-[22px] text-rose-600" : "translate-x-0.5 text-slate-500"
        }`}
      >
        {trace ? "1" : "0"}
      </span>
    </span>
  );
  if (header) {
    return (
      <button
        type="button"
        onClick={toggleTrace}
        role="switch"
        aria-checked={trace}
        aria-label="Trace aç/kapa"
        title={trace ? "Trace AÇIK (1)" : "Trace KAPALI (0)"}
        className="flex h-10 items-center gap-2 rounded-xl px-3 transition hover:bg-elevated active:scale-95"
      >
        <span className={`text-sm font-semibold ${trace ? "text-rose-600" : "text-subtle"}`}>Trace</span>
        {raylı}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggleTrace}
      role="switch"
      aria-checked={trace}
      aria-label="Trace aç/kapa"
      className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold active:scale-95"
    >
      {raylı}
      <span className={trace ? "text-rose-600" : "text-subtle"}>Trace</span>
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
        <p className="text-sm font-semibold text-fg">{user?.displayName}</p>
        <p className="text-[11px] text-subtle">{user?.username}</p>
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {initials || "?"}
      </div>
    </div>
  );
}
