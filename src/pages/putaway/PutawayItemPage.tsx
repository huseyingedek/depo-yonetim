import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Check, AlertTriangle, Loader2, Warehouse, X, Trash2 } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import { usePutawayStore } from "../../store/putawayStore";
import { isoDateToBatch } from "../../store/pickingLogic";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

/**
 * YERLEŞTİRME detay — PickingDetailPage'in aynası (kopyala-yapıştır + uyarla).
 * Tek giriş noktası (handleDetected) duruma göre yorumlar:
 *   kaynak yok  → KAYNAK depo okut (bir kez)
 *   hedef yok   → HEDEF raf okut
 *   parti bekl. → PARTİ barkodu okut
 *   yoksa       → ÜRÜN okut → tek tek yerleştir
 * NOT: savePlacement STUB — kayıt henüz CANIAS'a yazılmıyor (Bora verecek).
 */
export default function PutawayItemPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get("type") ?? "";

  const order = usePutawayStore((s) => s.order);
  const loading = usePutawayStore((s) => s.loading);
  const source = usePutawayStore((s) => s.source);
  const target = usePutawayStore((s) => s.target);
  const records = usePutawayStore((s) => s.records);
  const pending = usePutawayStore((s) => s.pendingProduct);
  const loadOrder = usePutawayStore((s) => s.loadOrder);
  const scanSource = usePutawayStore((s) => s.scanSource);
  const scanTarget = usePutawayStore((s) => s.scanTarget);
  const clearTarget = usePutawayStore((s) => s.clearTarget);
  const scanProduct = usePutawayStore((s) => s.scanProduct);
  const setBatch = usePutawayStore((s) => s.setBatch);
  const removeRecord = usePutawayStore((s) => s.removeRecord);

  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [okutmaAdedi, setOkutmaAdedi] = useState("");
  const [partiPrefill, setPartiPrefill] = useState("");
  const [redMesaji, setRedMesaji] = useState<string | null>(null);

  const yuklendi = useRef("");
  useEffect(() => {
    if (!id) return;
    const anahtar = `${id}|${orderType}`;
    if (yuklendi.current === anahtar) return;
    yuklendi.current = anahtar;
    loadOrder(id, orderType);
  }, [id, orderType, loadOrder]);

  const showToast = (tst: Toast) => {
    setToast(tst);
    setTimeout(() => setToast(null), 2200);
  };

  /** Tek giriş noktası: duruma göre kaynak / hedef / parti / ürün olarak yorumlanır. */
  const handleDetected = useCallback(
    async (code: string) => {
      const barkod = code.trim();
      if (!barkod || busy) return;
      setBusy(true);
      try {
        // 1) Kaynak depo bekleniyor (bir kez)
        if (!source) {
          const r = await scanSource(barkod);
          if (r.ok) { setRedMesaji(null); showToast({ kind: "ok", text: `Kaynak: ${barkod}` }); }
          else { setRedMesaji(r.message); showToast({ kind: "error", text: r.message }); }
          return;
        }
        // 2) Hedef raf bekleniyor
        if (!target) {
          const r = await scanTarget(barkod);
          if (r.ok) { setRedMesaji(null); showToast({ kind: "ok", text: `Hedef raf: ${barkod}` }); }
          else showToast({ kind: "error", text: r.message });
          return;
        }
        // 3) Parti bekleniyor (parti takipli ürün okunmuştu)
        if (pending) {
          const out = await setBatch(barkod);
          if (out.kind === "ok") { setPartiPrefill(""); setRedMesaji(null); showToast({ kind: "done", text: `Parti: ${barkod}` }); }
          else showToast({ kind: "error", text: "message" in out ? out.message : "Parti geçersiz" });
          return;
        }
        // 4) Ürün — yanındaki miktar kutusundaki adet kadar
        const out = await scanProduct(barkod, Number(okutmaAdedi) || 1);
        setRedMesaji(null);
        if (out.kind === "ok") { setOkutmaAdedi(""); showToast({ kind: "ok", text: `${out.name} yerleştirildi` }); }
        else if (out.kind === "needsBatch") showToast({ kind: "ok", text: `${out.name} · parti barkodunu okutun` });
        else if (out.kind === "notInOrder") showToast({ kind: "error", text: `${out.material} bu emirde yok` });
        else if (out.kind === "exceedsAvail") {
          setRedMesaji(`${out.message} (en fazla ${out.enFazla})`);
          if (out.enFazla > 0) setOkutmaAdedi(String(out.enFazla));
        } else showToast({ kind: "error", text: "message" in out ? out.message : "Okutulamadı" });
      } finally {
        setBusy(false);
      }
    },
    [busy, source, target, pending, okutmaAdedi, scanSource, scanTarget, scanProduct, setBatch]
  );

  if (loading || !order) {
    return (
      <div className="mx-auto max-w-6xl p-4 lg:p-8">
        <PageHeader title={t("putaway.title")} backTo="/putaway" />
        <div className="flex items-center justify-center py-24 text-subtle"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  const promptText = !source
    ? "Kaynak depo barkodunu okutun"
    : !target
    ? "Hedef raf barkodunu okutun"
    : pending
    ? "Parti barkodunu okutun"
    : "Ürün barkodunu okutun";

  const adimlar = [
    { key: "source", label: "Kaynak", active: !source, done: !!source },
    { key: "target", label: "Hedef", active: !!source && !target, done: !!target },
    { key: "urun", label: "Ürün", active: !!source && !!target && !pending, done: false },
    { key: "parti", label: "Parti", active: !!pending, done: false },
  ];

  return (
    <div className="mx-auto max-w-6xl p-3 md:p-4 lg:p-8 short:h-[100dvh] short:max-w-none short:flex short:flex-col short:overflow-hidden short:p-2">
      <PageHeader
        title={order.id}
        subtitle={[order.customer, order.reference].filter(Boolean).join(" · ")}
        onBack={() => navigate("/putaway")}
        right={<span className="chip bg-violet-100 px-3 py-1 font-mono text-sm text-violet-700">yerleştirilen: {records.length}</span>}
      />

      {/* Servis uyarısı — tasarım iskeleti */}
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-700 short:hidden">
        Tasarım iskeleti — yerleştirme kaydı (MZYSavePlacement) henüz CANIAS'a bağlı değil.
      </div>

      {/* İki pane: SOL sabit okutma, SAĞ akan liste (toplama ile aynı düzen) */}
      <div className="grid min-w-0 gap-4 md:gap-6 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[400px_minmax(0,1fr)] short:!flex short:min-h-0 short:flex-1 short:overflow-hidden short:gap-3">
        {/* Sol: okutma paneli */}
        <div className="min-w-0 md:sticky md:top-3 md:self-start lg:top-4 short:!static short:w-[300px] short:shrink-0 short:self-stretch short:overflow-y-auto">
          <div className="card p-4">
            {/* Adım göstergesi: Kaynak → Hedef → Ürün → Parti */}
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

            {/* KAYNAK depo — okununca sabit kalır */}
            {source ? (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-emerald-800">
                  <Warehouse className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="truncate">Kaynak: <span className="font-mono font-bold">{source.warehouse}/{source.stockPlace}</span></span>
                </span>
              </div>
            ) : (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                Önce ürünlerin ALINACAĞI kaynak depoyu okutun{order.sourceWarehouse ? ` (beklenen: ${order.sourceWarehouse}${order.sourceShelf ? "/" + order.sourceShelf : ""})` : ""}
              </div>
            )}

            {/* HEDEF raf — okununca gösterilir, değiştirilebilir */}
            {source && (
              target ? (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-brand-800">
                    <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
                    <span className="truncate">Hedef: <span className="font-mono font-bold">{target.warehouse}/{target.stockPlace}</span></span>
                  </span>
                  <button onClick={clearTarget} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                    <X className="h-3.5 w-3.5" /> Değiştir
                  </button>
                </div>
              ) : (
                <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">Hedef rafı okutun (nereye konacak)</div>
              )
            )}

            {/* Reddedilen okutma — kalıcı kutu */}
            {redMesaji && (
              <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <div className="flex items-start gap-2 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0" /><span>{redMesaji}</span>
                </div>
                <button onClick={() => setRedMesaji(null)} className="mt-2 text-xs font-semibold text-rose-700 underline">Anladım</button>
              </div>
            )}

            {/* Parti tarih seçici (parti bekleniyorsa) */}
            {pending && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-elevated px-3 py-2">
                <span className="shrink-0 text-xs font-medium text-muted">Tarih seç</span>
                <input type="date" onChange={(e) => setPartiPrefill(isoDateToBatch(e.target.value))} className="h-8 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-sm text-fg outline-none focus:border-brand-500" />
              </div>
            )}

            {/* Kaç tane? — ürün adımında */}
            {source && target && !pending && (
              <div className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 ${redMesaji ? "bg-rose-50 ring-1 ring-rose-300" : "bg-elevated"}`}>
                <span className="text-xs font-medium text-muted">Kaç tane?</span>
                <input
                  type="number" inputMode="numeric" min={1} value={okutmaAdedi}
                  onChange={(e) => setOkutmaAdedi(e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, ""))}
                  placeholder="1"
                  className="h-8 w-16 rounded-lg border border-line bg-surface text-center font-mono text-sm font-bold text-fg outline-none focus:border-brand-500"
                />
                <span className="text-[11px] text-subtle">taşınacak miktar</span>
              </div>
            )}

            {/* OKUTUCU — toplamayla aynı bileşen (kamera + giriş) */}
            <BarcodeScanner onDetected={handleDetected} prompt={promptText} prefill={pending ? partiPrefill : undefined} />

            {busy && <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> okunuyor…</p>}
          </div>
        </div>

        {/* Sağ: emir kalemleri + bu oturumda yerleştirilenler */}
        <div className="min-w-0 short:flex-1 short:overflow-y-auto short:pr-1">
          <div className="space-y-2.5">
            {order.lines.map((line) => {
              const yerlesen = records.filter((r) => r.material === line.product.code).reduce((s, r) => s + r.qty, 0);
              const done = yerlesen >= line.requestedQty;
              return (
                <div key={line.id} className={`rounded-2xl border p-4 shadow-card ${done ? "border-line bg-elevated opacity-60" : "border-line bg-surface"}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? "bg-emerald-100" : "bg-elevated"}`}>
                      {done ? <Check className="h-5 w-5 text-emerald-600" /> : <span className="text-sm font-bold text-subtle">{yerlesen}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-fg">{line.product.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                        {line.product.code && <span className="font-mono font-semibold">{line.product.code}</span>}
                        <span className="font-medium text-muted">· {line.requestedQty}</span>
                        {line.lotTracked && <span className="chip bg-amber-50 text-amber-700">Parti takipli</span>}
                        {line.product.barcode && <span className="rounded-lg bg-elevated px-2 py-1 font-mono text-[11px] font-semibold text-muted">{line.product.barcode}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-sm font-bold text-fg">{yerlesen}</span>
                      <span className="font-mono text-sm text-subtle">/ {line.requestedQty}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bu oturumda yerleştirilenler */}
          {records.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-bold text-fg">Bu oturumda yerleştirilenler ({records.length})</p>
              <div className="space-y-2">
                {records.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-sm shadow-card">
                    <span className="font-mono font-bold text-fg">{r.material}</span>
                    <span className="text-subtle">×{r.qty}</span>
                    {r.lot !== "*" && <span className="chip bg-slate-100 font-mono text-slate-600">parti {r.lot}</span>}
                    <span className="ml-auto font-mono text-xs text-subtle">{r.sourceShelf} → {r.targetShelf}</span>
                    <button onClick={() => removeRecord(r.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
