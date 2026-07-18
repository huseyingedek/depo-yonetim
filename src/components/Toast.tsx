import { useCallback, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";

export type ToastMsg = { kind: "ok" | "done" | "error"; text: string } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastMsg>(null);
  const show = useCallback((msg: ToastMsg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);
  return { toast, show };
}

export default function ToastView({ toast }: { toast: ToastMsg }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
      <div
        className={`flex animate-pop-in items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-soft ${
          toast.kind === "error" ? "bg-rose-500" : toast.kind === "done" ? "bg-emerald-600" : "bg-ink-900"
        }`}
      >
        {toast.kind === "error" ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {toast.text}
      </div>
    </div>
  );
}
