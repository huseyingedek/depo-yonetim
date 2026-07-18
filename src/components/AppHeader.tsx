import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}

export default function AppHeader({ title, subtitle, onBack, right }: Props) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(-1));
  return (
    <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-3">
      <button
        onClick={handleBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-elevated active:scale-95"
        aria-label="Geri"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold leading-tight text-fg">{title}</h1>
        {subtitle && <p className="truncate text-xs text-subtle">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
