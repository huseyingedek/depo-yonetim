import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useHataStore } from "../store/hataStore";

// Tek yerde (AppShell'de) mount edilir; uygulamanın her yerinden gelen hataları gösterir.
export default function GlobalHataToast() {
  const mesaj = useHataStore((s) => s.mesaj);
  const kapat = useHataStore((s) => s.kapat);

  useEffect(() => {
    if (!mesaj) return;
    const t = setTimeout(kapat, 5000);
    return () => clearTimeout(t);
  }, [mesaj, kapat]);

  if (!mesaj) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-soft animate-pop-in">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1 whitespace-pre-line">{mesaj}</span>
        <button type="button" onClick={kapat} className="shrink-0 rounded p-0.5 transition hover:bg-white/20">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
