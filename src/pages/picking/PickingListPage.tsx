import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Package, Camera, AlertTriangle, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import CameraScanOverlay from "../../components/CameraScanOverlay";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import { blockingHigherPriorityOrders } from "../../store/pickingLogic";
import type { PickOrder } from "../../types";

export default function PickingListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PickOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [kamera, setKamera] = useState(false);
  const [taramaHatasi, setTaramaHatasi] = useState<string | null>(null);

  const [oncelikUyari, setOncelikUyari] = useState<string | null>(null);

  const istendi = useRef(false);

  useEffect(() => {
    if (istendi.current) return;
    istendi.current = true;

    api
      .getPickOrders()
      .then((o) => {
        console.info("[picking] gelen emir sayısı:", o.length, o);
        setOrders(o);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter(
      (o) => o.id.toLowerCase().includes(s) || o.customer.toLowerCase().includes(s)
    );
  }, [orders, q]);

  const pg = usePagination(filtered, 9, "picking", q);

  const emreGir = (o: PickOrder) => {
    const engel = blockingHigherPriorityOrders(o, orders);
    if (engel.length) {

      setOncelikUyari(t("picking.priorityLock"));
      return;
    }
    setOncelikUyari(null);
    navigate(`/picking/${o.id}?type=${encodeURIComponent(o.orderType ?? "")}`);
  };

  const barkodOkundu = (code: string) => {
    const kod = code.trim().toLowerCase();
    if (!kod) return;
    const sadelestir = (s: string) => s.trim().toLowerCase().replace(/^0+/, "");
    const hedef = sadelestir(kod);

    const emir = orders.find(
      (o) => sadelestir(o.id) === hedef || (o.reference && sadelestir(o.reference) === hedef)
    );

    setKamera(false);
    if (emir) {
      setTaramaHatasi(null);
      emreGir(emir);
      return;
    }

    setTaramaHatasi(`${code} — bu numarada açık emir bulunamadı`);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("picking.openOrders")}
        subtitle={t("picking.title")}
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("picking.searchOrder")}
              className="field-input w-72 pl-11 pr-12"
            />
            {}
            <button
              type="button"
              onClick={() => setKamera(true)}
              aria-label={t("picking.scanOrder")}
              title={t("picking.scanOrder")}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>
        }
      />

      {}
      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("picking.searchOrder")}
          className="field-input pl-11 pr-12"
        />
        <button
          type="button"
          onClick={() => setKamera(true)}
          aria-label={t("picking.scanOrder")}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>

      {kamera && (
        <CameraScanOverlay
          onDetected={barkodOkundu}
          onClose={() => setKamera(false)}
          prompt={t("picking.scanOrder")}
        />
      )}

      {taramaHatasi && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-600">
          <span>{taramaHatasi}</span>
          <button type="button" onClick={() => setTaramaHatasi(null)} className="shrink-0 underline">
            {t("common.close")}
          </button>
        </div>
      )}

      {}
      {oncelikUyari && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOncelikUyari(null)}
        >
          <div
            className="w-full max-w-md animate-slide-up rounded-t-3xl bg-surface p-6 shadow-soft sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10">
                  <AlertTriangle className="h-6 w-6 text-rose-500" />
                </div>
                <h3 className="text-lg font-bold text-fg">{t("picking.priorityLockTitle")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOncelikUyari(null)}
                aria-label={t("common.close")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-subtle hover:bg-elevated"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm font-medium text-muted">{oncelikUyari}</p>

            <button
              type="button"
              onClick={() => setOncelikUyari(null)}
              className="btn-primary mt-6 w-full"
            >
              {t("common.done")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 whitespace-pre-line rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-medium text-rose-500">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-subtle">
          <Package className="mb-2 h-10 w-10" />
          <p className="text-sm">—</p>
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
                  <div>
                    <div className="flex items-center gap-2">
                      {}
                      {o.priority !== undefined && (
                        <span
                          className="chip bg-slate-100 font-mono text-slate-600"
                          title="Toplama önceliği — küçük olan önce"
                        >
                          {o.priority}
                        </span>
                      )}
                      <span className="font-mono text-base font-bold text-fg">{o.id}</span>
                      <span className={`chip ${durumStil}`}>{durumEtiket}</span>
                    </div>
                    {o.customer && <p className="mt-0.5 text-sm text-muted">{o.customer}</p>}
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-subtle" />
                </div>

                {}
                {(o.reference || o.worker) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                    {o.reference && <span>{o.reference}</span>}
                    {o.worker && <span className="font-mono">{o.worker}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <Pagination
          page={pg.page}
          pageCount={pg.pageCount}
          onChange={pg.setPage}
          rangeStart={pg.rangeStart}
          rangeEnd={pg.rangeEnd}
          total={pg.total}
          label={t("picking.items")}
        />
        </>
      )}
    </div>
  );
}
