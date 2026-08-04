import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Check, CheckCircle2, AlertTriangle, Loader2, Warehouse, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import { usePutawayStore } from "../../store/putawayStore";
import { isoDateToBatch } from "../../store/pickingLogic";
import { sesBasarili, sesHata } from "../../sound";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

export default function PutawayItemPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get("type") ?? "";

  const order = usePutawayStore((s) => s.order);
  const loading = usePutawayStore((s) => s.loading);
  const source = usePutawayStore((s) => s.source);
  const ready = usePutawayStore((s) => s.ready);
  const records = usePutawayStore((s) => s.records);
  const pending = usePutawayStore((s) => s.pendingProduct);
  const loadOrder = usePutawayStore((s) => s.loadOrder);
  const scanSource = usePutawayStore((s) => s.scanSource);
  const scanTarget = usePutawayStore((s) => s.scanTarget);
  const clearReady = usePutawayStore((s) => s.clearReady);
  const scanProduct = usePutawayStore((s) => s.scanProduct);
  const setBatch = usePutawayStore((s) => s.setBatch);
  const clear = usePutawayStore((s) => s.clear);

  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [okutmaAdedi, setOkutmaAdedi] = useState("");
  const [partiPrefill, setPartiPrefill] = useState("");
  const [redMesaji, setRedMesaji] = useState<string | null>(null);
  // Tamamlanma KİLİDİ — bir kez tamamlandıysa özet ekranda kalır (tazeleme geri çevirmez).
  const [tamamGoster, setTamamGoster] = useState(false);
  // Özet ANLIK yakalanır: emir "kapalı" statüye geçince EnterPlacement veri
  // döndürmez, order.lines boşalır → değerleri o an snapshot'layıp gösteririz.
  const [ozet, setOzet] = useState({ emir: "", kalem: 0, toplam: 0 });

  const yuklendi = useRef("");
  useEffect(() => {
    if (!id) return;
    const anahtar = `${id}|${orderType}`;
    if (yuklendi.current === anahtar) return;
    yuklendi.current = anahtar;
    loadOrder(id, orderType);
  }, [id, orderType, loadOrder]);

  // Tüm kalemler yerleştirilince (bu oturumda okutma yapıldıysa) kilidi kur ve
  // özeti O AN yakala (sonra order boşalsa bile snapshot korunur).
  useEffect(() => {
    if (tamamGoster) return; // zaten kilitli
    if (!order || order.lines.length === 0 || records.length === 0) return;
    const yer = (l: (typeof order.lines)[number]) =>
      Math.max(l.pickedQty, records.filter((r) => r.material === l.product.code).reduce((s, r) => s + r.qty, 0));
    if (order.lines.every((l) => yer(l) >= l.requestedQty)) {
      setOzet({
        emir: order.orderType ? `${order.id} · ${order.orderType}` : order.id,
        kalem: order.lines.length,
        toplam: order.lines.reduce((s, l) => s + yer(l), 0),
      });
      setTamamGoster(true);
    }
  }, [order, records, tamamGoster]);

  const showToast = (tst: Toast) => {
    if (tst?.kind === "error") sesHata();
    else if (tst) sesBasarili();
    setToast(tst);
    setTimeout(() => setToast(null), 2200);
  };

  const handleDetected = useCallback(
    async (code: string) => {
      const barkod = code.trim();
      if (!barkod || busy) return;
      setBusy(true);
      try {

        if (!source) {
          const r = await scanSource(barkod);
          if (r.ok) { setRedMesaji(null); showToast({ kind: "ok", text: `Kaynak: ${barkod}` }); }
          else { setRedMesaji(r.message); showToast({ kind: "error", text: r.message }); }
          return;
        }

        if (pending) {
          const out = await setBatch(barkod);
          if (out.kind === "ok") { setPartiPrefill(""); setRedMesaji(null); showToast({ kind: "done", text: `Parti: ${barkod} · hedef rafı okutun` }); }
          else showToast({ kind: "error", text: "message" in out ? out.message : "Parti geçersiz" });
          return;
        }

        if (ready) {
          const r = await scanTarget(barkod, Number(okutmaAdedi) || undefined);
          if (r.ok) { setRedMesaji(null); setOkutmaAdedi(""); showToast({ kind: "ok", text: `${ready.material} yerleştirildi` }); }
          else { setRedMesaji(r.message); showToast({ kind: "error", text: r.message }); }
          return;
        }

        const out = await scanProduct(barkod, 1);
        setRedMesaji(null);
        if (out.kind === "ok") { setOkutmaAdedi(""); showToast({ kind: "ok", text: `${out.name} · hedef rafı okutun` }); }
        else if (out.kind === "needsBatch") showToast({ kind: "ok", text: `${out.name} · parti barkodunu okutun` });
        else if (out.kind === "notInOrder") showToast({ kind: "error", text: `${out.material} bu emirde yok` });
        else if (out.kind === "exceedsAvail") {
          sesHata(); // toast yok ama okutma başarısız → hata sesi
          setRedMesaji(`${out.message} (en fazla ${out.enFazla})`);
          if (out.enFazla > 0) setOkutmaAdedi(String(out.enFazla));
        } else showToast({ kind: "error", text: "message" in out ? out.message : "Okutulamadı" });
      } finally {
        setBusy(false);
      }
    },
    [busy, source, ready, pending, okutmaAdedi, scanSource, scanTarget, scanProduct, setBatch]
  );

  if (loading || !order) {
    return (
      <div className="mx-auto max-w-6xl p-4 lg:p-8">
        <PageHeader title={t("putaway.title")} backTo="/putaway" />
        <div className="flex items-center justify-center py-24 text-subtle"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  // Yerleştirilen = CANIAS (pickedQty) ile bu oturum kayıtlarının BÜYÜĞÜ.
  // EnterPlacement tazelemesi boş dönse bile ilerleme/tamamlanma doğru olur.
  const yerlesenOf = (l: (typeof order.lines)[number]) =>
    Math.max(l.pickedQty, records.filter((r) => r.material === l.product.code).reduce((s, r) => s + r.qty, 0));

  // TAMAMLANDI (kilitli): snapshot'lanan özeti göster, listeye dön ile yönlendir.
  if (tamamGoster) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="mb-5 flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-fg">Yerleştirme tamamlandı</h1>
        <p className="mt-1 text-sm text-emerald-600">Tüm kalemler raflara yerleştirildi</p>

        <div className="mt-6 w-full rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between border-b border-line py-2">
            <span className="text-sm text-subtle">Emir</span>
            <span className="font-mono text-sm font-bold text-fg">{ozet.emir}</span>
          </div>
          <div className="flex items-center justify-between border-b border-line py-2">
            <span className="text-sm text-subtle">Kalem sayısı</span>
            <span className="text-sm font-bold text-fg">{ozet.kalem}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-subtle">Toplam yerleştirilen</span>
            <span className="text-sm font-bold text-fg">{ozet.toplam}</span>
          </div>
        </div>

        <button
          onClick={() => {
            clear();
            navigate("/putaway", { replace: true });
          }}
          className="btn-primary btn-lg mt-6 w-full"
        >
          <Warehouse className="h-5 w-5" /> Yerleştirmeye dön
        </button>
      </div>
    );
  }

  // Hazır ürünün GÜNCEL kalanı (toplanması gereken) — CANIAS'tan tazelenen
  // pickedQty ile hesaplanır, iki yerde de gösterilir.
  const readyLine = ready
    ? order.lines.find((l) => l.id === ready.lineId || l.product.code === ready.material)
    : undefined;
  const readyKalan = readyLine ? Math.max(0, readyLine.requestedQty - yerlesenOf(readyLine)) : ready?.qty ?? 0;
  const readyBirim = readyLine?.orderUnit || readyLine?.product.unit || "";

  const promptText = !source
    ? "Kaynak depo barkodunu okutun"
    : pending
    ? "Parti barkodunu okutun"
    : ready
    ? "Hedef raf barkodunu okutun"
    : "Ürün barkodunu okutun";

  const adimlar = [
    { key: "source", label: "Kaynak", active: !source, done: !!source },
    { key: "urun", label: "Ürün", active: !!source && !pending && !ready, done: false },
    { key: "parti", label: "Parti", active: !!pending, done: false },
    { key: "hedef", label: "Hedef", active: !!ready, done: false },
  ];

  const aktifKalem = (l: (typeof order.lines)[number]) =>
    !!ready && (l.id === ready.lineId || l.product.code === ready.material);
  const siraliLines = ready
    ? [...order.lines].sort((a, b) => Number(aktifKalem(b)) - Number(aktifKalem(a)))
    : order.lines;

  return (
    <div className="mx-auto max-w-6xl p-3 md:p-4 lg:p-8 short:h-[100dvh] short:max-w-none short:flex short:flex-col short:overflow-hidden short:p-2">
      <PageHeader
        title={order.orderType ? `${order.id} · ${order.orderType}` : order.id}
        subtitle={[order.customer, order.reference].filter(Boolean).join(" · ")}
        onBack={() => navigate("/putaway")}
        right={<span className="chip bg-violet-100 px-3 py-1 font-mono text-sm text-violet-700">yerleştirilen: {records.length}</span>}
      />

      {}
      <div className="grid min-w-0 gap-4 md:gap-6 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] short:!flex short:min-h-0 short:flex-1 short:overflow-hidden short:gap-3">
        {}
        <div className="min-w-0 md:sticky md:top-3 md:self-start lg:static xl:sticky xl:top-4 short:!static short:w-[300px] short:shrink-0 short:self-stretch short:overflow-y-auto">
          <div className="card p-4">
            {}
            <div className="mb-3 flex items-center gap-1.5">
              {adimlar.map((a, i) => (
                <div
                  key={a.key}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl px-1.5 py-1.5 text-[11px] font-semibold ${
                    a.active ? "bg-brand-600 text-white shadow-soft" : a.done ? "bg-emerald-100 text-emerald-700" : "bg-elevated text-subtle"
                  }`}
                >
                  <span className="shrink-0 font-mono">{a.done ? "✓" : i + 1}</span>
                  <span className="truncate">{a.label}</span>
                </div>
              ))}
            </div>

            {}
            {source ? (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                <Warehouse className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="min-w-0 text-xs text-emerald-800">
                  Kaynak — Depo <span className="font-mono font-bold">{source.warehouse}</span>
                  {" · "}Stok yeri <span className="font-mono font-bold">{source.stockPlace}</span>
                </span>
              </div>
            ) : (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                Önce ürünlerin ALINACAĞI kaynak rafı okutun{order.sourceWarehouse ? ` (beklenen: Depo ${order.sourceWarehouse} · Stok yeri ${order.sourceShelf})` : ""}
              </div>
            )}

            {}
            {source && ready && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-brand-800">
                  <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="truncate">
                    Hedef bekleniyor: <span className="font-mono font-bold">{ready.material}</span>
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-mono font-bold text-amber-700">kalan {readyKalan} {readyBirim}</span>
                    {ready.lot !== "*" && <span className="ml-1 font-mono">parti {ready.lot}</span>}
                  </span>
                </span>
                <button onClick={clearReady} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                  <X className="h-3.5 w-3.5" /> İptal
                </button>
              </div>
            )}

            {}
            {redMesaji && (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0" /><span>{redMesaji}</span>
                </div>
                <button onClick={() => setRedMesaji(null)} className="mt-2 text-xs font-semibold text-rose-700 underline">Anladım</button>
              </div>
            )}

            {}
            {pending && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-elevated px-3 py-2">
                <span className="shrink-0 text-xs font-medium text-muted">Tarih seç</span>
                <input type="date" onChange={(e) => setPartiPrefill(isoDateToBatch(e.target.value))} className="h-8 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-sm text-fg outline-none focus:border-brand-500" />
              </div>
            )}

            {}
            {source && ready && !pending && (
              <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${redMesaji ? "bg-rose-50 ring-1 ring-rose-300" : "bg-amber-50"}`}>
                <span className="text-xs font-medium text-amber-800">Kaç tane?</span>
                <input
                  type="number" inputMode="numeric" min={1} value={okutmaAdedi}
                  onChange={(e) => setOkutmaAdedi(e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, ""))}
                  placeholder="0"
                  className="h-8 w-16 rounded-lg border border-line bg-surface text-center font-mono text-sm font-bold text-fg outline-none focus:border-brand-500"
                />
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
                  Kalan {readyKalan} {readyBirim}
                </span>
              </div>
            )}

            {}
            <BarcodeScanner onDetected={handleDetected} prompt={promptText} prefill={pending ? partiPrefill : undefined} />

            {busy && <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> okunuyor…</p>}
          </div>
        </div>

        {}
        <div className="min-w-0 short:flex-1 short:overflow-y-auto short:pr-1">
          <div className="space-y-2.5">
            {siraliLines.map((line) => {

              // EnterPlacement ile tazelenir; oturum kayıtlarıyla max alınır.
              const yerlesen = yerlesenOf(line);
              const done = yerlesen >= line.requestedQty;
              const partial = yerlesen > 0 && !done;
              const aktif = aktifKalem(line);
              const birim = line.orderUnit || line.product.unit;
              const yuzde = line.requestedQty > 0 ? Math.min(100, (yerlesen / line.requestedQty) * 100) : 0;
              return (
                <div
                  key={line.id}
                  className={`rounded-2xl border p-4 shadow-card transition-all duration-300 ease-soft ${
                    aktif ? "border-brand-400 ring-2 ring-brand-200" : "border-line"
                  } ${done ? "bg-elevated opacity-60" : "bg-surface"}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        done ? "bg-emerald-100" : partial ? "bg-amber-100" : aktif ? "bg-brand-100" : "bg-elevated"
                      }`}
                    >
                      {done ? (
                        <Check className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <span
                          className={`text-sm font-bold ${partial ? "text-amber-600" : aktif ? "text-brand-600" : "text-subtle"}`}
                          title="Kalan (yerleştirilecek)"
                        >
                          {Math.max(0, line.requestedQty - yerlesen)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-fg">{line.product.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                        {line.product.code && <span className="font-mono font-semibold">{line.product.code}</span>}
                        {line.product.unit && <span>{line.product.unit}</span>}
                        <span className="font-medium text-muted">· İstenen: {line.requestedQty} {birim}</span>
                        {line.weight !== undefined && <span className="font-medium text-muted">· Ağırlık: {line.weight}</span>}
                        {line.volume !== undefined && <span className="font-medium text-muted">· Hacim: {line.volume}</span>}
                        {line.lotTracked && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Parti takipli</span>}
                        {line.product.barcode && <span className="rounded-lg bg-elevated px-2 py-0.5 font-mono text-[11px] font-semibold text-muted">{line.product.barcode}</span>}
                      </div>

                      {line.suggestions?.length ? (
                        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px]">
                          <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-700">
                            <MapPin className="h-3.5 w-3.5" /> Önerilen raf ({line.suggestions.length}):
                          </span>
                          <select
                            defaultValue={line.suggestions[0].barcode}
                            className="h-7 w-40 max-w-[45%] shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-2 font-mono text-[11px] font-semibold text-brand-700 outline-none focus:border-brand-500"
                          >
                            {line.suggestions.map((s) => (
                              <option key={s.barcode} value={s.barcode}>
                                Depo {s.warehouse} · {s.location}
                                {s.total > 0 ? ` (${s.total} ${s.unit})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      {/* İlerleme çubuğu */}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-emerald-500" : "bg-brand-500"}`}
                          style={{ width: `${yuzde}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end">
                      <div className="flex items-center gap-1">
                        <span className={`font-mono text-sm font-bold ${partial ? "text-amber-600" : "text-fg"}`}>{yerlesen}</span>
                        <span className="font-mono text-sm text-subtle">/ {line.requestedQty}</span>
                        {birim && <span className="font-mono text-[11px] text-subtle">{birim}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
          <div className={`flex animate-pop-in items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-soft ${
            toast.kind === "error" ? "bg-rose-500" : toast.kind === "done" ? "bg-emerald-600" : "bg-ink-900"
          }`}>
            {toast.kind === "error" ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
