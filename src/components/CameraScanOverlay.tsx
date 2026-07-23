import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  /** Okunan barkod. Aynı kod arka arkaya tetiklenmez. */
  onDetected: (barcode: string) => void;
  onClose: () => void;
  /** Kameranın altında gösterilecek yönerge. */
  prompt?: string;
}

/** Aynı barkodun sürekli taramada defalarca tetiklenmesini engeller (ms). */
const SCAN_COOLDOWN = 1200;

/**
 * Tam ekran kamera okuyucu.
 *
 * BarcodeScanner'dan farkı: metin kutusu yok, sadece kamera.
 * Zaten bir arama/giriş alanı olan ekranlarda (ör. açık sipariş listesi)
 * o alanın yanındaki kamera ikonuyla açılır.
 */
export default function CameraScanOverlay({ onDetected, onClose, prompt }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    let active = true;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (!result || !active) return;
        const code = result.getText();
        const now = Date.now();
        const last = lastScanRef.current;
        if (code === last.code && now - last.at < SCAN_COOLDOWN) return;
        lastScanRef.current = { code, at: now };
        onDetected(code);
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
  }, []);

  // Escape ile kapat
  useEffect(() => {
    const kapat = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", kapat);
    return () => window.removeEventListener("keydown", kapat);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-ink-950">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-black/50 text-white transition hover:bg-black/70"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative aspect-square w-full">
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
              {prompt && (
                <p className="absolute inset-x-0 bottom-3 text-center text-[13px] font-medium text-white/90">
                  {prompt}
                </p>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm text-white/80">{t("common.cameraPermission")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
