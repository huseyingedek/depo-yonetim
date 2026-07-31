import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Warehouse } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import type { PickOrder } from "../../types";

/**
 * Yerleştirme emir listesi — MZYListingPick, PIISPICK=0 (toplama ile aynı servis).
 * Toplama listesinin aynısı; sadece emir kaynağı getPutawayOrders.
 */
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
            {pg.pageItems.map((o) => (
              <button
                key={o.id}
                onClick={() => emreGir(o)}
                className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {o.priority !== undefined && (
                        <span className="chip bg-slate-100 font-mono text-slate-600">{o.priority}</span>
                      )}
                      <span className="font-mono text-base font-bold text-fg">{o.id}</span>
                    </div>
                    {o.customer && <p className="mt-0.5 text-sm text-muted">{o.customer}</p>}
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-subtle" />
                </div>
                {(o.reference || o.sourceWarehouse) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                    {o.reference && <span>{o.reference}</span>}
                    {o.sourceWarehouse && (
                      <span className="font-mono text-violet-600">
                        kaynak: {o.sourceWarehouse}{o.sourceShelf ? "/" + o.sourceShelf : ""}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
          <Pagination page={pg.page} pageCount={pg.pageCount} onChange={pg.setPage} rangeStart={pg.rangeStart} rangeEnd={pg.rangeEnd} total={pg.total} label={t("putaway.items")} />
        </>
      )}
    </div>
  );
}
