import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Warehouse, MapPin, Building2, Camera, X, ScanLine, CornerDownLeft } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import CameraScanOverlay from "../../components/CameraScanOverlay";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import type { PickOrder } from "../../types";

export default function PutawayListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PickOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Ürün barkoduyla emir filtresi (Bora, 14.08: listingPlacement PSBARCODE).
  const [kamera, setKamera] = useState(false);
  const [barkodFiltre, setBarkodFiltre] = useState("");
  const [taramaHatasi, setTaramaHatasi] = useState<string | null>(null);

  const istendi = useRef(false);

  const yukle = (barcode = "") => {
    setLoading(true);
    setError(null);
    api
      .getPutawayOrders(barcode)
      .then((list) => {
        setOrders(list);
        if (barcode && list.length === 0) {
          setTaramaHatasi(`${barcode} — bu ürünü içeren açık yerleştirme emri yok`);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (istendi.current) return;
    istendi.current = true;
    yukle();
  }, []);

  // Ürün okutunca → sunucudan o ürünü içeren emirleri getir (PSBARCODE = ham barkod).
  // Not: filtreleme SERVİSTE olmalı; Bora PSBARCODE'u sorguya bağlayınca çalışır.
  const barkodOkundu = async (code: string) => {
    const kod = code.trim();
    if (!kod) return;
    setKamera(false);
    setTaramaHatasi(null);
    setQ("");
    setBarkodFiltre(kod);
    setLoading(true);
    setError(null);
    try {
      const list = await api.getPutawayOrders(kod);
      setOrders(list);
      if (list.length === 0) setTaramaHatasi(`${kod} — bu ürünü içeren açık yerleştirme emri yok`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const barkodTemizle = () => {
    setBarkodFiltre("");
    setTaramaHatasi(null);
    setQ("");
    yukle();
  };

  // Yazarken client-side filtre YOK — ürün barkodunu yazınca liste boşalmasın.
  // Filtreleme serviste (PSBARCODE); Enter / ↵ butonu / kamera ile tetiklenir.
  const pg = usePagination(orders, 9);
  useEffect(() => pg.reset(), [barkodFiltre]); // eslint-disable-line react-hooks/exhaustive-deps

  const emreGir = (o: PickOrder) => navigate(`/putaway/${o.id}?type=${encodeURIComponent(o.orderType ?? "")}`);

  // Arama kutusu: yazarken metin filtresi; Enter'da (el tarayıcı) ürün barkodu filtresi.
  const aramaField = (mobil = false) => (
    <div className={`relative ${mobil ? "" : "w-80"}`}>
      <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) barkodOkundu(q);
        }}
        enterKeyHint="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Ürün okut/gir → emri bul"
        className="field-input w-full pl-11 pr-[4.75rem]"
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {/* Ara (enter) — telefonda tıklanabilir tetikleyici */}
        <button
          type="button"
          onClick={() => q.trim() && barkodOkundu(q)}
          disabled={!q.trim()}
          aria-label="Bu barkodla emri bul"
          title="Bu barkodla emri bul"
          className={`flex ${mobil ? "h-9 w-9" : "h-8 w-8"} items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg disabled:opacity-30`}
        >
          <CornerDownLeft className="h-5 w-5" />
        </button>
        {/* Kamera ile okut */}
        <button
          type="button"
          onClick={() => setKamera(true)}
          aria-label="Ürün okut"
          title="Kamerayla ürünü okut"
          className={`flex ${mobil ? "h-9 w-9" : "h-8 w-8"} items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg`}
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("putaway.title")}
        subtitle={t("putaway.waiting")}
        backTo="/home"
        right={<div className="hidden sm:block">{aramaField(false)}</div>}
      />
      <div className="mb-5 sm:hidden">{aramaField(true)}</div>

      {/* Aktif ürün filtresi rozeti */}
      {barkodFiltre && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-3 text-sm font-medium text-brand-700">
          <span className="inline-flex min-w-0 items-center gap-2">
            <ScanLine className="h-4 w-4 shrink-0" />
            <span className="truncate">Ürün filtresi: <span className="font-mono font-bold">{barkodFiltre}</span> · {orders.length} emir</span>
          </span>
          <button type="button" onClick={barkodTemizle} className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
            <X className="h-4 w-4" /> Temizle
          </button>
        </div>
      )}

      {kamera && (
        <CameraScanOverlay
          onDetected={barkodOkundu}
          onClose={() => setKamera(false)}
          prompt="Ürünü okutun — ait olduğu emir listelensin"
        />
      )}

      {taramaHatasi && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-600">
          <span>{taramaHatasi}</span>
          <button type="button" onClick={barkodTemizle} className="shrink-0 underline">{t("common.close")}</button>
        </div>
      )}

      {error && (
        <div className="mb-5 whitespace-pre-line rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-medium text-rose-500">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-subtle">
          <Warehouse className="mb-2 h-10 w-10" />
          <p className="text-sm">{barkodFiltre ? "Bu ürünü içeren açık yerleştirme emri yok" : t("putaway.allPlaced")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((o) => {
              const durumEtiket =
                o.status === "closed"
                  ? t("picking.status.closed")
                  : o.status === "partial"
                  ? t("picking.status.inProgress")
                  : t("picking.status.new");
              const durumStil =
                o.status === "closed"
                  ? "bg-emerald-100 text-emerald-700"
                  : o.status === "partial"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-brand-100 text-brand-700";
              return (
                <button
                  key={o.id}
                  onClick={() => emreGir(o)}
                  className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {o.priority !== undefined && (
                          <span className="chip bg-slate-100 font-mono text-slate-600" title="Öncelik">{o.priority}</span>
                        )}
                        <span className="font-mono text-base font-bold text-fg">{o.id}</span>
                        {o.orderType && (
                          <span className="chip bg-violet-100 font-mono text-violet-700">{o.orderType}</span>
                        )}
                        <span className={`chip ${durumStil}`}>{durumEtiket}</span>
                      </div>
                      {o.customer && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-fg" title="Tedarikçi / müşteri">
                          <Building2 className="h-4 w-4 shrink-0 text-subtle" />
                          <span className="truncate">{o.customer}</span>
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-subtle" />
                  </div>

                  {(o.reference || o.sourceWarehouse) && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                      {o.reference && <span>{o.reference}</span>}
                      {o.sourceWarehouse && (
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-violet-600">
                          <MapPin className="h-3.5 w-3.5" /> Depo {o.sourceWarehouse}{o.sourceShelf ? " · " + o.sourceShelf : ""}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <Pagination page={pg.page} pageCount={pg.pageCount} onChange={pg.setPage} rangeStart={pg.rangeStart} rangeEnd={pg.rangeEnd} total={pg.total} label={t("putaway.items")} />
        </>
      )}
    </div>
  );
}
