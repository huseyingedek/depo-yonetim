import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Basit istemci-taraflı sayfalama. Gerçek serviste sunucu-taraflı sayfalamaya
 * (page/size parametreleri) kolayca çevrilebilir.
 */
export function usePagination<T>(items: T[], pageSize = 9) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);
  return {
    page: current,
    pageCount,
    pageItems,
    setPage,
    total: items.length,
    rangeStart: items.length === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, items.length),
    reset: () => setPage(1),
  };
}

interface Props {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  label?: string;
}

export default function Pagination({ page, pageCount, onChange, rangeStart, rangeEnd, total, label }: Props) {
  if (total === 0) return null;

  // Görünecek sayfa numaraları (aktif etrafında pencere)
  const pages: (number | "…")[] = [];
  const window = 1;
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - window && i <= page + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-subtle">
        {rangeStart}–{rangeEnd} / {total} {label}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(page - 1)}
            disabled={page === 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:bg-elevated disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-subtle">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p)}
                className={`h-9 min-w-9 rounded-lg px-2 text-sm font-semibold transition ${
                  p === page ? "bg-brand-600 text-white" : "border border-line bg-surface text-muted hover:bg-elevated"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            onClick={() => onChange(page + 1)}
            disabled={page === pageCount}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:bg-elevated disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
