import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MapPin, Check, AlertTriangle, Loader2, PackagePlus, X,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import {
  usePickingStore, orderProgress, orderTotals, linePicked,
} from "../../store/pickingStore";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

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

  const [toast, setToast] = useState<Toast>(null);
  const [flashLine, setFlashLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Parti takipli kalem okundu, parti barkodu bekleniyor */
  const [lotPending, setLotPending] = useState<string | null>(null);
  /** Kalem başına seçilen raf (birden fazla raf varsa depocu seçer) */
  const [secilenRaf, setSecilenRaf] = useState<Record<string, string>>({});
  /**
   * Bir sonraki okutmada kaç tane alındığı — çuval/koli sayısı.
   * Kayda giren miktar = barkodun birim değeri × bu sayı.
   * Okutmadan sonra 1'e döner ki unutulup üst üste binmesin.
   */
  const [okutmaAdedi, setOkutmaAdedi] = useState(1);
  /**
   * Reddedilen okutmanın açıklaması. Toast 2 saniyede kayboluyor, depocu
   * ne yapacağını okuyamıyordu — bu kutu düzeltilene kadar ekranda kalır.
   */
  const [redMesaji, setRedMesaji] = useState<string | null>(null);

  // StrictMode efekti iki kez çalıştırıyor; MZYEnterPick VERİ YAZDIĞI için
  // ikinci çağrının gitmemesi önemli.
  const yuklendi = useRef("");

  useEffect(() => {
    if (!id) return;
    const anahtar = `${id}|${orderType}`;
    // StrictMode aynı mount'ta efekti iki kez çalıştırıyor; bir mount'ta tek
    // kez yükle. Ama emre HER GİRİŞTE (yeni mount) EnterPick çalışsın —
    // kayıtlar loadOrder içinde korunuyor (boş dönerse önceki emir kalıyor).
    if (yuklendi.current === anahtar) return;
    yuklendi.current = anahtar;
    loadOrder(id, orderType);
  }, [id, orderType, loadOrder]);

  const showToast = (tst: Toast) => {
    setToast(tst);
    setTimeout(() => setToast(null), 2200);
  };

  const flash = (lineId: string) => {
    setFlashLine(lineId);
    setTimeout(() => setFlashLine(null), 600);
  };

  /** Tek giriş noktası: raf yoksa raf, varsa ürün (veya parti) olarak yorumlanır */
  const handleDetected = useCallback(
    async (code: string) => {
      const barkod = code.trim();
      if (!barkod || busy) return;
      setBusy(true);
      try {
        // 1) Raf bekleniyor
        if (!shelf) {
          const r = await scanShelf(barkod);
          if (r.ok) {
            setRedMesaji(null); // başarıda önceki hata mesajını temizle
            showToast({ kind: "ok", text: `Raf: ${barkod}` });
          } else {
            showToast({ kind: "error", text: r.message });
          }
          return;
        }

        // 2) Parti bekleniyor (parti takipli kalem okunmuştu)
        // MZYReadBarcode ile DOĞRULANIR — rastgele/yanlış parti reddedilir.
        if (lotPending) {
          const lr = await scanLot(lotPending, barkod);
          if (lr.ok) {
            setLotPending(null);
            setRedMesaji(null); // başarıda önceki hata mesajını temizle
            showToast({ kind: "done", text: `Parti: ${barkod}` });
          } else {
            setRedMesaji(lr.message);
            showToast({ kind: "error", text: lr.message });
          }
          return;
        }

        // 3) Ürün — yanındaki miktar kutusunda yazan adet kadar
        const s = await scanProduct(barkod, okutmaAdedi);
        setRedMesaji(null);
        if (s.kind === "ok") {
          setOkutmaAdedi(1);
          flash(s.lineId);
          showToast({ kind: "ok", text: `${s.name} eklendi` });
        } else if (s.kind === "needsBatch") {
          // Parti takipli ürün (SPECIALSTOCK=1). Kayıt HENÜZ açılmadı — parti
          // barkodu okununca ikinci ReadBarcode ile gerçek parti stoğu gelecek.
          flash(s.lineId);
          setLotPending(s.lineId);
          showToast({ kind: "ok", text: `${s.name} · parti barkodunu okutun` });
        } else if (s.kind === "notInOrder") {
          showToast({ kind: "error", text: `${s.material} bu emirde yok` });
        } else if (s.kind === "alreadyDone") {
          flash(s.lineId);
          showToast({ kind: "done", text: "Bu kalem tamamlandı" });
        } else if (s.kind === "exceedsOrder" || s.kind === "noStock") {
          // Kayıt AÇILMADI. Mesaj kalıcı kutuda kalır, depocu düzeltene kadar.
          flash(s.lineId);
          setRedMesaji(s.message);
          // Sığan miktarı hazır yapalım — depocu tekrar okutsun, uğraşmasın
          if (s.kind === "exceedsOrder" && s.enFazla > 0) setOkutmaAdedi(s.enFazla);
        } else {
          showToast({ kind: "error", text: s.message });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, shelf, lotPending, order, okutmaAdedi, scanShelf, scanProduct, scanLot]
  );

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
  const { picked, requested } = orderTotals(order);

  /**
   * Parti takipli olup miktarı girilmiş ama partisi okutulmamış kalemler.
   * Miktar elle de yazılabildiği için parti adımı atlanabiliyordu; burada
   * yakalanıp emir kapatılmadan önce uyarılıyor.
   */
  // Parti eksik UYARISI yalnızca BU OTURUMDA okutulan (records) kalemler için.
  // Önceden toplanmış (MOVEDQTY) parti takipli kalemler CANIAS'ta zaten
  // partili kaydedilmiştir; yeniden girişte l.lot boş diye "parti eksik"
  // sanılmamalı. Bu yüzden linePicked (MOVEDQTY dahil) yerine records'a bakıyoruz.
  const partisiEksik = order.lines.filter(
    (l) => l.lotTracked && (l.records?.length ?? 0) > 0 && !l.lot
  );

  /**
   * Fazla toplanmış kalemler. Okutma sırasında engelleniyor ama emirden
   * gelen MOVEDQTY zaten fazlaysa burada yakalanır.
   */
  const fazlaToplanan = order.lines.filter((l) => linePicked(l) > l.requestedQty);

  /** Paketlemeyi engelleyen sebepler */
  const engel =
    partisiEksik.length > 0
      ? `Parti barkodu okutulmayan kalem var: ${partisiEksik
          .map((l) => l.product.code)
          .join(", ")}. Bu ürünler son kullanma tarihi takipli, parti girilmeden paketlenemez.`
      : fazlaToplanan.length > 0
      ? `Fazla toplanmış kalem var: ${fazlaToplanan
          .map((l) => `${l.product.code} (${linePicked(l)}/${l.requestedQty})`)
          .join(", ")}. Düzeltilmeden paketlenemez.`
      : "";

  /** Toplam okutma sayısı — detay tablosu ayrı sayfada. */
  const toplamKayit = order.lines.reduce((t, l) => t + (l.records?.length ?? 0), 0);

  /** Bu kalem, okutulan rafta mı? */
  const rafta = (line: { suggestions?: { barcode: string }[] }) =>
    !!shelf && !!line.suggestions?.some((s) => s.barcode === shelf.barcode);

  // Raf okutulmuşsa o raftaki kalemler üste çıkar; sonra tamamlananlar en alta.
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
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={order.id}
        subtitle={[order.customer, order.reference].filter(Boolean).join(" · ")}
        onBack={() => {
          // Emirden çıkarken kilidi aç (MZYClosePick), sonra listeye dön.
          leaveOrder();
          navigate("/picking");
        }}
        right={
          <div className="flex items-center gap-2">
            <span className="chip bg-brand-100 px-3 py-1 font-mono text-sm text-brand-700">
              {picked}/{requested}
            </span>
            {/* Paketleme başlıkta — liste uzadıkça aşağı kaçmasın */}
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

      <div className="grid min-w-0 gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* Sol: raf + okutma + ilerleme */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            {/* Adım göstergesi: Raf → Ürün → Parti
                Raf okunduktan sonra "Ürün" adımında KALIR; her üründen sonra
                başa dönmez. Parti yalnız parti takipli kalemde yanar. */}
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

                // Adımlar tıklanabilir — depocu geri dönebilsin:
                //   Raf   → rafı bırak, yeni raf okut
                //   Parti → partisi eksik ilk kaleme geç
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

            {/* Okutulan raf — sabit kalır, ürün okutmak sıfırlamaz */}
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

            {/* Parti bekleniyor — depocu vazgeçebilsin (etiket yırtıksa vb.) */}
            {lotPending && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
                <span className="min-w-0 truncate text-xs font-medium text-amber-800">
                  Parti barkodu bekleniyor
                </span>
                <button
                  onClick={() => setLotPending(null)}
                  className="shrink-0 text-xs font-semibold text-amber-700 hover:underline"
                >
                  Vazgeç
                </button>
              </div>
            )}

            {/* Kaç tane alındı — çuval/koli sayısı.
                25 KG'lık çuvaldan 2 tane alındıysa buraya 2 yazılır,
                kayda 50 KG geçer. Ürün adımında görünür. */}
            {/* Reddedilen okutma — düzeltilene kadar ekranda kalır */}
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
                  onChange={(e) => setOkutmaAdedi(Math.max(1, Number(e.target.value) || 1))}
                  className="h-8 w-16 rounded-lg border border-line bg-surface text-center font-mono text-sm font-bold text-fg outline-none focus:border-brand-500"
                />
                <span className="text-[11px] text-subtle">
                  okutulan barkoddan kaç adet alındı
                </span>
              </div>
            )}

            <BarcodeScanner onDetected={handleDetected} prompt={promptText} />

            {busy && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> okunuyor…
              </p>
            )}

            {/* Okutulanlar ayrı sayfada — burada sadece sayı ve
                bağlantı. Sol panel barkod okutmaya odaklı kalsın. */}
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

        {/* Sağ: kalem listesi */}
        <div className="min-w-0">
          <div className="space-y-2.5">
            {sortedLines.map((line) => {
              const toplanan = linePicked(line);
              // Parti eksik: yalnızca BU OTURUMDA okutulmuş (records) ama partisi
              // yazılmamışsa. Önceden toplanmış (MOVEDQTY) kalem partili kabul.
              const buOturumKayit = (line.records?.length ?? 0) > 0;
              const partiEksik = !!line.lotTracked && buOturumKayit && !line.lot;
              const done = toplanan >= line.requestedQty && !partiEksik;

              /* Miktar kontrolü — Bora'nın örneği:
                 sipariş 1 koli, 1 koli = 10 adet, ama rafta 6 adet var.
                 Barkod okutunca 10 girer → rafta o kadar yok, uyar.
                 Ayrıca istenenden fazla toplanmışsa da uyar. */
              const raf =
                line.suggestions?.find(
                  (s) => s.barcode === (secilenRaf[line.id] ?? line.suggestions?.[0]?.barcode)
                ) ?? line.suggestions?.[0];
              let uyari = "";
              if (toplanan > line.requestedQty) {
                uyari = `İstenen ${line.requestedQty} ${line.product.unit}, okutulan ${toplanan}. Fazla toplandı — kayıt silin ya da azaltın.`;
              } else if (raf && raf.total > 0 && toplanan > raf.total) {
                uyari = `${raf.barcode} rafında ${raf.total} ${raf.unit} var, ${toplanan} okutuldu. Kalanı başka raftan al.`;
              }
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
                        >
                          {toplanan}
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
                        {/* Rozet: partisi biliniyorsa "Parti: X"; bu oturumda
                            okutulup parti bekliyorsa "Parti bekleniyor".
                            Önceden toplanmış (records boş, l.lot boş) kalemde
                            gösterme — partisi CANIAS'ta, elimizde yok. */}
                        {line.lotTracked && (line.lot || partiEksik || lotPending === line.id) && (
                          <button
                            type="button"
                            onClick={() => buOturumKayit && setLotPending(line.id)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                              line.lot
                                ? "bg-violet-100 text-violet-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {line.lot ? `Parti: ${line.lot}` : "Parti bekleniyor"}
                          </button>
                        )}
                      </div>

                      {/* HANGİ RAFTA — bir ürün birden fazla rafta olabilir.
                          Select: mesafeye göre sıralı, ilki en yakın raf.
                          Seçilen raf, miktar kontrolünde kıyas noktası olur. */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {line.suggestions?.length ? (
                          <label className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" />
                            <select
                              value={secilenRaf[line.id] ?? line.suggestions[0].barcode}
                              onChange={(e) =>
                                setSecilenRaf((s) => ({ ...s, [line.id]: e.target.value }))
                              }
                              className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-[11px] font-semibold text-fg outline-none focus:border-brand-500"
                            >
                              {line.suggestions.map((s) => {
                                // Depo ve stok yerini AYRI sütun gibi hizala
                                // (font-mono + kırılmaz boşlukla tablo görünümü).
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

                        {/* Barkod — EnterPick'ten geliyor. Depocu okutacağı
                            barkodu gözüyle karşılaştırabilsin diye rafın yanında. */}
                        {line.product.barcode && (
                          <span className="rounded-lg bg-elevated px-2 py-1 font-mono text-[11px] font-semibold text-muted">
                            {line.product.barcode}
                          </span>
                        )}
                      </div>

                      {/* MİKTAR UYARISI
                          Örnek (Bora): 1 koli barkodu = 10 adet, rafta 6 adet var.
                          Barkod okutulunca 10 girer ama rafta o kadar yok. */}
                      {uyari && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700">
                          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                          {uyari}
                        </p>
                      )}

                    </div>

                    {/* Miktar SALT OKUNUR — kayıtların toplamı.
                        Elle artırma yok: her artış gerçek bir okutma olmalı. */}
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-sm font-bold text-fg">{toplanan}</span>
                      <span className="font-mono text-sm text-subtle">/ {line.requestedQty}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Parti eksiği ya da fazlalık varsa emir kapatılamaz */}
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
