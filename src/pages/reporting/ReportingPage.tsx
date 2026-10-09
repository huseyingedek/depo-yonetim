import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Loader2, Search, User, Building2, CalendarDays, ListFilter, FileSpreadsheet, FileText, Hash, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import type { TransactionRow } from "../../types";
import { xlsxOlustur, dosyaIndir } from "../../utils/excel";

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const isoToCanias = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`; // GG.AA.YYYY (gün iki haneli)
};
function monthDefaults() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: isoOf(first), end: isoOf(last) };
}
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// Toplamlar için tam sayıya yuvarla + binlik ayraç (2.294.194)
const fmt = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n);
// Türkçe büyük/küçük harf duyarsız karşılaştırma (İ/ı doğru eşleşsin)
const kucuk = (s: string) => (s || "").trim().toLocaleLowerCase("tr-TR");
// PICKTYPE (Alt İşlem Türü) sabit değerleri (Bora, 09.10)
const PICKTYPE_SABIT = ["Toplama", "Atama", "Diğer"];
const basHarf = (ad: string) =>
  ad.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";

export default function ReportingPage() {
  const settings = useAppStore((s) => s.settings);
  const def = monthDefaults();

  const [plants, setPlants] = useState<{ code: string; name: string }[]>([]);
  const [plant, setPlant] = useState(settings.facility ?? "");
  const [user, setUser] = useState("");
  const [start, setStart] = useState(def.start);
  const [end, setEnd] = useState(def.end);

  // İşlem türü (PISOURCETYPE) ve alt işlem türü (PISRCTYPE) filtreleri (MZYGetSourceType).
  const [sourceTypes, setSourceTypes] = useState<{ code: string; text: string }[]>([]);
  const [srcTypes, setSrcTypes] = useState<{ code: string; text: string }[]>([]);
  const [sourceType, setSourceType] = useState("");
  const [srcType, setSrcType] = useState("");

  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [queried, setQueried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detay, setDetay] = useState(false);

  // Sonuç filtreleri (Bora, 09.10: "detaydaki alanlar yukarıda da filtrelenebilsin").
  // Servise gitmez; sorgu sonucunu anında süzer. Kartlar, işlem özeti, detay ve Excel
  // hep bu süzülmüş veriyle hesaplanır.
  const [fPickType, setFPickType] = useState("");
  const [fBelgeAdi, setFBelgeAdi] = useState("");
  const [fKaynak, setFKaynak] = useState("");
  const [fBelgeNo, setFBelgeNo] = useState("");
  const [sayfa, setSayfa] = useState(1);
  const SAYFA_BOYUT = 50;

  // StrictMode (dev) useEffect'i iki kez çalıştırır → fazladan istek atılmasın diye
  // tek seferlik guard (ayrıca api katmanında da inflight dedup var).
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    api.getPlants().then(setPlants).catch(() => {});
    // İşlem türleri: 0 → işlem açıklamaları, 2 → alt işlem açıklamaları (Bora, 12.09).
    api.getSourceType(0).then(setSourceTypes).catch(() => {});
    api.getSourceType(2).then(setSrcTypes).catch(() => {});
  }, []);

  const sorgula = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getTransaction({
        plant,
        user: user.trim(),
        startDate: isoToCanias(start),
        endDate: isoToCanias(end),
        sourceType,
        srcType,
      });
      setRows(r);
      setSayfa(1);
      setQueried(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setQueried(true);
    } finally {
      setLoading(false);
    }
  };

  // Servis belge bazında dönüyor: her satır bir belge, ITEM = belgedeki kalem sayısı.
  const data = useMemo(() => {
    const pt = kucuk(fPickType), ba = kucuk(fBelgeAdi), kb = kucuk(fKaynak), bn = kucuk(fBelgeNo);
    if (!pt && !ba && !kb && !bn) return rows;
    return rows.filter((r) =>
      (!pt || kucuk(r.pickType) === pt) &&
      (!ba || kucuk(r.docName) === ba) &&
      (!kb || kucuk(`${r.srcDocType} ${r.order}`).includes(kb) || kucuk(r.order).includes(kb)) &&
      (!bn || kucuk(r.docNum).includes(bn))
    );
  }, [rows, fPickType, fBelgeAdi, fKaynak, fBelgeNo]);
  const sonucFiltresiVar = !!(fPickType || fBelgeAdi || fKaynak || fBelgeNo);
  const sonucFiltreTemizle = () => { setFPickType(""); setFBelgeAdi(""); setFKaynak(""); setFBelgeNo(""); };
  // Filtre değişince detay ilk sayfaya dönsün
  useEffect(() => { setSayfa(1); }, [fPickType, fBelgeAdi, fKaynak, fBelgeNo]);

  // Açılır listeler: PICKTYPE sabit 3 değer + veride gelen başka değer varsa o da; Belge Adı veriden.
  const pickTypeSecenek = useMemo(() => {
    const ek = [...new Set(rows.map((r) => r.pickType).filter(Boolean))]
      .filter((v) => !PICKTYPE_SABIT.some((s) => kucuk(s) === kucuk(v)));
    return [...PICKTYPE_SABIT, ...ek.sort((a, b) => a.localeCompare(b, "tr"))];
  }, [rows]);
  const belgeAdiSecenek = useMemo(
    () => [...new Set(rows.map((r) => r.docName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")),
    [rows]
  );

  // Detay sütunları — ekran ve Excel AYNI listeyi kullanır (yukarıdaki filtre alanlarının hepsi burada).
  const DETAY_SUTUN: { baslik: string; deger: (r: TransactionRow) => string | number; sayi?: boolean; mono?: boolean }[] = [
    { baslik: "Tesis", deger: (r) => r.plant, mono: true },
    { baslik: "Kullanıcı", deger: (r) => r.user },
    { baslik: "Tarih", deger: (r) => r.date, mono: true },
    { baslik: "İşlem Türü", deger: (r) => r.typeText },
    { baslik: "Kaynak Türü", deger: (r) => r.srcTypeText },
    { baslik: "Alt İşlem Türü", deger: (r) => r.pickType },
    { baslik: "Belge Adı", deger: (r) => r.docName },
    { baslik: "Kalem", deger: (r) => r.item, sayi: true },
    { baslik: "kg", deger: (r) => round(r.weight), sayi: true },
    { baslik: "Desi", deger: (r) => round(r.volume), sayi: true },
    { baslik: "Kaynak Belge", deger: (r) => (r.order ? `${r.srcDocType} ${r.order}` : ""), mono: true },
    { baslik: "Belge No", deger: (r) => r.docNum, mono: true },
  ];

  const excelAktar = () => {
    const blob = xlsxOlustur(
      "KPI Detay",
      DETAY_SUTUN.map((c) => c.baslik),
      data.map((r) => DETAY_SUTUN.map((c) => c.deger(r)))
    );
    dosyaIndir(blob, `KPI_Detay_${start}_${end}.xlsx`);
  };

  // Sipariş = TEKİL "Kaynak Belge" (SRCDOCTYPE + SRCDOCNUM). Tip filtresi YOK (Bora, 08.10):
  // eskiden yalnız SO sayılıyordu (215 ↔ CANIAS 267). Aynı belge tekrar gelirse sayı artmaz.
  const siparisKey = (r: { srcDocType: string; order: string }) =>
    r.order ? `${r.srcDocType}|${r.order}` : "";

  // İşlem türü bazında özet (Mal Kabul / Toplama / Yerleştirme... ayrı ayrı) +
  // her işlemin içinde kullanıcı kırılımı. (KPI: gruplama + toplam ayrımı)
  const islemGruplari = useMemo(() => {
    type U = { user: string; belge: number; kalem: number; hacim: number; agirlik: number; siparis: Set<string> };
    const map = new Map<string, {
      islem: string; belge: number; kalem: number; hacim: number; agirlik: number;
      siparis: Set<string>; kullanicilar: Map<string, U>;
    }>();
    for (const r of data) {
      const op = (r.srcTypeText || r.typeText || "Diğer").trim() || "Diğer";
      if (!map.has(op)) {
        map.set(op, { islem: op, belge: 0, kalem: 0, hacim: 0, agirlik: 0, siparis: new Set(), kullanicilar: new Map() });
      }
      const g = map.get(op)!;
      g.belge += 1;
      g.kalem += r.item;
      g.hacim += r.volume;
      g.agirlik += r.weight;
      if (siparisKey(r)) g.siparis.add(siparisKey(r));

      const uk = r.user || "—";
      if (!g.kullanicilar.has(uk)) {
        g.kullanicilar.set(uk, { user: uk, belge: 0, kalem: 0, hacim: 0, agirlik: 0, siparis: new Set() });
      }
      const u = g.kullanicilar.get(uk)!;
      u.belge += 1;
      u.kalem += r.item;
      u.hacim += r.volume;
      u.agirlik += r.weight;
      if (siparisKey(r)) u.siparis.add(siparisKey(r));
    }
    return [...map.values()]
      .map((g) => ({
        islem: g.islem,
        belge: g.belge,
        kalem: g.kalem,
        hacim: g.hacim,
        agirlik: g.agirlik,
        siparis: g.siparis.size,
        kullanicilar: [...g.kullanicilar.values()].sort((a, b) => b.kalem - a.kalem),
      }))
      .sort((a, b) => b.kalem - a.kalem);
  }, [data]);

  const toplam = useMemo(() => ({
    belge: data.length,
    kalem: data.reduce((s, r) => s + r.item, 0),
    hacim: data.reduce((s, r) => s + r.volume, 0),
    agirlik: data.reduce((s, r) => s + r.weight, 0),
    siparis: new Set(data.map(siparisKey).filter(Boolean)).size,
    kullanici: new Set(data.map((r) => r.user).filter(Boolean)).size,
  }), [data]);

  const sayfaSayisi = Math.max(1, Math.ceil(data.length / SAYFA_BOYUT));
  const aktifSayfa = Math.min(sayfa, sayfaSayisi);
  const sayfaData = data.slice((aktifSayfa - 1) * SAYFA_BOYUT, aktifSayfa * SAYFA_BOYUT);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader title="Stok Hareket Raporları" backTo="/home" />

      {/* Filtreler */}
      <div className="card mb-6 p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="field-label flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Tesis</span>
            <select value={plant} onChange={(e) => setPlant(e.target.value)} className="field-input">
              <option value="">Tümü</option>
              {plants.map((p) => (
                <option key={p.code} value={p.code}>{p.code}{p.name && p.name !== p.code ? " · " + p.name : ""}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label flex items-center gap-1.5"><User className="h-4 w-4" /> Kullanıcı</span>
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Tümü (boş bırak)" className="field-input" autoComplete="off" />
          </label>
          <label className="block">
            <span className="field-label flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Başlangıç</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Bitiş</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label flex items-center gap-1.5"><ListFilter className="h-4 w-4" /> İşlem Türü</span>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="field-input">
              <option value="">Tümü</option>
              {sourceTypes.map((t) => (
                <option key={t.code} value={t.code}>{t.text || t.code}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label flex items-center gap-1.5"><ListFilter className="h-4 w-4" /> Kaynak Türü</span>
            <select value={srcType} onChange={(e) => setSrcType(e.target.value)} className="field-input">
              <option value="">Tümü</option>
              {srcTypes.map((t) => (
                <option key={t.code} value={t.code}>{t.text || t.code}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Sonuç filtreleri — sorgu sonucunu anında süzer (servise gitmez) */}
        {rows.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Sonuç filtreleri <span className="normal-case font-medium">· Sorgula gerekmez</span></p>
              {sonucFiltresiVar && (
                <button type="button" onClick={sonucFiltreTemizle} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                  <X className="h-3.5 w-3.5" /> Filtreleri temizle
                </button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="field-label flex items-center gap-1.5"><ListFilter className="h-4 w-4" /> Alt İşlem Türü</span>
                <select value={fPickType} onChange={(e) => setFPickType(e.target.value)} className="field-input">
                  <option value="">Tümü</option>
                  {pickTypeSecenek.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label flex items-center gap-1.5"><FileText className="h-4 w-4" /> Belge Adı</span>
                <select value={fBelgeAdi} onChange={(e) => setFBelgeAdi(e.target.value)} className="field-input">
                  <option value="">Tümü</option>
                  {belgeAdiSecenek.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="field-label flex items-center gap-1.5"><Hash className="h-4 w-4" /> Kaynak Belge</span>
                <input value={fKaynak} onChange={(e) => setFKaynak(e.target.value)} placeholder="ör. SO 845720" className="field-input" autoComplete="off" />
              </label>
              <label className="block">
                <span className="field-label flex items-center gap-1.5"><Hash className="h-4 w-4" /> Belge No</span>
                <input value={fBelgeNo} onChange={(e) => setFBelgeNo(e.target.value)} placeholder="Tümü" className="field-input" autoComplete="off" />
              </label>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={sorgula} disabled={loading} className="btn-primary btn-lg px-8">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />} Sorgula
          </button>
        </div>
      </div>

      {error && <div className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-600">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-subtle"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : !queried ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-20 text-center text-subtle">
          <BarChart3 className="mb-2 h-10 w-10" />
          <p className="text-sm">Tarih aralığı ve filtreleri seçip “Sorgula”ya basın.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-20 text-center text-subtle">
          <BarChart3 className="mb-2 h-10 w-10" />
          <p className="text-sm font-semibold text-rose-600">Kayıt bulunamadı</p>
          <p className="mt-1 text-xs">Seçili aralıkta işlem yok.</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center text-subtle">
          <ListFilter className="mb-2 h-9 w-9" />
          <p className="text-sm font-semibold text-fg">Sonuç filtrelerine uyan kayıt yok</p>
          <button type="button" onClick={sonucFiltreTemizle} className="mt-2 text-sm font-semibold text-brand-600 hover:underline">Filtreleri temizle</button>
        </div>
      ) : (
        <>
          {/* Toplam kartları */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Kullanıcı", fmt(toplam.kullanici), "text-brand-600"],
              ["Belge", fmt(toplam.belge), "text-slate-600"],
              ["Kalem", fmt(toplam.kalem), "text-cyan-600"],
              ["Sipariş", fmt(toplam.siparis), "text-violet-600"],
              ["Toplam Desi", fmt(toplam.hacim), "text-emerald-600"],
              ["Toplam Ağırlık (kg)", fmt(toplam.agirlik), "text-amber-600"],
            ].map(([lbl, val, cls]) => (
              <div key={lbl as string} className="card p-4">
                <p className="text-xs font-medium text-subtle">{lbl}</p>
                <p className={`mt-1 truncate font-mono text-2xl font-extrabold ${cls}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* İŞLEM BAZINDA TOPLAM (KPI: toplanan / paketlenen / mal kabul ayrımı) */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-subtle">İşlem Bazında Toplam ({islemGruplari.length})</h2>
          </div>
          <div className="card mb-8 overflow-x-auto p-0">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-line text-left text-subtle">
                  <th className="px-3 py-2 font-semibold">İşlem</th>
                  <th className="px-3 py-2 text-right font-semibold">Belge</th>
                  <th className="px-3 py-2 text-right font-semibold">Kalem</th>
                  <th className="px-3 py-2 text-right font-semibold">Sipariş</th>
                  <th className="px-3 py-2 text-right font-semibold">Desi</th>
                  <th className="px-3 py-2 text-right font-semibold">kg</th>
                </tr>
              </thead>
              <tbody>
                {islemGruplari.map((g) => (
                  <tr key={g.islem} className="border-b border-line/50 last:border-0">
                    <td className="px-3 py-2 font-bold text-fg">{g.islem}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(g.belge)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-cyan-600">{fmt(g.kalem)}</td>
                    <td className="px-3 py-2 text-right font-mono text-violet-600">{fmt(g.siparis)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(g.hacim)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-600">{fmt(g.agirlik)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* KULLANICILAR — İŞLEME GÖRE GRUPLU (KPI: Mal Kabul bir arada, Toplama bir arada) */}
          {islemGruplari.map((grup) => (
            <div key={grup.islem} className="mb-8">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-fg">{grup.islem}</h2>
                <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] font-semibold text-subtle">
                  {grup.kullanicilar.length} kullanıcı · {fmt(grup.kalem)} kalem
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grup.kullanicilar.map((u) => (
                  <div key={u.user} className="card p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-700">
                        {basHarf(u.user)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-fg">{u.user}</p>
                        <p className="text-xs text-subtle">{u.belge} belge</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-elevated px-3 py-2">
                        <p className="truncate font-mono text-xl font-extrabold text-cyan-600">{fmt(u.kalem)}</p>
                        <p className="text-[11px] text-subtle">Kalem</p>
                      </div>
                      <div className="rounded-xl bg-elevated px-3 py-2">
                        <p className="truncate font-mono text-xl font-extrabold text-violet-600">{fmt(u.siparis.size)}</p>
                        <p className="text-[11px] text-subtle">Sipariş</p>
                      </div>
                      <div className="rounded-xl bg-elevated px-3 py-2">
                        <p className="truncate font-mono text-xl font-extrabold text-emerald-600">{fmt(u.hacim)}</p>
                        <p className="text-[11px] text-subtle">Desi</p>
                      </div>
                      <div className="rounded-xl bg-elevated px-3 py-2">
                        <p className="truncate font-mono text-xl font-extrabold text-amber-600">{fmt(u.agirlik)}</p>
                        <p className="text-[11px] text-subtle">kg</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Detay kayıtlar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setDetay((v) => !v)} className="text-sm font-semibold text-brand-600 hover:underline">
              {detay ? "Detayı gizle" : `Detayı göster (${fmt(data.length)} kayıt${sonucFiltresiVar ? ` / ${fmt(rows.length)}` : ""})`}
            </button>
            <button
              type="button"
              onClick={excelAktar}
              title="Süzülmüş detay kayıtlarının tamamını (tüm sayfalar) Excel'e aktarır"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel'e Aktar ({fmt(data.length)})
            </button>
          </div>
          {detay && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-subtle">
                    {DETAY_SUTUN.map((c) => (
                      <th key={c.baslik} className={`whitespace-nowrap px-3 py-2 font-semibold ${c.sayi ? "text-right" : ""}`}>{c.baslik}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sayfaData.map((r, i) => (
                    <tr key={i} className="border-b border-line/50 last:border-0">
                      {DETAY_SUTUN.map((c, ci) => {
                        const v = c.deger(r);
                        return (
                          <td
                            key={c.baslik}
                            className={`whitespace-nowrap px-3 py-2 ${c.sayi ? "text-right font-mono" : c.mono ? "font-mono" : ""} ${ci === 1 ? "font-semibold" : ""}`}
                          >
                            {v === "" ? "—" : v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detay && sayfaSayisi > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-subtle">
                {(aktifSayfa - 1) * SAYFA_BOYUT + 1}–{Math.min(aktifSayfa * SAYFA_BOYUT, data.length)} / {data.length} kayıt
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSayfa(1)} disabled={aktifSayfa === 1} className="btn-ghost btn-sm disabled:opacity-40">« İlk</button>
                <button type="button" onClick={() => setSayfa((p) => Math.max(1, p - 1))} disabled={aktifSayfa === 1} className="btn-ghost btn-sm disabled:opacity-40">‹ Önceki</button>
                <span className="px-2 font-semibold">{aktifSayfa} / {sayfaSayisi}</span>
                <button type="button" onClick={() => setSayfa((p) => Math.min(sayfaSayisi, p + 1))} disabled={aktifSayfa === sayfaSayisi} className="btn-ghost btn-sm disabled:opacity-40">Sonraki ›</button>
                <button type="button" onClick={() => setSayfa(sayfaSayisi)} disabled={aktifSayfa === sayfaSayisi} className="btn-ghost btn-sm disabled:opacity-40">Son »</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
