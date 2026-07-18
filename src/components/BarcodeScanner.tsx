import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Keyboard, X, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  onDetected: (barcode: string) => void;
  /** Demo "örnek okut" butonunun döndüreceği geçerli barkod. */
  sampleBarcode?: string;
}

/**
 * Kamera tabanlı barkod okuyucu (zxing).
 * - Kamerayı açar ve sürekli tarar.
 * - İzin yoksa/başarısızsa elle giriş moduna düşer.
 * - Demo için "örnek okut" butonu vardır (fiziksel barkod olmadan sunum yapmak için).
 */
const SCAN_COOLDOWN = 1200; // aynı barkodun tekrar tetiklenmesini engelle (ms)

export default function BarcodeScanner({ onDetected, sampleBarcode }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [cameraError, setCameraError] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");

  // Sürekli tarama tek bir okutmayı çok kez tetiklemesin diye debounce
  const emit = (code: string) => {
    const now = Date.now();
    const last = lastScanRef.current;
    if (code === last.code && now - last.at < SCAN_COOLDOWN) return;
    lastScanRef.current = { code, at: now };
    onDetected(code);
  };

  useEffect(() => {
    if (manualMode) return;
    let active = true;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && active) {
          emit(result.getText());
        }
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
  }, [manualMode]);

  const submitManual = () => {
    if (manualValue.trim()) {
      onDetected(manualValue.trim());
      setManualValue("");
    }
  };

  if (manualMode) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted">{t("picking.manualEntry")}</span>
          <button onClick={() => setManualMode(false)} className="text-subtle hover:text-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          autoFocus
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitManual()}
          placeholder={t("picking.enterBarcode")}
          inputMode="numeric"
          className="field-input font-mono tracking-wider"
        />
        <button onClick={submitManual} className="btn-primary btn-lg btn-block">
          {t("picking.confirm")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-ink-950">
        {!cameraError ? (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {/* Hedef çerçeve + tarama çizgisi */}
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
              {t("picking.scanProduct")}
            </p>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-white/80">{t("common.cameraPermission")}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setManualMode(true)} className="btn-ghost h-12">
          <Keyboard className="h-5 w-5" />
          {t("picking.manualEntry")}
        </button>
        <button
          onClick={() => sampleBarcode && onDetected(sampleBarcode)}
          disabled={!sampleBarcode}
          className="btn-ghost h-12"
        >
          <Zap className="h-5 w-5" />
          {t("picking.simulate")}
        </button>
      </div>
    </div>
  );
}
