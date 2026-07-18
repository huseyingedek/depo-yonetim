import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  backTo?: string; // verilirse geri butonu gösterilir
  right?: ReactNode;
}

/** İçerik alanı başlığı (web + mobil uyumlu). */
export default function PageHeader({ title, subtitle, backTo, right }: Props) {
  const navigate = useNavigate();
  return (
    <div className="mb-6 flex items-start gap-3">
      {backTo && (
        <button
          onClick={() => navigate(backTo)}
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-500 transition hover:bg-ink-50 active:scale-95"
          aria-label="Geri"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-extrabold text-ink-900 lg:text-2xl">{title}</h1>
        {subtitle && <p className="truncate text-sm text-ink-400">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
