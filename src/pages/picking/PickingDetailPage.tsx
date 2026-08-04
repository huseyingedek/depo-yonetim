import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MapPin, Check, AlertTriangle, Loader2, PackagePlus, X, RotateCcw,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import {
  usePickingStore, orderProgress, linePicked,
} from "../../store/pickingStore";
import { isoDateToBatch, qtyRound, toOrderQty } from "../../store/pickingLogic";
import { sesBasarili, sesHata } from "../../sound";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

const baglantiHatasiMi = (m?: string) => !!m && /cevaplanmad|ulaşılamıyor|bağlantı/i.test(m);

export default function PickingDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get("type") ?? "";

  const order = usePickingStore((s) => s.order);
  const loading = usePickingStore((s) => s.loading);
  const locationsLoading = usePickingStore((s) => s.locationsLoading);
  const shelf = usePickingStore((s) => s.shelf);
  const loadOrder = usePickingStore((s) => s.loadOrder);
  const leaveOrder = usePickingStore((s) => s.leaveOrder);
  const scanShelf = usePickingStore((s) => s.scanShelf);
  const clearShelf = usePickingStore((s) => s.clearShelf);
  const scanProduct = usePickingStore((s) => s.scanProduct);
  const scanLot = usePickingStore((s) => s.scanLot);
  const batchList = usePickingStore((s) => s.batchList);
  const batchError = usePickingStore((s) => s.batchError);
  const batchLoading = usePickingStore((s) => s.batchLoading);
  const selectBatch = usePickingStore((s) => s.selectBatch);

  const [toast, setToast] = useState<Toast>(null);
  const [flashLine, setFlashLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [lotPending, setLotPending] = useState<string | null>(null);

  const [partiPrefill, setPartiPrefill] = useState("");
  // Raf combosundan seçilince barkod alanına dolacak raf barkodu.
  const [rafPrefill, setRafPrefill] = useState("");

  const [secilenRaf, setSecilenRaf] = useState<Record<string, string>>({});

  const [okutmaAdedi, setOkutmaAdedi] = useState("");

  const [redMesaji, setRedMesaji] = useState<string | null>(null);

  const [sonCevapsiz, setSonCevapsiz] = useState<string | null>(null);

  const [geriYuklemeHatalari, setGeriYuklemeHatalari] = useState<string[]>([]);

  // ikinci çağrının gitmemesi önemli.
  const yuklendi = useRef("");

  useEffect(() => {
    if (!id) return;
    const anahtar = `${id}|${orderType}`;

    if (yuklendi.current === anahtar) return;
    yuklendi.current = anahtar;
    loadOrder(id, orderType);
  }, [id, orderType, loadOrder]);

  const showToast = (tst: Toast) => {
    // Okutma sesi: hata → uyarı sesi, diğerleri → başarılı bip.
    if (tst?.kind === "error") sesHata();
    else if (tst) sesBasarili();
    setToast(tst);
    setTimeout(() => setToast(null), 2200);
  };

  const flash = (lineId: string) => {
    setFlashLine(lineId);
    setTimeout(() => setFlashLine(null), 600);
  };

  const handleDetected = useCallback(
    async (code: string) => {
      const barkod = code.trim();
      if (!barkod || busy) return;
      setBusy(true);
      setSonCevapsiz(null);
      try {
        // 1) Raf bekleniyor
        if (!shelf) {
          const r = await scanShelf(barkod);
          if (r.ok) {
            setRedMesaji(null);

            setGeriYuklemeHatalari(r.restoreErrors ?? []);
            showToast({ kind: "ok", text: `Raf: ${barkod}` });
          } else {
            if (baglantiHatasiMi(r.message)) setSonCevapsiz(barkod);
            showToast({ kind: "error", text: r.message });
          }
          return;
        }

        if (lotPending) {
          const lr = await scanLot(lotPending, barkod);
          if (lr.ok) {
            setLotPending(null);
            setPartiPrefill(""); // M3: tarih prefill'i sıfırla
            setRedMesaji(null);
            showToast({ kind: "done", text: `Parti: ${barkod}` });
          } else {
            if (baglantiHatasiMi(lr.message)) setSonCevapsiz(barkod);
            setRedMesaji(lr.message);
            showToast({ kind: "error", text: lr.message });
          }
          return;
        }

        const s = await scanProduct(barkod, Number(okutmaAdedi) || 1);
        setRedMesaji(null);
        if (s.kind === "ok") {
          setOkutmaAdedi("");
          flash(s.lineId);
          showToast({ kind: "ok", text: `${s.name} eklendi` });
        } else if (s.kind === "needsBatch") {

          flash(s.lineId);
          setLotPending(s.lineId);
          showToast({ kind: "ok", text: `${s.name} · parti barkodunu okutun` });
        } else if (s.kind === "notInOrder") {
          showToast({ kind: "error", text: `${s.material} bu emirde yok` });
        } else if (s.kind === "alreadyDone") {
          flash(s.lineId);
          showToast({ kind: "done", text: "Bu kalem tamamlandı" });
        } else if (s.kind === "exceedsOrder" || s.kind === "noStock") {
          sesHata(); // toast yok ama okutma başarısız → hata sesi
          flash(s.lineId);
          setRedMesaji(s.message);

          if (s.kind === "exceedsOrder" && s.enFazla > 0) setOkutmaAdedi(String(s.enFazla));
        } else {
          if (baglantiHatasiMi(s.message)) setSonCevapsiz(barkod);
          showToast({ kind: "error", text: s.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, shelf, lotPending, order, okutmaAdedi, scanShelf, scanProduct, scanLot]
  );

  const partiSec = async (batchNum: string) => {
    if (!lotPending || !batchNum || busy) return;
    setBusy(true);
    try {
      const r = await selectBatch(lotPending, batchNum);
      if (r.ok) {
        setLotPending(null);
        setPartiPrefill("");
        setRedMesaji(null);
        showToast({ kind: "done", text: `Parti: ${batchNum}` });
      } else {
        setRedMesaji(r.message);
        showToast({ kind: "error", text: r.message });
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading || !order) {
    return (
      <div className="mx-auto max-w-6xl p-4 lg:p-8">
        <PageHeader title={t("picking.title")} backTo="/picking" />
        <div className="flex items-center justify-center py-24 text-subtle">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  const progress = orderProgress(order);

  const toplamKalem = order.lines.length;
  const tamamlananKalem = order.lines.filter((l) => linePicked(l) >= l.requestedQty).length;

  const partisiEksik = order.lines.filter(
    (l) => l.lotTracked && (l.records?.length ?? 0) > 0 && !l.lot
  );

  const fazlaToplanan = order.lines.filter((l) => linePicked(l) > l.requestedQty);

  const engel =
    partisiEksik.length > 0
      ? `Parti barkodu okutulmayan kalem var: ${partisiEksik
          .map((l) => l.product.code)
          .join(", ")}. Bu ürünler son kullanma tarihi takipli, parti girilmeden paketlenemez.`
      : fazlaToplanan.length > 0
      ? `Fazla toplanmış kalem var: ${fazlaToplanan
          .map((l) => `${l.product.code} (${linePicked(l)}/${qtyRound(l.requestedQty)})`)
          .join(", ")}. Düzeltilmeden paketlenemez.`
      : "";

  const toplamKayit = order.lines.reduce((t, l) => t + (l.records?.length ?? 0), 0);

  const rafta = (line: { suggestions?: { barcode: string }[] }) =>
    !!shelf && !!line.suggestions?.some((s) => s.barcode === shelf.barcode);

  const sortedLines = [...order.lines].sort((a, b) => {
    const aDone = linePicked(a) >= a.requestedQty ? 1 : 0;
    const bDone = linePicked(b) >= b.requestedQty ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aRaf = rafta(a) ? 0 : 1;
    const bRaf = rafta(b) ? 0 : 1;
    return aRaf - bRaf;
  });

  const promptText = !shelf
    ? "Raf barkodunu okutun"
    : lotPending
    ? "Parti barkodunu okutun"
    : "Ürün barkodunu okutun";

  return (
    <div className="mx-auto max-w-6xl p-3 md:p-4 lg:p-8 short:h-[100dvh] short:max-w-none short:flex short:flex-col short:overflow-hidden short:p-2">
      <PageHeader
        title={order.id}
        subtitle={[order.customer, order.reference].filter(Boolean).join(" · ")}
        onBack={() => {

          leaveOrder();
          navigate("/picking");
        }}
        right={
          <div className="flex items-center gap-2">
            <span
              title="Tamamlanan kalem / toplam kalem"
              className="chip bg-brand-100 px-3 py-1 font-mono text-sm text-brand-700"
            >
              {tamamlananKalem}/{toplamKalem} kalem
            </span>
            {}
            <button
              onClick={() => navigate(`/picking/${order.id}/summary`)}
              disabled={!!engel}
              title={engel || undefined}
              className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PackagePlus className="h-4 w-4" />
              {t("picking.placeInPackage")}
            </button>
          </div>
        }
      />

      {}
      <div className="grid min-w-0 gap-4 md:gap-6 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] short:!flex short:min-h-0 short:flex-1 short:overflow-hidden short:gap-3">
        {}
        <div className="min-w-0 md:sticky md:top-3 md:self-start lg:static xl:sticky xl:top-4 short:!static short:w-[300px] short:shrink-0 short:self-stretch short:overflow-y-auto">
          <div className="card p-4">
            {}
            <div className="mb-3 flex items-center gap-1.5">
              {(
                [
                  ["shelf", "Raf"],
                  ["product", "Ürün"],
                  ["lot", "Parti"],
                ] as const
              ).map(([s, label], i) => {
                const active =
                  (s === "shelf" && !shelf) ||
                  (s === "product" && !!shelf && !lotPending) ||
                  (s === "lot" && !!lotPending);
                const done =
                  (s === "shelf" && !!shelf) || (s === "product" && !!lotPending);

                const partiBekleyen = order?.lines.find(
                  (l) => l.lotTracked && (l.records?.length ?? 0) > 0 && !l.lot
                );
                const tiklanabilir =
                  (s === "shelf" && !!shelf) || (s === "lot" && !!partiBekleyen);

                const git = () => {
                  if (s === "shelf") {
                    clearShelf();
                    setLotPending(null);
                  } else if (s === "lot" && partiBekleyen) {
                    setLotPending(partiBekleyen.id);
                  }
                };

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={git}
                    disabled={!tiklanabilir}
                    className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl px-1.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft ${
                      active
                        ? "bg-brand-600 text-white shadow-soft"
                        : done
                        ? "bg-emerald-100 text-emerald-700"
                        : tiklanabilir
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "bg-elevated text-subtle"
                    } ${tiklanabilir ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span className="shrink-0 font-mono">{done ? "✓" : i + 1}</span>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>

            {}
            {shelf ? (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-emerald-800">
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="truncate">
                    Depo: <span className="font-mono font-bold">{shelf.warehouse}</span>
                    {" · "}
                    Stok yeri: <span className="font-mono font-bold">{shelf.stockPlace}</span>
                  </span>
                </span>
                <button
                  onClick={() => {
                    clearShelf();
                    setLotPending(null);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  <X className="h-3.5 w-3.5" />
                  Rafı değiştir
                </button>
              </div>
            ) : (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                Önce bulunduğunuz rafın barkodunu okutun
              </div>
            )}

            {}
            {lotPending && (
              <>
                <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-medium text-amber-800">
                    Parti barkodu bekleniyor
                  </span>
                  <button
                    onClick={() => {
                      setLotPending(null);
                      setPartiPrefill("");
                    }}
                    className="shrink-0 text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Vazgeç
                  </button>
                </div>
                {}
                <div className="mb-3 rounded-xl bg-elevated px-3 py-2">
                  <span className="mb-1 block text-xs font-medium text-muted">Parti seç (stoktakiler)</span>
                  <select
                    defaultValue=""
                    disabled={batchList.length === 0}
                    onChange={(e) => e.target.value && partiSec(e.target.value)}
                    className="h-9 w-full rounded-lg border border-line bg-surface px-2 font-mono text-sm text-fg outline-none focus:border-brand-500 disabled:opacity-70"
                  >
                    {batchList.length > 0 ? (
                      <>
                        <option value="" disabled>
                          Parti seçin…
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
                          ? "Yükleniyor…"
                          : batchError
                          ? `Veri yüklenemedi — ${batchError}`
                          : "Parti bulunamadı"}
                      </option>
                    )}
                  </select>
                </div>

                {}
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-elevated px-3 py-2">
                  <span className="shrink-0 text-xs font-medium text-muted">Tarih seç</span>
                  <input
                    type="date"
                    onChange={(e) => setPartiPrefill(isoDateToBatch(e.target.value))}
                    className="h-8 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-sm text-fg outline-none focus:border-brand-500"
                  />
                </div>
              </>
            )}

            {}
            {}
            {redMesaji && (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                  <span>{redMesaji}</span>
                </div>
                <button
                  onClick={() => setRedMesaji(null)}
                  className="mt-2 text-xs font-semibold text-rose-700 underline"
                >
                  Anladım
                </button>
              </div>
            )}

            {}
            {sonCevapsiz && (
              <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="mb-2 text-xs font-semibold text-amber-800">
                  İstek cevaplanmadı — bağlantı sorunu olabilir. Aynı okutmayı tekrar gönderebilirsiniz.
                </p>
                <button
                  onClick={() => {
                    const k = sonCevapsiz;
                    setSonCevapsiz(null);
                    if (k) handleDetected(k);
                  }}
                  disabled={busy}
                  className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" /> Tekrar Dene
                </button>
              </div>
            )}

            {shelf && !lotPending && (
              <div
                className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 ${
                  redMesaji ? "bg-rose-50 ring-1 ring-rose-300" : "bg-elevated"
                }`}
              >
                <span className="text-xs font-medium text-muted">Kaç tane?</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={okutmaAdedi}
                  onChange={(e) => setOkutmaAdedi(e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, ""))}
                  placeholder="1"
                  className="h-8 w-16 rounded-lg border border-line bg-surface text-center font-mono text-sm font-bold text-fg outline-none focus:border-brand-500"
                />
                <span className="text-[11px] text-subtle">
                  okutulan barkoddan kaç adet alındı
                </span>
              </div>
            )}

            <BarcodeScanner
              onDetected={handleDetected}
              prompt={promptText}
              prefill={lotPending ? partiPrefill : rafPrefill}
            />

            {busy && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> okunuyor…
              </p>
            )}

            {}
            {toplamKayit > 0 && (
              <button
                onClick={() => navigate(`/picking/${order.id}/kayitlar`)}
                className="mt-4 flex w-full items-center justify-between border-t border-line pt-3 text-xs font-semibold text-brand-600 hover:underline"
              >
                <span>Okutulanlar ({toplamKayit})</span>
                <span>Tümünü gör →</span>
              </button>
            )}

          </div>

          <div className="card mt-4 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-muted">{t("picking.progress")}</span>
              <span className="font-bold text-fg">{Math.round(progress)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {locationsLoading && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> raf bilgileri alınıyor…
              </p>
            )}
          </div>
        </div>

        {}
        <div className="min-w-0 short:flex-1 short:overflow-y-auto short:pr-1">
          {}
          {geriYuklemeHatalari.length > 0 && (
            <div className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span className="text-sm font-bold text-rose-700">
                  Konteyner kontrol ({geriYuklemeHatalari.length})
                </span>
                {}
                <button
                  type="button"
                  onClick={() => setGeriYuklemeHatalari([])}
                  aria-label="Kapat"
                  className="ml-auto rounded-lg p-1 text-rose-500 hover:bg-rose-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="space-y-1.5">
                {geriYuklemeHatalari.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm font-medium text-rose-700">
                    <span className="font-bold">{i + 1}.</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2.5">
            {sortedLines.map((line) => {
              const toplanan = linePicked(line);

              const cevrimVar = !!(line.cfactor && line.cfactor > 1);
              const siparisBirim = line.orderUnit || line.product.unit;
              const istenenSiparis = line.orderQty ?? toOrderQty(line.requestedQty, line.cfactor);
              const toplananSiparis = toOrderQty(toplanan, line.cfactor);

              const buOturumKayit = (line.records?.length ?? 0) > 0;
              const partiEksik = !!line.lotTracked && buOturumKayit && !line.lot;
              const done = toplanan >= line.requestedQty && !partiEksik;

              const partial = toplanan > 0 && !done;
              const flashing = flashLine === line.id;
              return (
                <div
                  key={line.id}
                  className={`rounded-2xl border p-4 shadow-card transition-all duration-300 ease-soft ${
                    flashing ? "border-brand-400 ring-2 ring-brand-200" : "border-line"
                  } ${done ? "bg-elevated opacity-60" : "bg-surface"}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        done ? "bg-emerald-100" : partial ? "bg-amber-100" : "bg-elevated"
                      }`}
                    >
                      {done ? (
                        <Check className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <span
                          className={`text-sm font-bold ${
                            partial ? "text-amber-600" : "text-subtle"
                          }`}
                          title="Kalan (okutulacak)"
                        >
                          {qtyRound(Math.max(0, istenenSiparis - toplananSiparis))}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-fg">{line.product.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                        {line.product.code && (
                          <span className="font-mono font-semibold">{line.product.code}</span>
                        )}
                        {line.product.unit && <span>{line.product.unit}</span>}
                        {}
                        <span className="font-medium text-muted">
                          · Sipariş: {qtyRound(istenenSiparis)} {siparisBirim}
                        </span>
                        {line.weight !== undefined && (
                          <span className="font-medium text-muted">· Ağırlık: {qtyRound(line.weight)}</span>
                        )}
                        {line.volume !== undefined && (
                          <span className="font-medium text-muted">· Hacim: {qtyRound(line.volume)}</span>
                        )}
                        {}
                        {line.lotTracked &&
                          (() => {
                            const bekliyor = partiEksik || lotPending === line.id;
                            const stil = line.lot
                              ? "bg-violet-100 text-violet-700"
                              : bekliyor
                              ? "bg-amber-100 text-amber-700"
                              : "border border-amber-300 bg-amber-50 text-amber-700";
                            const metin = line.lot
                              ? `Parti: ${line.lot}`
                              : bekliyor
                              ? "Parti bekleniyor"
                              : "Parti takipli";
                            return (
                              <button
                                type="button"
                                onClick={() => buOturumKayit && setLotPending(line.id)}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${stil}`}
                              >
                                {metin}
                              </button>
                            );
                          })()}
                      </div>

                      {}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {line.suggestions?.length ? (
                          <label className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" />
                            <select
                              value={secilenRaf[line.id] ?? line.suggestions[0].barcode}
                              onChange={(e) => {
                                setSecilenRaf((s) => ({ ...s, [line.id]: e.target.value }));
                                setRafPrefill(e.target.value); // barkod alanına taşı
                              }}
                              className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-[11px] font-semibold text-fg outline-none focus:border-brand-500"
                            >
                              {line.suggestions.map((s) => {

                                const depo = s.warehouse.padEnd(4, " ");
                                const yer = s.location.padEnd(9, " ");
                                return (
                                  <option key={s.barcode} value={s.barcode}>
                                    {`${depo}${yer}${s.total} ${s.unit}`}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        ) : locationsLoading ? (
                          <span className="text-[11px] text-subtle">raf aranıyor…</span>
                        ) : (
                          <span className="text-[11px] text-subtle">raf bilgisi yok</span>
                        )}

                        {}
                        {line.product.barcode && (
                          <span
                            onDoubleClick={() => handleDetected(line.product.barcode)}
                            title="Çift tıkla → okut"
                            className="cursor-pointer select-none rounded-lg bg-elevated px-2 py-1 font-mono text-[11px] font-semibold text-muted transition hover:bg-brand-100 hover:text-brand-700"
                          >
                            {line.product.barcode} · 1 {line.product.unit}
                          </span>
                        )}
                        {line.product.barcode2 && (
                          <span
                            onDoubleClick={() => handleDetected(line.product.barcode2 ?? "")}
                            title="Çift tıkla → okut (koli)"
                            className="cursor-pointer select-none rounded-lg bg-violet-50 px-2 py-1 font-mono text-[11px] font-semibold text-violet-600 transition hover:bg-violet-200"
                          >
                            koli: {line.product.barcode2} · {qtyRound(line.cfactor && line.cfactor > 1 ? line.cfactor : 1)} {line.product.unit}
                          </span>
                        )}
                        {cevrimVar && (
                          <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
                            1 {siparisBirim} = {qtyRound(line.cfactor ?? 0)} {line.product.unit}
                          </span>
                        )}
                      </div>

                    </div>

                    {}
                    <div className="flex shrink-0 flex-col items-end">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm font-bold text-fg">{qtyRound(toplananSiparis)}</span>
                        <span className="font-mono text-sm text-subtle">/ {qtyRound(istenenSiparis)}</span>
                        {siparisBirim && <span className="font-mono text-[11px] text-subtle">{siparisBirim}</span>}
                      </div>
                      {cevrimVar && (
                        <div className="mt-0.5 font-mono text-[11px] text-subtle">
                          {toplanan} / {qtyRound(line.requestedQty)} {line.product.unit}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {}
          {engel && (
            <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{engel}</span>
            </div>
          )}

        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
          <div
            className={`flex animate-pop-in items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-soft ${
              toast.kind === "error"
                ? "bg-rose-500"
                : toast.kind === "done"
                ? "bg-emerald-600"
                : "bg-ink-900"
            }`}
          >
            {toast.kind === "error" ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Check className="h-4 w-4 shrink-0" />
            )}
            {toast.text}
          </div>
        </div>
      )}

    </div>
  );
}
