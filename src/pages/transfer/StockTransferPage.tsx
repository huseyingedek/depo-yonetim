import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MapPin,
  Check,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ArrowLeftRight,
  Trash2,
  X,
  Plus,
  Minus,
  Send,
  RotateCcw,
  Code,
  Copy,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import {
  useTransferStore,
  qtyRound,
  isoDateToBatch,
} from "../../store/transferStore";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

export default function StockTransferPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const sourceShelf = useTransferStore((s) => s.sourceShelf);
  const targetShelf = useTransferStore((s) => s.targetShelf);
  const items = useTransferStore((s) => s.items);
  const step = useTransferStore((s) => s.step);
  const lotPending = useTransferStore((s) => s.lotPending);
  const batchList = useTransferStore((s) => s.batchList);
  const batchLoading = useTransferStore((s) => s.batchLoading);
  const batchError = useTransferStore((s) => s.batchError);
  const completing = useTransferStore((s) => s.completing);
  const completedResult = useTransferStore((s) => s.completedResult);

  const scanSourceShelf = useTransferStore((s) => s.scanSourceShelf);
  const clearSourceShelf = useTransferStore((s) => s.clearSourceShelf);
  const scanProduct = useTransferStore((s) => s.scanProduct);
  const scanLot = useTransferStore((s) => s.scanLot);
  const selectBatch = useTransferStore((s) => s.selectBatch);
  const cancelLot = useTransferStore((s) => s.cancelLot);
  const updateItemQty = useTransferStore((s) => s.updateItemQty);
  const removeItem = useTransferStore((s) => s.removeItem);
  const clearItems = useTransferStore((s) => s.clearItems);
  const goToTargetStep = useTransferStore((s) => s.goToTargetStep);
  const backToCollectStep = useTransferStore((s) => s.backToCollectStep);
  const scanTargetShelf = useTransferStore((s) => s.scanTargetShelf);
  const clearTargetShelf = useTransferStore((s) => s.clearTargetShelf);
  const setTargetShelf = useTransferStore((s) => s.setTargetShelf);
  const completeTransfer = useTransferStore((s) => s.completeTransfer);
  const reset = useTransferStore((s) => s.reset);

  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [okutmaAdedi, setOkutmaAdedi] = useState("");
  const [partiPrefill, setPartiPrefill] = useState("");
  const [redMesaji, setRedMesaji] = useState<string | null>(null);
  const [jsonAcik, setJsonAcik] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  // Manuel hedef raf seçimi için depolar ve stok yerleri
  const [warehouses, setWarehouses] = useState<{ code: string; name: string }[]>([]);
  const [stockPlaces, setStockPlaces] = useState<{ code: string; name: string }[]>([]);
  const [seciliTargetWh, setSeciliTargetWh] = useState("");
  const [seciliTargetSp, setSeciliTargetSp] = useState("");

  useEffect(() => {
    if (step === "target") {
      api.getWarehouses().then((w) => {
        setWarehouses(w);
        if (w.length > 0 && !seciliTargetWh) {
          setSeciliTargetWh(w[0].code);
        }
      });
    }
  }, [step, seciliTargetWh]);

  useEffect(() => {
    if (seciliTargetWh) {
      api.getStockPlaces(seciliTargetWh).then((sp) => {
        setStockPlaces(sp);
        if (sp.length > 0 && !seciliTargetSp) {
          setSeciliTargetSp(sp[0].code);
        }
      });
    }
  }, [seciliTargetWh, seciliTargetSp]);

  const showToast = (tst: Toast) => {
    if (tst?.kind === "error") sesHata();
    else if (tst) sesBasarili();
    setToast(tst);
    setTimeout(() => setToast(null), 2400);
  };

  const flash = (id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId(null), 600);
  };

  const handleDetected = useCallback(
    async (code: string) => {
      const barkod = code.trim().toUpperCase();
      if (!barkod || busy) return;
      setBusy(true);
      setRedMesaji(null);

      try {
        // 1) HEDEF ADIMINDAYSAK: Hedef raf bekliyoruz
        if (step === "target") {
          const r = await scanTargetShelf(barkod);
          if (r.ok) {
            showToast({ kind: "done", text: r.message });
          } else {
            setRedMesaji(r.message);
            showToast({ kind: "error", text: r.message });
          }
          return;
        }

        // 2) TOPLAMA ADIMINDAYSAK:
        // A) Kaynak raf bekleniyor
        if (!sourceShelf) {
          const r = await scanSourceShelf(barkod);
          if (r.ok) {
            showToast({ kind: "ok", text: r.message });
          } else {
            setRedMesaji(r.message);
            showToast({ kind: "error", text: r.message });
          }
          return;
        }

        // B) Parti bekleniyor
        if (lotPending) {
          const r = await scanLot(barkod);
          if (r.ok) {
            if (r.itemId) flash(r.itemId);
            setPartiPrefill("");
            showToast({ kind: "done", text: r.message });
          } else {
            setRedMesaji(r.message);
            showToast({ kind: "error", text: r.message });
          }
          return;
        }

        // C) Malzeme okutma
        const adet = Number(okutmaAdedi) || 1;
        const res = await scanProduct(barkod, adet);
        if (res.ok) {
          if (res.itemId) flash(res.itemId);
          setOkutmaAdedi("");
          if (res.needsBatch) {
            showToast({ kind: "ok", text: res.message });
          } else {
            showToast({ kind: "ok", text: res.message });
          }
        } else {
          setRedMesaji(res.message);
          showToast({ kind: "error", text: res.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      step,
      sourceShelf,
      lotPending,
      okutmaAdedi,
      scanTargetShelf,
      scanSourceShelf,
      scanLot,
      scanProduct,
    ]
  );

  const partiSec = async (batchNum: string) => {
    if (!batchNum || busy) return;
    setBusy(true);
    try {
      const r = await selectBatch(batchNum);
      if (r.ok) {
        setPartiPrefill("");
        setRedMesaji(null);
        showToast({ kind: "done", text: r.message });
      } else {
        setRedMesaji(r.message);
        showToast({ kind: "error", text: r.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleManualTargetApply = () => {
    if (!seciliTargetWh || !seciliTargetSp) {
      showToast({ kind: "error", text: "Hedef depo ve stok yeri seçin" });
      return;
    }
    setTargetShelf({
      barcode: `${seciliTargetWh}-${seciliTargetSp}`,
      warehouse: seciliTargetWh,
      stockPlace: seciliTargetSp,
    });
    showToast({
      kind: "done",
      text: `Hedef seçildi: ${seciliTargetWh} · ${seciliTargetSp}`,
    });
  };

  const handleCompleteTransfer = async () => {
    setBusy(true);
    setRedMesaji(null);
    try {
      const res = await completeTransfer();
      if (res.ok) {
        sesBasarili();
      } else {
        sesHata();
        setRedMesaji(res.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const toplamKalem = items.length;
  const toplamAdet = items.reduce((sum, it) => sum + it.quantity, 0);

  // ---------------------------------------------------------------------------
  // 3. ADIM: BAŞARI EKRANI
  // ---------------------------------------------------------------------------
  if (step === "success" && completedResult) {
    const payloadStr = JSON.stringify(completedResult.payload, null, 2);
    return (
      <div className="mx-auto max-w-2xl p-4 lg:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-20 w-20 animate-pop-in items-center justify-center rounded-full bg-emerald-100 shadow-soft">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>

          <h1 className="text-2xl font-extrabold text-fg">
            {t("transfer.completed", "Transfer Başarıyla Tamamlandı!")}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <Send className="h-4 w-4" />
            <span>{t("transfer.sentToService", "Transfer paketi servise iletildi")}</span>
          </p>

          {/* Özet Kartı */}
          <div className="mt-6 w-full rounded-2xl border border-line bg-surface p-5 text-left shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Transfer No / Ref
              </span>
              <span className="font-mono text-base font-bold text-fg">
                {completedResult.transferId}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-elevated p-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-subtle">KAYNAK</p>
                <p className="font-mono text-sm font-bold text-fg">
                  Depo {completedResult.payload.sourceWarehouse} ·{" "}
                  {completedResult.payload.sourceStockPlace}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 text-right">
                <p className="text-[11px] font-semibold text-subtle">HEDEF</p>
                <p className="font-mono text-sm font-bold text-emerald-600">
                  Depo {completedResult.payload.targetWarehouse} ·{" "}
                  {completedResult.payload.targetStockPlace}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs text-subtle">Taşınan Kalem</p>
                <p className="font-mono text-xl font-bold text-fg">
                  {completedResult.payload.items.length}
                </p>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs text-subtle">Toplam Miktar</p>
                <p className="font-mono text-xl font-bold text-brand-600">
                  {qtyRound(
                    completedResult.payload.items.reduce((s, it) => s + it.quantity, 0)
                  )}
                </p>
              </div>
            </div>

            {/* JSON Paketi Aç/Kapa */}
            <div className="mt-4 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setJsonAcik((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-semibold text-muted hover:text-fg"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Code className="h-4 w-4 text-brand-500" />
                  Transfer JSON Paketi ({completedResult.payload.items.length} Kalem)
                </span>
                {jsonAcik ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {jsonAcik && (
                <div className="relative mt-2">
                  <pre className="max-h-56 overflow-auto rounded-xl bg-ink-950 p-3 font-mono text-[11px] text-emerald-400">
                    {payloadStr}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(payloadStr);
                      setKopyalandi(true);
                      setTimeout(() => setKopyalandi(false), 2000);
                    }}
                    className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-white/20"
                  >
                    {kopyalandi ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" /> Kopyalandı
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> JSON Kopyala
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="btn-primary btn-lg flex-1 gap-2"
            >
              <RotateCcw className="h-5 w-5" />
              {t("transfer.newTransfer", "Yeni Transfer Başlat")}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                navigate("/home");
              }}
              className="btn-ghost btn-lg flex-1"
            >
              {t("common.backToHome", "Ana Sayfaya Dön")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // ANA TRANSFER EKRANI (TOPLAMA & HEDEF ADIMLARI)
  // Samsung A51/A71 (914x412 Yatay) Tam Uyumlu 2 Sütunlu Düzen
  // ---------------------------------------------------------------------------
  const promptText =
    step === "target"
      ? "Hedef raf barkodunu okutun"
      : !sourceShelf
      ? "Kaynak raf barkodunu okutun"
      : lotPending
      ? "Parti barkodunu okutun"
      : "Malzeme barkodunu okutun";

  return (
    <div className="mx-auto max-w-6xl p-3 md:p-4 lg:p-8 short:h-[100dvh] short:max-w-none short:flex short:flex-col short:overflow-hidden short:p-2">
      {/* Üst Başlık & Eylem Çubuğu */}
      <PageHeader
        title={step === "target" ? "Hedef Lokasyon Belirle" : "Stok Transferi"}
        subtitle={
          step === "target"
            ? "INVT00M1 · Hedef Depo & Stok Yerini Seçin"
            : "INVT00M1 · Serbest Okutma ve Lokasyon Transferi"
        }
        onBack={() => {
          if (step === "target") {
            backToCollectStep();
          } else {
            navigate("/home");
          }
        }}
        right={
          <div className="flex items-center gap-2">
            {step === "collect" ? (
              <>
                <span
                  title="Okutulan toplam malzeme kalemi ve adedi"
                  className="chip bg-brand-100 px-3 py-1 font-mono text-xs font-bold text-brand-700 sm:text-sm"
                >
                  {toplamKalem} kalem · {qtyRound(toplamAdet)} adet
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const r = goToTargetStep();
                    if (!r.ok) {
                      sesHata();
                      setRedMesaji(r.message || "Hata");
                      showToast({ kind: "error", text: r.message || "Hata" });
                    } else {
                      sesBasarili();
                      setRedMesaji(null);
                    }
                  }}
                  disabled={toplamKalem === 0}
                  className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold sm:text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>Taşıma Yap</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={backToCollectStep}
                  className="btn-ghost inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold sm:text-sm"
                >
                  ← Malzemelere Dön
                </button>
                <button
                  type="button"
                  onClick={handleCompleteTransfer}
                  disabled={!targetShelf || completing || busy}
                  className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold sm:text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {completing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Gönderiliyor…</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Transferi Onayla</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        }
      />

      {/* İki Sütunlu Grid Düzen (Yatay Telefonda Yan Yana) */}
      <div className="grid min-w-0 gap-4 md:gap-6 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] short:!flex short:min-h-0 short:flex-1 short:overflow-hidden short:gap-3">
        {/* SOL KOLON: Tarayıcı, Lokasyon Kartları ve Miktar Paneli */}
        <div className="min-w-0 md:sticky md:top-3 md:self-start lg:static xl:sticky xl:top-4 short:!static short:w-[300px] short:shrink-0 short:self-stretch short:overflow-y-auto">
          <div className="card p-3.5 sm:p-4">
            {/* Adım İndikatörleri (Picking ile aynı şablon) */}
            <div className="mb-3 flex items-center gap-1.5">
              {step === "collect" ? (
                (
                  [
                    ["shelf", "Kaynak Raf"],
                    ["product", "Malzeme"],
                    ["lot", "Parti"],
                  ] as const
                ).map(([s, label], i) => {
                  const active =
                    (s === "shelf" && !sourceShelf) ||
                    (s === "product" && !!sourceShelf && !lotPending) ||
                    (s === "lot" && !!lotPending);
                  const done =
                    (s === "shelf" && !!sourceShelf) ||
                    (s === "product" && !!lotPending);

                  const git = () => {
                    if (s === "shelf") {
                      clearSourceShelf();
                    } else if (s === "lot" && lotPending) {
                      // parti aktif
                    }
                  };

                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={git}
                      disabled={s === "product" || (s === "lot" && !lotPending)}
                      className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl px-1.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft ${
                        active
                          ? "bg-brand-600 text-white shadow-soft"
                          : done
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-elevated text-subtle"
                      }`}
                    >
                      <span className="shrink-0 font-mono">{done ? "✓" : i + 1}</span>
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })
              ) : (
                (
                  [
                    ["target", "Hedef Raf"],
                    ["confirm", "Onay"],
                  ] as const
                ).map(([s, label], i) => {
                  const active =
                    (s === "target" && !targetShelf) ||
                    (s === "confirm" && !!targetShelf);
                  const done = s === "target" && !!targetShelf;

                  return (
                    <div
                      key={s}
                      className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl px-1.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft ${
                        active
                          ? "bg-brand-600 text-white shadow-soft"
                          : done
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-elevated text-subtle"
                      }`}
                    >
                      <span className="shrink-0 font-mono">{done ? "✓" : i + 1}</span>
                      <span className="truncate">{label}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* ADIM 1 BİLGİ KARTLARI (Kaynak Raf veya Hedef Raf) */}
            {step === "collect" ? (
              sourceShelf ? (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-emerald-800">
                    <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="truncate">
                      Kaynak: <span className="font-mono font-bold">{sourceShelf.warehouse}</span>
                      {" · "}
                      <span className="font-mono font-bold">{sourceShelf.stockPlace}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={clearSourceShelf}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    <X className="h-3.5 w-3.5" />
                    Değiştir
                  </button>
                </div>
              ) : (
                <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Önce malzemeyi aldığınız kaynak raf barkodunu okutun
                </div>
              )
            ) : targetShelf ? (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-emerald-800">
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="truncate">
                    Hedef: <span className="font-mono font-bold">{targetShelf.warehouse}</span>
                    {" · "}
                    <span className="font-mono font-bold">{targetShelf.stockPlace}</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={clearTargetShelf}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  <X className="h-3.5 w-3.5" />
                  Değiştir
                </button>
              </div>
            ) : (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                Malzemelerin taşınacağı hedef raf barkodunu okutun veya seçin
              </div>
            )}

            {/* PARTİ BEKLEME KUTUSU (Toplama Adımı) */}
            {step === "collect" && lotPending && (
              <div className="mb-3 space-y-2 rounded-xl border border-amber-300 bg-amber-50/60 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs font-bold text-amber-800">
                    {lotPending.name}
                  </span>
                  <button
                    type="button"
                    onClick={cancelLot}
                    className="shrink-0 text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Vazgeç
                  </button>
                </div>
                <p className="text-[11px] font-medium text-amber-700">
                  Parti barkodunu okutun veya stoktan seçin:
                </p>

                {/* Stoktaki Partiler Dropdown */}
                <div>
                  <select
                    defaultValue=""
                    disabled={batchList.length === 0}
                    onChange={(e) => e.target.value && partiSec(e.target.value)}
                    className="h-8 w-full rounded-lg border border-line bg-surface px-2 font-mono text-xs text-fg outline-none focus:border-brand-500"
                  >
                    {batchList.length > 0 ? (
                      <>
                        <option value="" disabled>
                          Stoktaki partiyi seçin…
                        </option>
                        {batchList.map((b) => (
                          <option key={b.batchNum} value={b.batchNum}>
                            {b.batchNum} — {qtyRound(b.availStock)} {b.unit}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value="" disabled>
                        {batchLoading
                          ? "Partiler yükleniyor…"
                          : batchError
                          ? `Hata: ${batchError}`
                          : "Kayıtlı parti bulunamadı"}
                      </option>
                    )}
                  </select>
                </div>

                {/* Tarih Seçimi (Hızlı Parti Kodu) */}
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-[11px] text-muted">SKT:</span>
                  <input
                    type="date"
                    onChange={(e) => setPartiPrefill(isoDateToBatch(e.target.value))}
                    className="h-7 flex-1 rounded-lg border border-line bg-surface px-1.5 font-mono text-xs text-fg outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            )}

            {/* HATA / RED MESAJI */}
            {redMesaji && (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5">
                <div className="flex items-start gap-1.5 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{redMesaji}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRedMesaji(null)}
                  className="mt-1 text-[11px] font-semibold text-rose-700 underline"
                >
                  Kapat
                </button>
              </div>
            )}

            {/* ADET / MİKTAR GİRİŞİ (Sadece toplama adımında kaynak raf varken) */}
            {step === "collect" && sourceShelf && !lotPending && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-elevated px-3 py-1.5">
                <span className="text-xs font-medium text-muted">Kaç adet?</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={okutmaAdedi}
                  onChange={(e) =>
                    setOkutmaAdedi(e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, ""))
                  }
                  placeholder="1"
                  className="h-8 w-16 rounded-lg border border-line bg-surface text-center font-mono text-sm font-bold text-fg outline-none focus:border-brand-500"
                />
                <span className="text-[11px] text-subtle">
                  okutulan barkoddan taşınacak adet
                </span>
              </div>
            )}

            {/* HEDEF SEÇİMİ İÇİN MANUEL DROPDOWN'LAR (Barkodsuz alternatif) */}
            {step === "target" && (
              <div className="mb-3 rounded-xl bg-elevated p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-muted">Veya Listeden Seç:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={seciliTargetWh}
                    onChange={(e) => {
                      setSeciliTargetWh(e.target.value);
                      setSeciliTargetSp("");
                    }}
                    className="h-8 rounded-lg border border-line bg-surface px-1.5 font-mono text-xs text-fg outline-none focus:border-brand-500"
                  >
                    <option value="" disabled>
                      Hedef Depo
                    </option>
                    {warehouses.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={seciliTargetSp}
                    onChange={(e) => setSeciliTargetSp(e.target.value)}
                    disabled={!stockPlaces.length}
                    className="h-8 rounded-lg border border-line bg-surface px-1.5 font-mono text-xs text-fg outline-none focus:border-brand-500"
                  >
                    <option value="" disabled>
                      Stok Yeri
                    </option>
                    {stockPlaces.map((sp) => (
                      <option key={sp.code} value={sp.code}>
                        {sp.code}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleManualTargetApply}
                  disabled={!seciliTargetWh || !seciliTargetSp}
                  className="btn-ghost w-full py-1 text-xs font-semibold disabled:opacity-40"
                >
                  Seçimi Hedef Olarak Belirle
                </button>
              </div>
            )}

            {/* BARKOD OKUYUCU (ZXing kamera ve elle giriş) */}
            <BarcodeScanner
              onDetected={handleDetected}
              prompt={promptText}
              prefill={lotPending ? partiPrefill : ""}
              hideCardWrapper
            />

            {busy && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> okunuyor…
              </p>
            )}
          </div>
        </div>

        {/* SAĞ KOLON: Taşınacak Malzemeler Sepeti ve Özet Tablo */}
        <div className="min-w-0 short:flex-1 short:overflow-y-auto short:pr-1">
          {step === "collect" ? (
            <div>
              {/* Başlık ve Temizle Butonu */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-brand-600" />
                  <h2 className="text-base font-bold text-fg">
                    Taşınacak Malzemeler
                  </h2>
                  <span className="chip bg-elevated font-mono text-xs text-subtle">
                    {items.length} Kalem
                  </span>
                </div>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Okutulan tüm malzemeleri temizlemek istiyor musunuz?")) {
                        clearItems();
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-subtle hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Tümünü Sil
                  </button>
                )}
              </div>

              {/* Malzeme Kartları Listesi */}
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/50 p-8 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
                    <ArrowLeftRight className="h-7 w-7 text-amber-500" />
                  </div>
                  <h3 className="text-sm font-bold text-fg">
                    Henüz Malzeme Okutulmadı
                  </h3>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-subtle">
                    1. Sol panelden <strong>Kaynak Raf</strong> barkodunu okutun.
                    <br />
                    2. Taşınacak <strong>Malzeme Barkodunu</strong> okutun.
                    <br />
                    3. Tüm malzemeleri ekledikten sonra <strong>"Taşıma Yap"</strong> butonuna basın.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item, idx) => {
                    const flashing = flashId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border bg-surface p-3.5 shadow-card transition-all duration-300 ease-soft ${
                          flashing ? "border-brand-400 ring-2 ring-brand-200" : "border-line"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 font-mono text-xs font-bold text-brand-700">
                            {idx + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-fg">
                              {item.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                              <span className="font-mono font-semibold text-fg">
                                {item.material}
                              </span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-muted">
                                <MapPin className="h-3 w-3 text-subtle" />
                                {item.sourceWarehouse} / {item.sourceStockPlace}
                              </span>

                              {item.batchNum && (
                                <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet-700">
                                  Parti: {item.batchNum}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Miktar Arttır / Azalt / Sil Kontrolleri */}
                          <div className="flex shrink-0 items-center gap-1.5">
                            <div className="flex items-center rounded-xl border border-line bg-elevated p-0.5">
                              <button
                                type="button"
                                onClick={() => updateItemQty(item.id, item.quantity - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted shadow-xs transition hover:bg-line active:scale-95"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="min-w-10 text-center font-mono text-sm font-bold text-fg">
                                {qtyRound(item.quantity)}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateItemQty(item.id, item.quantity + 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted shadow-xs transition hover:bg-line active:scale-95"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="text-xs font-semibold text-subtle">
                              {item.unit}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="ml-1 flex h-8 w-8 items-center justify-center rounded-xl text-subtle transition hover:bg-rose-50 hover:text-rose-600"
                              title="Sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* HEDEF ADIMI: Transfer Paketi İnceleme ve Onay */
            <div className="space-y-3">
              {/* Rota Özeti Kartı */}
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                  Transfer Rotası
                </p>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-elevated p-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-subtle">ÇIKIŞ LOKASYONU</p>
                    <p className="font-mono text-sm font-extrabold text-fg">
                      Depo {sourceShelf?.warehouse || items[0]?.sourceWarehouse} ·{" "}
                      {sourceShelf?.stockPlace || items[0]?.sourceStockPlace}
                    </p>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[11px] font-semibold text-subtle">HEDEF LOKASYON</p>
                    {targetShelf ? (
                      <p className="font-mono text-sm font-extrabold text-emerald-600">
                        Depo {targetShelf.warehouse} · {targetShelf.stockPlace}
                      </p>
                    ) : (
                      <p className="text-xs font-bold text-amber-600 animate-pulse">
                        Hedef Bekleniyor…
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Transfer Edilecek Kalemler Tablosu */}
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-fg">
                    Paket İçeriği ({items.length} Kalem · {qtyRound(toplamAdet)} Adet)
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-subtle">
                        <th className="pb-2 font-semibold">Malzeme</th>
                        <th className="pb-2 font-semibold">Parti</th>
                        <th className="pb-2 text-right font-semibold">Miktar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2.5">
                            <p className="font-semibold text-fg">{it.name}</p>
                            <p className="font-mono text-[11px] text-subtle">{it.material}</p>
                          </td>
                          <td className="py-2.5 font-mono text-muted">
                            {it.batchNum || "—"}
                          </td>
                          <td className="py-2.5 text-right font-mono font-bold text-fg">
                            {qtyRound(it.quantity)} {it.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tamamlama Butonu */}
              <button
                type="button"
                onClick={handleCompleteTransfer}
                disabled={!targetShelf || completing || busy}
                className="btn-primary btn-lg w-full gap-2 shadow-soft disabled:opacity-40"
              >
                {completing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Transfer Gönderiliyor…</span>
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    <span>Transferi Onayla ve Servise Gönder</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bildirim Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-soft">
          {toast.text}
        </div>
      )}
    </div>
  );
}
