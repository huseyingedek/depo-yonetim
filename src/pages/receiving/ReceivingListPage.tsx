import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, PackageCheck, Truck } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import { receiptProgress, receiptTotals } from "../../store/receivingStore";
import type { Receipt } from "../../types";

export default function ReceivingListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.getReceipts().then((d) => {
      setDocs(d);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return docs;
    return docs.filter((d) => d.id.toLowerCase().includes(s) || d.supplier.toLowerCase().includes(s));
  }, [docs, q]);

  const pg = usePagination(filtered, 9);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("receiving.docs")}
        subtitle={t("receiving.title")}
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("receiving.search")} className="field-input w-72 pl-11" />
          </div>
        }
      />

      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("receiving.search")} className="field-input pl-11" />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-ink-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-300">
          <PackageCheck className="mb-2 h-10 w-10" />
          <p className="text-sm">{t("common.noResults")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((d) => {
              const progress = receiptProgress(d);
              const { lineCount, expected } = receiptTotals(d);
              const started = progress > 0;
              return (
                <button
                  key={d.id}
                  onClick={() => navigate(`/receiving/${d.id}`)}
                  className="rounded-2xl border border-ink-100 bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-ink-900">{d.id}</span>
                        <span className={`chip ${started ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {started ? t("picking.status.inProgress") : t("picking.status.new")}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                        <Truck className="h-4 w-4 text-ink-300" /> {d.supplier}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-300" />
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="whitespace-nowrap text-xs font-semibold text-ink-400">
                      {lineCount} {t("receiving.items")} · {expected} adet
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <Pagination page={pg.page} pageCount={pg.pageCount} onChange={pg.setPage} rangeStart={pg.rangeStart} rangeEnd={pg.rangeEnd} total={pg.total} label={t("receiving.items")} />
        </>
      )}
    </div>
  );
}
