import { useMemo, useState } from "react";
import {
  Truck,
  Search,
  MapPin,
  Package,
  Route as RouteIcon,
  CheckCircle2,
  Check,
  RotateCcw,
  PauseCircle,
  Send,
  User,
  Boxes,
  Weight,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";

// -----------------------------------------------------------------------------
// DAĞITIM — TASARIM AŞAMASI · TEK EKRAN
// CANIAS "Dağıtım Planlama" (AKLDLVT01) temel alınarak: teslimatlar + araçlar +
// rotalar tek ekranda. Seçili teslimatlara toplu aksiyon (dağıtıma çıkart,
// teslim edildi, tekrar gönder, beklemeye sevk). Şimdilik mock veri.
// -----------------------------------------------------------------------------

type Durum = "cikacak" | "yolda" | "teslim" | "beklemede" | "iptal";

const DURUM: Record<Durum, { label: string; chip: string; dot: string }> = {
  cikacak: { label: "Dağıtıma Çıkacak", chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "bg-amber-500" },
  yolda: { label: "Yolda / Dağıtımda", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300", dot: "bg-sky-500" },
  teslim: { label: "Teslim Edildi", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", dot: "bg-emerald-500" },
  beklemede: { label: "Beklemede", chip: "bg-slate-200 text-slate-700 dark:bg-slate-600/40 dark:text-slate-200", dot: "bg-slate-400" },
  iptal: { label: "İptal", chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300", dot: "bg-rose-500" },
};

interface Teslimat {
  id: string; // Sipariş No (SO)
  musteri: string;
  sehir: string;
  ilce: string;
  rota: number;
  plaka: string; // "*" = atanmamış
  durum: Durum;
  agirlik: number; // net kg
  hacim: number; // desi
  postaKodu: string;
  adres: string;
  kargo: string; // taşıma türü
}

interface Arac {
  plaka: string;
  surucu: string;
  kapasite: number; // toplam hacim (desi)
}

interface Rota {
  no: number;
  sehir: string;
}

const ARACLAR: Arac[] = [
  { plaka: "KARGO", surucu: "Sürücüleri", kapasite: 9999999 },
  { plaka: "34 GYS 808", surucu: "Serkan Açıkgöz", kapasite: 3400 },
  { plaka: "34 VL 9489", surucu: "Samet Ertufan", kapasite: 3400 },
  { plaka: "34 NV 4683", surucu: "Eşref Günen", kapasite: 3400 },
  { plaka: "34 NSU 025", surucu: "İsmail Ceylan", kapasite: 3400 },
  { plaka: "34 BSC 099", surucu: "İsmail Pamuk", kapasite: 3400 },
];

const ROTALAR: Rota[] = [
  { no: 1, sehir: "Bilecik" },
  { no: 2, sehir: "Gaziantep" },
  { no: 3, sehir: "Adana" },
  { no: 4, sehir: "Konya" },
  { no: 5, sehir: "Kastamonu" },
  { no: 10, sehir: "İstanbul" },
];

const BASLANGIC: Teslimat[] = [
  { id: "SO-844857", musteri: "Recep Doğramacı", sehir: "Kastamonu", ilce: "Cide", rota: 5, plaka: "*", durum: "cikacak", agirlik: 125.53, hacim: 852, postaKodu: "37000", adres: "Kasaba Mah. Ali Efendi Sokak No: 5", kargo: "Kamyon" },
  { id: "SO-844852", musteri: "T. İş Bankası AŞ Osmaneli", sehir: "Bilecik", ilce: "Osmaneli", rota: 1, plaka: "34 GYS 808", durum: "cikacak", agirlik: 31.14, hacim: 226, postaKodu: "11000", adres: "Camikebir Mah. Dr. Etem Girgin Cad.", kargo: "Kamyon" },
  { id: "SO-844710", musteri: "Mehmet Kerem Aygüneş", sehir: "Gaziantep", ilce: "Gaziantep", rota: 2, plaka: "34 VL 9489", durum: "yolda", agirlik: 1.63, hacim: 12, postaKodu: "35000", adres: "Yeşil Mah. 40 Sok. Mustafa Bey Apt. 23/12", kargo: "Kargo - Aras" },
  { id: "SO-844701", musteri: "Stil Reklam İnşaat Otomotiv", sehir: "İstanbul", ilce: "Çekmeköy", rota: 10, plaka: "34 CRD 320", durum: "yolda", agirlik: 20.74, hacim: 137, postaKodu: "34000", adres: "Mimar Sinan Mah. Çolpan Sk. Uzunlar Apt. No:2-A", kargo: "Hepsi Jet" },
  { id: "SO-844698", musteri: "T. İş Bankası A.Ş. Yeşilpınar", sehir: "İstanbul", ilce: "Gaziosmanpaşa", rota: 10, plaka: "34 CRD 320", durum: "yolda", agirlik: 36.98, hacim: 178, postaKodu: "34000", adres: "Kazım Karabekir Mah. Lisesi Bulvarı No:54", kargo: "Hepsi Jet" },
  { id: "SO-844655", musteri: "Yusuf Mengi", sehir: "Adana", ilce: "Çukurova", rota: 3, plaka: "34 NV 4683", durum: "teslim", agirlik: 1.63, hacim: 34, postaKodu: "01000", adres: "Kabasakal Mah. 129036 Sokak No:7", kargo: "Kargo - Yurtiçi" },
  { id: "SO-844640", musteri: "T. İş Bankası AŞ Üçyol İzmir", sehir: "İzmir", ilce: "Karabağlar", rota: 3, plaka: "34 NSU 025", durum: "teslim", agirlik: 17.63, hacim: 61, postaKodu: "35000", adres: "Bahçelievler Mah. İnönü Caddesi No:183", kargo: "Kargo - Yurtiçi" },
  { id: "SO-844612", musteri: "Ertuğrul Mekanik Ltd. Şti.", sehir: "Konya", ilce: "Çumra", rota: 4, plaka: "*", durum: "beklemede", agirlik: 24.25, hacim: 90, postaKodu: "42000", adres: "Yeniceoba Mah. Yeniceoba Cad. No:91 A", kargo: "Kamyon" },
  { id: "SO-844588", musteri: "T. İş Bankası AŞ Tunceli", sehir: "Tunceli", ilce: "Merkez", rota: 6, plaka: "*", durum: "beklemede", agirlik: 23.21, hacim: 40, postaKodu: "62000", adres: "Moğultay Mah. Cumhuriyet Caddesi No:7/10", kargo: "Kargo - Aras" },
  { id: "SO-844520", musteri: "T. İş Bankası AŞ Çarşı Sincan", sehir: "Ankara", ilce: "Sincan", rota: 4, plaka: "34 BSC 099", durum: "yolda", agirlik: 7.87, hacim: 24, postaKodu: "06000", adres: "Atatürk Mah. Cad. No:8/A-B subekodu:4391", kargo: "Kamyon" },
];

const fmt = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);

export default function DagitimPage() {
  const { toast, show } = useToast();
  const [teslimatlar, setTeslimatlar] = useState<Teslimat[]>(BASLANGIC);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [ara, setAra] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<Durum | "hepsi">("hepsi");
  const bugun = new Date().toLocaleDateString("tr-TR");

  const q = ara.trim().toLocaleLowerCase("tr-TR");
  const gorunen = useMemo(
    () =>
      teslimatlar.filter((t) => {
        if (durumFiltre !== "hepsi" && t.durum !== durumFiltre) return false;
        if (!q) return true;
        return [t.id, t.musteri, t.sehir, t.ilce, t.plaka, t.postaKodu, t.adres]
          .join(" ")
          .toLocaleLowerCase("tr-TR")
          .includes(q);
      }),
    [teslimatlar, durumFiltre, q]
  );

  // Sayaçlar
  const sayac = useMemo(() => {
    const s = { toplam: teslimatlar.length, cikacak: 0, yolda: 0, teslim: 0, beklemede: 0, agirlik: 0, hacim: 0 };
    for (const t of teslimatlar) {
      if (t.durum === "cikacak") s.cikacak++;
      else if (t.durum === "yolda") s.yolda++;
      else if (t.durum === "teslim") s.teslim++;
      else if (t.durum === "beklemede") s.beklemede++;
      s.agirlik += t.agirlik;
      s.hacim += t.hacim;
    }
    return s;
  }, [teslimatlar]);

  // Araç doluluk (atanmış teslimatların hacmi / kapasite)
  const aracDoluluk = (plaka: string) => {
    const yuk = teslimatlar.filter((t) => t.plaka === plaka).reduce((sum, t) => sum + t.hacim, 0);
    const arac = ARACLAR.find((a) => a.plaka === plaka);
    const kap = arac?.kapasite ?? 0;
    return { yuk, kap, oran: kap > 0 ? Math.min(100, Math.round((yuk / kap) * 100)) : 0, adet: teslimatlar.filter((t) => t.plaka === plaka).length };
  };

  const toggle = (id: string) =>
    setSecili((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const tumunuToggle = () =>
    setSecili((prev) => (prev.size === gorunen.length ? new Set() : new Set(gorunen.map((t) => t.id))));

  const durumDegistir = (yeni: Durum, mesaj: string) => {
    if (secili.size === 0) { show({ kind: "warn", text: "Önce teslimat seçin." }); return; }
    setTeslimatlar((prev) => prev.map((t) => (secili.has(t.id) ? { ...t, durum: yeni } : t)));
    show({ kind: "ok", text: `${secili.size} teslimat: ${mesaj}` });
    setSecili(new Set());
  };

  const filtreler: { key: Durum | "hepsi"; label: string; n: number }[] = [
    { key: "hepsi", label: "Tümü", n: sayac.toplam },
    { key: "cikacak", label: "Çıkacak", n: sayac.cikacak },
    { key: "yolda", label: "Yolda", n: sayac.yolda },
    { key: "teslim", label: "Teslim", n: sayac.teslim },
    { key: "beklemede", label: "Beklemede", n: sayac.beklemede },
  ];

  return (
    <div className="mx-auto max-w-[1700px] p-3 lg:p-5">
      <PageHeader title="Dağıtım" subtitle="Sevkiyat ve dağıtımı tek ekrandan yönet" backTo="/home" />

      {/* ÜST: bağlam + arama + toplu aksiyonlar */}
      <div className="card mt-3 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[11px] font-black text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">Firma 01</span>
            <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[11px] font-bold text-subtle">Tesis 100</span>
            <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[11px] font-bold text-subtle">{bugun}</span>
          </div>

          <div className="relative min-w-[180px] flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Sipariş no, müşteri, şehir, plaka…" className="field-input h-9 pl-9 text-sm" autoComplete="off" />
          </div>

          {/* Toplu aksiyonlar */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-subtle">{secili.size} seçili</span>
            <button type="button" onClick={() => durumDegistir("yolda", "dağıtıma çıkarıldı")} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-95"><Send className="h-4 w-4" /> Dağıtıma Çıkart</button>
            <button type="button" onClick={() => durumDegistir("teslim", "teslim edildi")} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-95"><CheckCircle2 className="h-4 w-4" /> Teslim Edildi</button>
            <button type="button" onClick={() => durumDegistir("cikacak", "tekrar gönderildi")} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-elevated px-3.5 text-sm font-semibold text-fg transition hover:bg-line active:scale-95"><RotateCcw className="h-4 w-4" /> Tekrar Gönder</button>
            <button type="button" onClick={() => durumDegistir("beklemede", "beklemeye alındı")} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-elevated px-3.5 text-sm font-semibold text-rose-600 transition hover:bg-line active:scale-95"><PauseCircle className="h-4 w-4" /> İptal / Beklet</button>
          </div>
        </div>

        {/* Durum filtreleri + özet sayaçlar */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          {filtreler.map((f) => (
            <button key={f.key} type="button" onClick={() => setDurumFiltre(f.key)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition ${durumFiltre === f.key ? "bg-brand-600 text-white" : "bg-elevated text-subtle hover:text-fg"}`}>
              {f.label} <span className={`rounded-full px-1.5 ${durumFiltre === f.key ? "bg-white/20" : "bg-surface"}`}>{f.n}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3 text-xs font-medium text-subtle">
            <span><b className="font-mono text-sm font-extrabold text-fg">{fmt(sayac.agirlik)}</b> kg</span>
            <span><b className="font-mono text-sm font-extrabold text-fg">{fmt(sayac.hacim)}</b> ds</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-4 xl:flex-row">
        {/* SOL/GENİŞ: TESLİMAT LİSTESİ */}
        <main className="min-w-0 flex-1">
          <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <Boxes className="h-4 w-4 text-subtle" />
              <h2 className="text-sm font-bold text-fg">Teslimatlar</h2>
              <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold text-subtle">{gorunen.length} kayıt</span>
              <button type="button" onClick={tumunuToggle} className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 active:scale-95 dark:hover:bg-brand-500/10">
                {gorunen.length > 0 && secili.size === gorunen.length ? "Seçimi Kaldır" : "Tümünü Seç"}
              </button>
            </div>

            {/* TABLET / MOBİL: dokunma dostu kart listesi */}
            <div className="max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto p-2.5 lg:hidden">
              {gorunen.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-subtle"><Package className="h-8 w-8" /><p className="text-sm">Kayıt bulunamadı</p></div>
              )}
              {gorunen.map((t) => {
                const s = secili.has(t.id);
                const d = DURUM[t.durum];
                return (
                  <button key={t.id} type="button" onClick={() => toggle(t.id)} className={`w-full rounded-2xl border p-3 text-left transition active:scale-[0.99] ${s ? "border-brand-500 bg-brand-50/70 ring-1 ring-brand-300 dark:bg-brand-500/10" : "border-line bg-surface hover:border-brand-300"}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${s ? "border-brand-500 bg-brand-500 text-white" : "border-line text-transparent"}`}><Check className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-brand-700 dark:text-brand-300">{t.id}</span>
                          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${d.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} /> {d.label}</span>
                        </div>
                        <p className="mt-0.5 text-sm font-bold text-fg">{t.musteri}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-subtle"><MapPin className="h-3.5 w-3.5 shrink-0" /> {t.sehir} · {t.ilce} · Rota {t.rota}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className={`font-mono font-bold ${t.plaka === "*" ? "text-subtle" : "text-fg"}`}>{t.plaka === "*" ? "— araç atanmadı —" : t.plaka}</span>
                          <span className="text-subtle">{t.kargo}</span>
                          <span className="ml-auto font-mono text-subtle"><b className="text-fg">{fmt(t.agirlik)}</b> kg · <b className="text-fg">{fmt(t.hacim)}</b> ds</span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-subtle" title={t.adres}>{t.adres} · {t.postaKodu}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* MASAÜSTÜ: tablo */}
            <div className="hidden max-h-[calc(100vh-260px)] overflow-auto lg:block">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-elevated text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-3 py-2"><input type="checkbox" checked={gorunen.length > 0 && secili.size === gorunen.length} onChange={tumunuToggle} className="h-4 w-4 accent-brand-600" /></th>
                    <th className="px-3 py-2">Sipariş / Müşteri</th>
                    <th className="px-3 py-2">Şehir / İlçe</th>
                    <th className="px-3 py-2 text-center">Rota</th>
                    <th className="px-3 py-2">Araç / Taşıma</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2 text-right">Ağırlık</th>
                    <th className="px-3 py-2 text-right">Hacim</th>
                    <th className="px-3 py-2">Adres</th>
                  </tr>
                </thead>
                <tbody>
                  {gorunen.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-subtle"><Package className="mx-auto mb-2 h-8 w-8" /> Kayıt bulunamadı</td></tr>
                  )}
                  {gorunen.map((t) => {
                    const s = secili.has(t.id);
                    const d = DURUM[t.durum];
                    return (
                      <tr key={t.id} onClick={() => toggle(t.id)} className={`cursor-pointer border-b border-line/70 transition ${s ? "bg-brand-50/70 dark:bg-brand-500/10" : "hover:bg-elevated/50"}`}>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={s} onChange={() => toggle(t.id)} className="h-4 w-4 accent-brand-600" /></td>
                        <td className="px-3 py-2">
                          <p className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">{t.id}</p>
                          <p className="text-xs font-semibold text-fg">{t.musteri}</p>
                        </td>
                        <td className="px-3 py-2"><p className="text-xs text-fg">{t.sehir}</p><p className="text-[11px] text-subtle">{t.ilce}</p></td>
                        <td className="px-3 py-2 text-center"><span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg bg-elevated px-1.5 font-mono text-xs font-black text-fg">{t.rota}</span></td>
                        <td className="px-3 py-2">
                          <p className={`font-mono text-xs font-bold ${t.plaka === "*" ? "text-subtle" : "text-fg"}`}>{t.plaka === "*" ? "— atanmadı —" : t.plaka}</p>
                          <p className="text-[11px] text-subtle">{t.kargo}</p>
                        </td>
                        <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${d.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} /> {d.label}</span></td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-fg">{fmt(t.agirlik)}<span className="ml-0.5 text-[10px] text-subtle">kg</span></td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-fg">{fmt(t.hacim)}<span className="ml-0.5 text-[10px] text-subtle">ds</span></td>
                        <td className="max-w-[220px] px-3 py-2"><p className="truncate text-[11px] text-subtle" title={t.adres}>{t.adres}</p><p className="font-mono text-[10px] text-subtle">{t.postaKodu}</p></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        {/* SAĞ: ARAÇLAR + ROTALAR */}
        <aside className="space-y-4 xl:w-80 xl:shrink-0">
          {/* Araçlar */}
          <div className="rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <Truck className="h-4 w-4 text-subtle" />
              <h2 className="text-sm font-bold text-fg">Araçlar</h2>
              <span className="ml-auto rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold text-subtle">{ARACLAR.length}</span>
            </div>
            <div className="max-h-[38vh] space-y-2 overflow-y-auto p-2.5">
              {ARACLAR.map((a) => {
                const dl = aracDoluluk(a.plaka);
                const kargo = a.plaka === "KARGO";
                return (
                  <div key={a.plaka} className="rounded-xl border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-black text-fg">{a.plaka}</span>
                      <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-subtle">{dl.adet} teslimat</span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-subtle"><User className="h-3 w-3" /> {a.surucu}</p>
                    {!kargo && (
                      <>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                          <div className={`h-full rounded-full ${dl.oran > 100 ? "bg-rose-500" : dl.oran > 85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${dl.oran}%` }} />
                        </div>
                        <p className="mt-1 flex items-center justify-between font-mono text-[10px] text-subtle"><span>{fmt(dl.yuk)} / {fmt(dl.kap)} ds</span><span className="font-bold text-fg">%{dl.oran}</span></p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rotalar */}
          <div className="rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <RouteIcon className="h-4 w-4 text-subtle" />
              <h2 className="text-sm font-bold text-fg">Rotalar</h2>
            </div>
            <div className="space-y-1.5 p-2.5">
              {ROTALAR.map((r) => {
                const adet = teslimatlar.filter((t) => t.rota === r.no).length;
                const kg = teslimatlar.filter((t) => t.rota === r.no).reduce((s, t) => s + t.agirlik, 0);
                return (
                  <div key={r.no} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-100 font-mono text-xs font-black text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">{r.no}</span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-fg"><MapPin className="h-3 w-3 text-subtle" /> {r.sehir}</span>
                    <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-subtle"><span>{adet} tsl.</span><span className="flex items-center gap-0.5"><Weight className="h-3 w-3" />{fmt(kg)}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}
