import { useCallback, useState } from "react";
import { Check, AlertTriangle, Info } from "lucide-react";

export type ToastKind = "ok" | "done" | "error" | "err" | "info" | "warn";

export type ToastMsg = { kind: ToastKind; text: string } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastMsg>(null);
  const show = useCallback((msg: ToastMsg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);
  return { toast, show };
}

export default function ToastView({
  toast,
  kind,
  text,
}: {
  toast?: ToastMsg;
  kind?: ToastKind;
  text?: string;
}) {
  const activeToast = toast ?? (kind && text ? { kind, text } : null);
  if (!activeToast) return null;

  const isErr = activeToast.kind === "error" || activeToast.kind === "err";
  const isOk = activeToast.kind === "done" || activeToast.kind === "ok";
  const isWarn = activeToast.kind === "warn";
  const isInfo = activeToast.kind === "info";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
      <div
        className={`flex animate-pop-in items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-soft ${
          isErr
            ? "bg-rose-500"
            : isOk
              ? "bg-emerald-600"
              : isWarn
                ? "bg-amber-500"
                : isInfo
                  ? "bg-sky-600"
                  : "bg-ink-900"
        }`}
      >
        {isErr ? (
          <AlertTriangle className="h-4 w-4" />
        ) : isWarn ? (
          <AlertTriangle className="h-4 w-4" />
        ) : isInfo ? (
          <Info className="h-4 w-4" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {activeToast.text}
      </div>
    </div>
  );
}
