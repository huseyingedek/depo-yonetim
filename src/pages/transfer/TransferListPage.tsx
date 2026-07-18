import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, ArrowLeftRight, ArrowRight } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import type { TransferTask } from "../../types";

export default function TransferListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TransferTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.getTransferTasks().then((d) => {
      setTasks(d);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tasks;
    return tasks.filter(
      (tk) => tk.product.name.toLowerCase().includes(s) || tk.fromLocation.toLowerCase().includes(s) || tk.toLocation.toLowerCase().includes(s)
    );
  }, [tasks, q]);

  const pg = usePagination(filtered, 8);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("transfer.tasks")}
        subtitle={t("transfer.title")}
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("transfer.search")} className="field-input w-72 pl-11" />
          </div>
        }
      />
      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("transfer.search")} className="field-input pl-11" />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-elevated" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-subtle">
          <ArrowLeftRight className="mb-2 h-10 w-10" />
          <p className="text-sm">{t("common.noResults")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {pg.pageItems.map((tk) => (
              <button
                key={tk.id}
                onClick={() => navigate(`/transfer/${tk.id}`)}
                className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <span className="text-sm font-bold text-amber-600">{tk.qty}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{tk.product.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                    <span className="font-mono font-semibold text-muted">{tk.fromLocation}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-mono font-semibold text-amber-600">{tk.toLocation}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-subtle" />
              </button>
            ))}
          </div>
          <Pagination page={pg.page} pageCount={pg.pageCount} onChange={pg.setPage} rangeStart={pg.rangeStart} rangeEnd={pg.rangeEnd} total={pg.total} label={t("transfer.items")} />
        </>
      )}
    </div>
  );
}
