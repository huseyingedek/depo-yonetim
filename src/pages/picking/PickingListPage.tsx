import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Package } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import type { PickOrder } from "../../types";

export default function PickingListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PickOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  // React StrictMode geliştirmede efekti iki kez çalıştırır; bu bekçi
  // ağa ikinci bir istek çıkmasını engeller.
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

  const pg = usePagination(filtered, 9);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

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
              className="field-input w-72 pl-11"
            />
          </div>
        }
      />

      {/* Mobil arama */}
      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("picking.searchOrder")}
          className="field-input pl-11"
        />
      </div>

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
            // Kalem sayısı/miktar burada YOK — bu bilgi MZYEnterPick'ten geliyor,
            // liste servisi (MZYListingPick) döndürmüyor. Uydurma sayı basmıyoruz.
            const devam = o.status === "partial";
            return (
              <button
                key={o.id}
                onClick={() =>
                  // Emir tipi de taşınmalı — MZYEnterPick PSORDERTYPE olmadan emri bulamıyor
                  navigate(`/picking/${o.id}?type=${encodeURIComponent(o.orderType ?? "")}`)
                }
                className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {/* Öncelik — küçük olan önce toplanır, liste buna göre sıralı */}
                      {o.priority !== undefined && (
                        <span
                          className="chip bg-slate-100 font-mono text-slate-600"
                          title="Toplama önceliği — küçük olan önce"
                        >
                          {o.priority}
                        </span>
                      )}
                      <span className="font-mono text-base font-bold text-fg">{o.id}</span>
                      <span
                        className={`chip ${
                          devam ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700"
                        }`}
                      >
                        {devam ? t("picking.status.inProgress") : t("picking.status.new")}
                      </span>
                    </div>
                    {o.customer && <p className="mt-0.5 text-sm text-muted">{o.customer}</p>}
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-subtle" />
                </div>

                {/* Sadece servisten gelen alanlar; boşsa hiç gösterilmiyor */}
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
