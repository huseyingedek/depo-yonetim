import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Warehouse, MapPin, Building2 } from "lucide-react";
import PageHeader from "../../components/PageHeader";
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
  const istendi = useRef(false);

  useEffect(() => {
    if (istendi.current) return;
    istendi.current = true;
    api
      .getPutawayOrders()
      .then(setOrders)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter((o) => o.id.toLowerCase().includes(s) || o.customer.toLowerCase().includes(s));
  }, [orders, q]);

  const pg = usePagination(filtered, 9);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const emreGir = (o: PickOrder) => navigate(`/putaway/${o.id}?type=${encodeURIComponent(o.orderType ?? "")}`);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("putaway.title")}
        subtitle={t("putaway.waiting")}
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("putaway.search")} className="field-input w-72 pl-11" />
          </div>
        }
      />
      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("putaway.search")} className="field-input pl-11" />
      </div>

      {error && (
        <div className="mb-5 whitespace-pre-line rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-medium text-rose-500">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-subtle">
          <Warehouse className="mb-2 h-10 w-10" />
          <p className="text-sm">{t("putaway.allPlaced")}</p>
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
