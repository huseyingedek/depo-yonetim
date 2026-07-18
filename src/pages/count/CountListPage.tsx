import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Calculator, MapPin } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import type { CountTask } from "../../types";

export default function CountListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<CountTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.getCountTasks().then((d) => {
      setTasks(d);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return tasks;
    return tasks.filter((c) => c.location.toLowerCase().includes(s) || c.lines.some((l) => l.product.name.toLowerCase().includes(s)));
  }, [tasks, q]);

  const pg = usePagination(filtered, 9);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("count.tasks")}
        subtitle={t("count.title")}
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("count.search")} className="field-input w-72 pl-11" />
          </div>
        }
      />
      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("count.search")} className="field-input pl-11" />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-300">
          <Calculator className="mb-2 h-10 w-10" />
          <p className="text-sm">{t("common.noResults")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/count/${c.id}`)}
                className="flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                  <MapPin className="h-5 w-5 text-rose-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-bold text-ink-900">{c.location}</p>
                  <p className="text-xs text-ink-400">{c.lines.length} {t("count.items")} · {c.reference}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
              </button>
            ))}
          </div>
          <Pagination page={pg.page} pageCount={pg.pageCount} onChange={pg.setPage} rangeStart={pg.rangeStart} rangeEnd={pg.rangeEnd} total={pg.total} label={t("count.items")} />
        </>
      )}
    </div>
  );
}
