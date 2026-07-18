import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Package } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import { orderProgress, orderTotals } from "../../store/pickingStore";
import type { PickOrder } from "../../types";

export default function PickingListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PickOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.getPickOrders().then((o) => {
      setOrders(o);
      setLoading(false);
    });
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
            const progress = orderProgress(o);
            const { lineCount, requested } = orderTotals(o);
            const started = progress > 0;
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/picking/${o.id}`)}
                className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-fg">{o.id}</span>
                      <span
                        className={`chip ${
                          started ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700"
                        }`}
                      >
                        {started ? t("picking.status.inProgress") : t("picking.status.new")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{o.customer}</p>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-subtle" />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-xs font-semibold text-subtle">
                    {lineCount} {t("picking.items")} · {requested} adet
                  </span>
                </div>
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
