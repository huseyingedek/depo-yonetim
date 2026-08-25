import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
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
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import {
  useTransferStore,
  qtyRound,
} from "../../store/transferStore";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

export default function StockTransferPage() {
  const navigate = useNavigate();

  const sourceShelf = useTransferStore((s) => s.sourceShelf);
  const targetShelf = useTransferStore((s) => s.targetShelf);
  const items = useTransferStore((s) => s.items);
  const step = useTransferStore((s) => s.step);
  const completing = useTransferStore((s) => s.completing);
  const completedResult = useTransferStore((s) => s.completedResult);

  const scanSourceShelf = useTransferStore((s) => s.scanSourceShelf);
  const clearSourceShelf = useTransferStore((s) => s.clearSourceShelf);
  const addItem = useTransferStore((s) => s.addItem);
  const updateItemQty = useTransferStore((s) => s.updateItemQty);
  const removeItem = useTransferStore((s) => s.removeItem);
  const goToTargetStep = useTransferStore((s) => s.goToTargetStep);
  const backToCollectStep = useTransferStore((s) => s.backToCollectStep);
  const scanTargetShelf = useTransferStore((s) => s.scanTargetShelf);
  const setTargetShelf = useTransferStore((s) => s.setTargetShelf);
  const completeTransfer = useTransferStore((s) => s.completeTransfer);
  const reset = useTransferStore((s) => s.reset);

  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [redMesaji, setRedMesaji] = useState<string | null>(null);

  // 3. Adım: Bekleyen Partili Malzeme (Depocunun sadece parti barkodunu okutması beklenir)
  const [lotPendingItem, setLotPendingItem] = useState<{
    material: string;
    name: string;
    barcode: string;
    unit: string;
    specialStock: string;
    availStock?: number;
  } | null>(null);

  // 4. Adım: Miktarı girilecek / aktif okutulan malzeme (Mal Kabul ile birebir miktar paneli)
  const [activeItem, setActiveItem] = useState<{
    material: string;
    name: string;
    barcode: string;
    quantity: number;
    unit: string;
    batchNum?: string;
    specialStock?: string;
    isSpecialStock?: boolean;
    availStock?: number;
  } | null>(null);

  // Hedef depo ve stok yerleri
  const [warehouses, setWarehouses] = useState<{ code: string; name: string }[]>([]);
  const [stockPlaces, setStockPlaces] = useState<{ code: string; name: string }[]>([]);
  const [seciliTargetWh, setSeciliTargetWh] = useState("");
  const [seciliTargetSp, setSeciliTargetSp] = useState("");

  useEffect(() => {
    if (step === "target") {
      api.getWarehouses().then((w) => {
        setWarehouses(w);
        const wh = targetShelf?.warehouse || seciliTargetWh || (w.length > 0 ? w[0].code : "01");
        setSeciliTargetWh(wh);

        api.getStockPlaces(wh).then((sp) => {
          setStockPlaces(sp);
          const spCode = targetShelf?.stockPlace || seciliTargetSp || (sp.length > 0 ? sp[0].code : (sp[0]?.code || "A-01-01"));
          setSeciliTargetSp(spCode);

          setTargetShelf({
            barcode: `${wh}-${spCode}`,
            warehouse: wh,
            stockPlace: spCode,
          });
        });
      });
    }
  }, [step]);

  const handleWarehouseChange = async (wh: string) => {
    setSeciliTargetWh(wh);
    const spList = await api.getStockPlaces(wh);
    setStockPlaces(spList);
    const firstSp = spList.length > 0 ? spList[0].code : "A-01-01";
    setSeciliTargetSp(firstSp);
    setTargetShelf({
      barcode: `${wh}-${firstSp}`,
      warehouse: wh,
      stockPlace: firstSp,
    });
  };

  const handleStockPlaceChange = (spCode: string) => {
    setSeciliTargetSp(spCode);
    const wh = seciliTargetWh || targetShelf?.warehouse || "01";
    setTargetShelf({
      barcode: `${wh}-${spCode}`,
      warehouse: wh,
      stockPlace: spCode,
    });
  };

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

  const handleCommitActiveItem = () => {
    if (!activeItem || activeItem.quantity <= 0) {
      sesHata();
      showToast({ kind: "error", text: "Lütfen geçerli bir miktar girin" });
      return;
    }

    const r = addItem(activeItem);
    if (r.ok) {
      if (r.itemId) flash(r.itemId);
      showToast({ kind: "done", text: r.message });
      setActiveItem(null);
    } else {
      sesHata();
      showToast({ kind: "error", text: r.message });
    }
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
        // A) Kaynak raf bekleniyor (Adım 1)
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

        // B) Parti bekleniyor (Adım 3)
        if (lotPendingItem) {
          // Depocu parti barkodunu okuttu -> Adım 4 (Miktar)'a geçir
          setActiveItem({
            material: lotPendingItem.material,
            name: lotPendingItem.name,
            barcode: lotPendingItem.barcode,
            quantity: 1,
            unit: lotPendingItem.unit,
            batchNum: barkod,
            specialStock: lotPendingItem.specialStock,
            isSpecialStock: true,
            availStock: lotPendingItem.availStock,
          });
          setLotPendingItem(null);
          showToast({ kind: "ok", text: `Parti (${barkod}) okundu, miktarı belirleyin` });
          return;
        }

        // C) Miktar panelindeki aktif malzeme ile aynı barkod tekrar okutulduysa:
        if (activeItem && activeItem.barcode === barkod) {
          setActiveItem((prev) => (prev ? { ...prev, quantity: prev.quantity + 1 } : null));
          showToast({ kind: "ok", text: `+1 eklendi (${activeItem.quantity + 1} ${activeItem.unit})` });
          return;
        }

        // D) Farklı bir malzeme okutuluyorsa ve aktif item varsa, önce mevcut item'ı sepete ekle
        if (activeItem && activeItem.quantity > 0) {
          addItem(activeItem);
          setActiveItem(null);
        }

        // CANIAS barkod okuma servisi (Adım 2)
        const res = await api.readBarcode(
          barkod,
          sourceShelf.warehouse,
          sourceShelf.stockPlace,
          1
        );

        if (!res.ok || !res.material) {
          setRedMesaji(res.message || "Malzeme bulunamadı");
          showToast({ kind: "error", text: res.message || "Malzeme bulunamadı" });
          return;
        }

        const ozelStok = res.specialStock || "0";
        const lotTracked = ozelStok === "1" || /takipli|partili/i.test(ozelStok) || (res.lot && res.lot !== "*");

        // Eğer partili malzeme ise ve barkodda parti yoksa -> Adım 3 (Parti)
        if (lotTracked && (!res.lot || res.lot === "*")) {
          setLotPendingItem({
            material: res.material,
            name: res.name,
            barcode: barkod,
            unit: res.unit || "AD",
            specialStock: ozelStok,
            availStock: res.availStock,
          });
          showToast({ kind: "ok", text: `${res.name} — Parti barkodunu okutun` });
          return;
        }

        // Partisiz malzeme (veya barkodda partisi olan) -> Adım 4 (Miktar)
        const initialQty = res.quantity > 0 ? res.quantity : 1;
        setActiveItem({
          material: res.material,
          name: res.name,
          barcode: barkod,
          quantity: initialQty,
          unit: res.unit || "AD",
          batchNum: res.lot && res.lot !== "*" ? res.lot : undefined,
          specialStock: ozelStok,
          isSpecialStock: Boolean(lotTracked),
          availStock: res.availStock,
        });
        showToast({ kind: "ok", text: `${res.name} okundu, miktarı belirleyin` });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Okuma hatası";
        setRedMesaji(msg);
        showToast({ kind: "error", text: msg });
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      step,
      sourceShelf,
      lotPendingItem,
      activeItem,
      scanTargetShelf,
      scanSourceShelf,
      addItem,
    ]
  );

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

  const toplamAdet = items.reduce((sum, it) => sum + it.quantity, 0);

  // ---------------------------------------------------------------------------
  // 3. ADIM: ONAY BİLGİSİ EKRANI
  // ---------------------------------------------------------------------------
  if (step === "success" && completedResult) {
    const p = completedResult.payload;
    const toplamAdetOnay = p.items.reduce((s, it) => s + it.quantity, 0);

    return (
      <div className="mx-auto max-w-2xl p-3 md:p-4 lg:p-6 short:h-[100dvh] short:overflow-y-auto short:p-2">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-bold text-fg">Transfer Onaylandı</h2>
              <p className="font-mono text-xs text-subtle">{p.transferDate}</p>
            </div>
            <span className="chip bg-emerald-50 font-mono text-xs font-bold text-emerald-700">
              {p.items.length} Kalem · {qtyRound(toplamAdetOnay)} Adet
            </span>
          </div>

          {/* Çıkış - Hedef Özeti */}
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-elevated p-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                ÇIKIŞ LOKASYONU
              </p>
              <p className="font-mono text-xs font-extrabold text-fg sm:text-sm">
                Depo {p.sourceWarehouse} · {p.sourceStockPlace}
              </p>
            </div>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                HEDEF LOKASYON
              </p>
              <p className="font-mono text-xs font-extrabold text-emerald-600 sm:text-sm">
                Depo {p.targetWarehouse} · {p.targetStockPlace}
              </p>
            </div>
          </div>

          {/* Taşınan Kalemler Tablosu */}
          <div className="mb-4 max-h-48 overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-elevated text-subtle">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 font-semibold">Malzeme</th>
                  <th className="px-3 py-2 font-semibold">Parti</th>
                  <th className="px-3 py-2 text-right font-semibold">Miktar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {p.items.map((it, idx) => (
                  <tr key={`${it.material}-${idx}`}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-fg">{it.materialName || it.material}</p>
                      <p className="font-mono text-[10px] text-subtle">{it.material}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted">
                      {it.batchNum || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-fg">
                      {qtyRound(it.quantity)} {it.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Eylemler */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="btn-primary inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold sm:text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Yeni Transfer Başlat</span>
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                navigate("/home");
              }}
              className="btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold sm:text-sm"
            >
              <span>Ana Sayfaya Dön</span>
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
      ? "Raf barkodunu okutun"
      : lotPendingItem
      ? "Parti barkodunu okutun"
      : activeItem
      ? "Miktarı girip 'Listeye Ekle'ye basın veya barkodu tekrar okutun"
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
              <button
                type="button"
                onClick={() => {
                  if (activeItem && activeItem.quantity > 0) {
                    addItem(activeItem);
                    setActiveItem(null);
                  }
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
                disabled={items.length === 0 && !activeItem}
                className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold sm:text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>Taşıma Yap</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={backToCollectStep}
                  className="btn-ghost inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold sm:text-sm"
                >
                  Malzemelere Dön
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
            {/* Adım İndikatörleri (4 Adım: 1 Raf · 2 Malzeme · 3 Parti · 4 Miktar) */}
            <div className="mb-3 flex items-center gap-1.5">
              {step === "collect" ? (
                (
                  [
                    ["shelf", "1 Raf"],
                    ["product", "2 Malzeme"],
                    ["lot", "3 Parti"],
                    ["qty", "4 Miktar"],
                  ] as const
                ).map(([s, label], i) => {
                  const active =
                    (s === "shelf" && !sourceShelf) ||
                    (s === "product" && !!sourceShelf && !lotPendingItem && !activeItem) ||
                    (s === "lot" && !!lotPendingItem) ||
                    (s === "qty" && !!activeItem);

                  const done =
                    (s === "shelf" && !!sourceShelf) ||
                    (s === "product" && (!!lotPendingItem || !!activeItem || items.length > 0)) ||
                    (s === "lot" && (!lotPendingItem && (!!activeItem?.batchNum || items.some((it) => !!it.batchNum)))) ||
                    (s === "qty" && !activeItem && items.length > 0);

                  const git = () => {
                    if (s === "shelf") {
                      clearSourceShelf();
                      setActiveItem(null);
                      setLotPendingItem(null);
                    } else if (s === "product") {
                      setActiveItem(null);
                      setLotPendingItem(null);
                    }
                  };

                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={git}
                      disabled={s === "lot" || s === "qty"}
                      className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl px-1.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft ${
                        active
                          ? "bg-brand-600 text-white shadow-soft"
                          : done
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
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
                    ["target", "Hedef Depo"],
                    ["confirm", "Onay"],
                  ] as const
                ).map(([s, label], i) => {
                  const active = s === "target";
                  const done = s === "target" && !!targetShelf;

                  return (
                    <div
                      key={s}
                      className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl px-1.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft ${
                        active
                          ? "bg-brand-600 text-white shadow-soft"
                          : done
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
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

            {/* TOPLAMA ADIMI: Bulunulan Raf Kartı */}
            {step === "collect" && (
              sourceShelf ? (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-200">
                    <MapPin className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">
                      Depo: <span className="font-mono font-bold">{sourceShelf.warehouse}</span>
                      {" · "}
                      Stok yeri: <span className="font-mono font-bold">{sourceShelf.stockPlace}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearSourceShelf();
                      setActiveItem(null);
                      setLotPendingItem(null);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    <X className="h-3.5 w-3.5" />
                    Değiştir
                  </button>
                </div>
              ) : (
                <div className="mb-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Bulunduğunuz rafın barkodunu okutun
                </div>
              )
            )}

            {/* HEDEF ADIMI: Hedef Depo Seçimi */}
            {step === "target" && (
              <div className="mb-3 space-y-2.5 rounded-xl bg-elevated/70 p-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-brand-600" />
                  <p className="text-xs font-bold text-fg">Hedef Depo Seçimi</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-subtle">
                      Hedef Depo
                    </label>
                    <select
                      value={seciliTargetWh}
                      onChange={(e) => handleWarehouseChange(e.target.value)}
                      className="h-8.5 w-full rounded-lg border border-line bg-surface px-2 font-mono text-xs font-semibold text-fg outline-none focus:border-brand-500"
                    >
                      {warehouses.map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.code} - {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-subtle">
                      Stok Yeri
                    </label>
                    <select
                      value={seciliTargetSp}
                      onChange={(e) => handleStockPlaceChange(e.target.value)}
                      disabled={!stockPlaces.length}
                      className="h-8.5 w-full rounded-lg border border-line bg-surface px-2 font-mono text-xs font-semibold text-fg outline-none focus:border-brand-500"
                    >
                      {stockPlaces.map((sp) => (
                        <option key={sp.code} value={sp.code}>
                          {sp.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {targetShelf && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-200">
                    <span className="font-semibold">Seçilen Hedef:</span>
                    <span className="font-mono font-bold">
                      Depo {targetShelf.warehouse} · {targetShelf.stockPlace}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* PARTİ BEKLEME KUTUSU (Adım 3) */}
            {step === "collect" && lotPendingItem && (
              <div className="mb-3 space-y-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 animate-fade-in shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs font-bold text-violet-800 dark:text-violet-200">
                    {lotPendingItem.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLotPendingItem(null);
                      setRedMesaji(null);
                    }}
                    className="shrink-0 text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Vazgeç
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    <span className="inline-block h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                    <span>Parti barkodunu okutun veya "1" yazın</span>
                  </div>

                  {/* 1 / Mock Parti Hızlı Butonu */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveItem({
                        material: lotPendingItem.material,
                        name: lotPendingItem.name,
                        barcode: lotPendingItem.barcode,
                        quantity: 1,
                        unit: lotPendingItem.unit,
                        batchNum: "1",
                        specialStock: lotPendingItem.specialStock,
                        isSpecialStock: true,
                        availStock: lotPendingItem.availStock,
                      });
                      setLotPendingItem(null);
                      showToast({ kind: "ok", text: "Parti '1' olarak kabul edildi, miktarı belirleyin" });
                    }}
                    className="shrink-0 rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-violet-700 active:scale-95 transition"
                    title="Partiyi '1' olarak ata"
                  >
                    Parti: 1 (Mock)
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* ADIM 4: MİKTAR GİRİŞİ (MAL KABUL İLE BİREBİR AYNI) */}
            {/* ------------------------------------------------------------------- */}
            {step === "collect" && activeItem && (
              <div className="mb-3 space-y-2 rounded-2xl border border-emerald-500/30 bg-surface p-3 shadow-card animate-fade-in">
                <div className="flex items-center justify-between border-b border-line/40 pb-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xs font-black text-fg" title={activeItem.name}>
                      {activeItem.name}
                    </h4>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-subtle">
                      <span className="font-semibold text-brand-600 dark:text-brand-400">{activeItem.material}</span>
                      {activeItem.batchNum && (
                        <span className="rounded bg-violet-100 dark:bg-violet-950/60 px-1 py-0.5 font-bold text-violet-700 dark:text-violet-300">
                          Parti: {activeItem.batchNum}
                        </span>
                      )}
                      {activeItem.availStock !== undefined && activeItem.availStock > 0 && (
                        <span className="text-emerald-600 font-medium">
                          (Mevcut: {qtyRound(activeItem.availStock)} {activeItem.unit || "AD"})
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveItem(null)}
                    className="shrink-0 text-xs font-semibold text-subtle hover:text-rose-600 hover:underline"
                  >
                    Vazgeç
                  </button>
                </div>

                {/* Miktar Stepper Girişi */}
                <div>
                  <div className="mb-1">
                    <label className="text-xs font-bold text-fg block">
                      Taşınacak Miktar ({activeItem.unit || "AD"}) <span className="text-red-500">*</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveItem((prev) => (prev ? { ...prev, quantity: Math.max(0, prev.quantity - 1) } : null))
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-subtle hover:bg-line transition active:scale-95 shrink-0"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeItem.quantity === 0 ? "" : activeItem.quantity}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setActiveItem((prev) => (prev ? { ...prev, quantity: 0 } : null));
                          return;
                        }
                        const val = parseFloat(raw);
                        setActiveItem((prev) => (prev ? { ...prev, quantity: isNaN(val) ? 0 : Math.max(0, val) } : null));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCommitActiveItem();
                        }
                      }}
                      className="field-input flex-1 text-center font-mono text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 h-10 py-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setActiveItem((prev) => (prev ? { ...prev, quantity: prev.quantity + 1 } : null))
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95 shadow-md shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Hızlı Butonlar ve Ekle Butonu (Sıfırla, +5, +10, Ekle) */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1.5">
                    {/* 1. Sıfırla (Çöp Kutusu İkonu) */}
                    <button
                      type="button"
                      onClick={() => setActiveItem((prev) => (prev ? { ...prev, quantity: 0 } : null))}
                      className="flex items-center justify-center rounded-xl border border-line bg-elevated/50 py-2 text-subtle hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition active:scale-95 shadow-xs"
                      title="Miktarı Sıfırla (0)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    {/* 2. +5, 3. +10 */}
                    {[5, 10].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() =>
                          setActiveItem((prev) => (prev ? { ...prev, quantity: prev.quantity + inc } : null))
                        }
                        className="rounded-xl border border-line bg-elevated/80 py-2 text-xs sm:text-sm font-black text-fg hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition active:scale-95 shadow-xs"
                      >
                        +{inc}
                      </button>
                    ))}

                    {/* 4. Ekle Butonu */}
                    <button
                      type="button"
                      onClick={handleCommitActiveItem}
                      disabled={!activeItem || activeItem.quantity <= 0}
                      className="flex flex-col items-center justify-center rounded-xl bg-emerald-600 py-1 text-[10px] sm:text-[11px] font-black leading-tight text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-35 disabled:cursor-not-allowed"
                      title="Malzemeyi Listeye Ekle"
                    >
                      <span>Listeye</span>
                      <span>Ekle</span>
                    </button>
                  </div>
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

            {/* BARKOD OKUYUCU (Toplama ve Hedef Adımlarında) */}
            {step !== "success" && (
              <BarcodeScanner
                onDetected={handleDetected}
                prompt={promptText}
                hideCardWrapper
              />
            )}

            {busy && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> okunuyor…
              </p>
            )}
          </div>
        </div>

        {/* SAĞ KOLON: Okutulan Malzemeler ve Özet Tablo */}
        <div className="min-w-0 short:flex-1 short:overflow-y-auto short:pr-1">
          {step === "collect" ? (
            <div>
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
                    1. Sol panelden <strong>Raf</strong> barkodunu okutun.
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
