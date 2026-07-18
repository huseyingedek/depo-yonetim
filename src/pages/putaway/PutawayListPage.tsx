import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Warehouse, MapPin } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import type { PutawayItem } from "../../types";

export default function PutawayListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<PutawayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.getPutawayItems().then((d) => {
      setItems(d);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) => i.product.name.toLowerCase().includes(s) || i.sourceRef.toLowerCase().includes(s) || i.product.barcode.includes(s)
    );
  }, [items, q]);

  const pg = usePagination(filtered, 8);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("putaway.waiting")}
        subtitle={t("putaway.title")}
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("putaway.search")} className="field-input w-72 pl-11" />
          </div>
        }
      />
      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("putaway.search")} className="field-input pl-11" />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-300">
          <Warehouse className="mb-2 h-10 w-10" />
          <p className="text-sm">{t("putaway.allPlaced")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {pg.pageItems.map((i) => (
              <button
                key={i.id}
                onClick={() => navigate(`/putaway/${i.id}`)}
                className="flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100">
                  <span className="text-sm font-bold text-violet-600">{i.qty}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{i.product.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-400">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="font-mono font-semibold text-violet-600">{i.suggestedLocation}</span>
                    </span>
                    <span className="font-mono">· {i.sourceRef}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
              </button>
            ))}
          </div>
          <Pagination page={pg.page} pageCount={pg.pageCount} onChange={pg.setPage} rangeStart={pg.rangeStart} rangeEnd={pg.rangeEnd} total={pg.total} label={t("putaway.items")} />
        </>
      )}
    </div>
  );
}
