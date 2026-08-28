import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, X, CornerDownLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onDetected: (barcode: string) => void;
  prompt?: string;
  prefill?: string;
  placeholder?: string;
  hideCardWrapper?: boolean;
  compact?: boolean;
}

const SCAN_COOLDOWN = 1200;

export default function BarcodeScanner({
  onDetected,
  prompt,
  prefill,
  placeholder,
  hideCardWrapper,
  compact,
}: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (prefill) setValue(prefill);
  }, [prefill]);

  const emit = (code: string) => {
    const now = Date.now();
    const last = lastScanRef.current;
    if (code === last.code && now - last.at < SCAN_COOLDOWN) return;
    lastScanRef.current = { code, at: now };
    onDetected(code);
  };

  useEffect(() => {
    if (!cameraOpen) return;
    let active = true;
    setCameraError(false);
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && active) emit(result.getText());
      })
      .then((controls) => {
        if (active) controlsRef.current = controls;
        else controls.stop();
      })
      .catch(() => {
        if (active) setCameraError(true);
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  const submit = () => {
    const code = value.trim().toUpperCase();
    if (!code) return;
    onDetected(code);
    setValue("");
  };

  const inputContent = (
    <>
      {Boolean(prompt) && <label className="field-label">{prompt}</label>}
      <div className={`flex ${compact ? "gap-1" : "gap-2"}`}>
        <div className="relative min-w-0 flex-1">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={placeholder ?? t("picking.enterBarcode")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={`field-input font-mono tracking-wider ${
              compact ? "h-8 py-0.5 pr-7 text-[12px] sm:text-[13px]" : "pr-11"
            }`}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            aria-label={t("picking.confirm")}
            className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg disabled:opacity-30 ${
              compact ? "right-1 h-6 w-6" : "right-2 h-8 w-8"
            }`}
          >
            <CornerDownLeft className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setCameraOpen((v) => !v)}
          aria-label={t("picking.camera")}
          className={`shrink-0 flex items-center justify-center border transition ${
            compact ? "h-8 w-8 rounded-lg" : "h-12 w-12 rounded-xl"
          } ${
            cameraOpen
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-line bg-surface text-muted hover:bg-elevated"
          }`}
        >
          {cameraOpen ? (
            <X className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} />
          ) : (
            <Camera className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} />
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      {hideCardWrapper ? (
        inputContent
      ) : (
        <div className="rounded-2xl bg-surface p-4 shadow-card">{inputContent}</div>
      )}

      {}
      {cameraOpen && (
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-ink-950">
          {!cameraError ? (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-52 w-64">
                  <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-lg border-l-4 border-t-4 border-white" />
                  <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-lg border-r-4 border-t-4 border-white" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-lg border-b-4 border-l-4 border-white" />
                  <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-lg border-b-4 border-r-4 border-white" />
                  <div className="absolute inset-x-2 top-2 h-0.5 animate-scan-line bg-brand-400 shadow-[0_0_12px_2px_rgba(89,141,255,0.8)]" />
                </div>
              </div>
              <p className="absolute inset-x-0 bottom-3 text-center text-[13px] font-medium text-white/90">
                {prompt ?? t("picking.scanProduct")}
              </p>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm text-white/80">{t("common.cameraPermission")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
