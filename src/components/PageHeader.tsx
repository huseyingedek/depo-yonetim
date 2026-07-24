import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  backTo?: string; // verilirse geri butonu gösterilir
  /** Verilirse geri butonu bunu çağırır (backTo yerine). Ör. çıkarken ClosePick. */
  onBack?: () => void;
  right?: ReactNode;
}

/** İçerik alanı başlığı (web + mobil uyumlu). */
export default function PageHeader({ title, subtitle, backTo, onBack, right }: Props) {
  const navigate = useNavigate();
  const geriGoster = onBack || backTo;
  return (
    <div className="mb-6 flex items-start gap-3">
      {geriGoster && (
        <button
          onClick={() => (onBack ? onBack() : backTo && navigate(backTo))}
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-elevated active:scale-95"
          aria-label="Geri"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-extrabold text-fg lg:text-2xl">{title}</h1>
        {subtitle && <p className="truncate text-sm text-subtle">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
