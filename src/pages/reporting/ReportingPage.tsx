import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Search, User, Building2, CalendarDays } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import type { TransactionRow } from "../../types";

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

  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [queried, setQueried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detay, setDetay] = useState(false);
  const [sayfa, setSayfa] = useState(1);
  const [tumKullanici, setTumKullanici] = useState(false);
  const SAYFA_BOYUT = 50;
  const KULLANICI_LIMIT = 12;

  useEffect(() => {
    api.getPlants().then(setPlants).catch(() => {});
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
      });
      setRows(r);
      setSayfa(1);
      setTumKullanici(false);
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
  const data = rows;

  // Kullanıcı bazında özet (kim ne kadar toplamış)
  const ozet = useMemo(() => {
    const map = new Map<string, { user: string; belge: number; kalem: number; siparis: Set<string>; hacim: number; agirlik: number }>();
    for (const r of data) {
      const k = r.user || "—";
      if (!map.has(k)) map.set(k, { user: k, belge: 0, kalem: 0, siparis: new Set(), hacim: 0, agirlik: 0 });
      const g = map.get(k)!;
      g.belge += 1;
      g.kalem += r.item;
      if (r.isSalesOrder && r.order) g.siparis.add(r.order);
      g.hacim += r.volume;
      g.agirlik += r.weight;
    }
    return [...map.values()].sort((a, b) => b.kalem - a.kalem);
  }, [data]);

  const toplam = useMemo(() => ({
    belge: data.length,
    kalem: data.reduce((s, r) => s + r.item, 0),
    hacim: data.reduce((s, r) => s + r.volume, 0),
    agirlik: data.reduce((s, r) => s + r.weight, 0),
    siparis: new Set(data.filter((r) => r.isSalesOrder).map((r) => r.order).filter(Boolean)).size,
    kullanici: new Set(data.map((r) => r.user).filter(Boolean)).size,
  }), [data]);

  const sayfaSayisi = Math.max(1, Math.ceil(data.length / SAYFA_BOYUT));
  const aktifSayfa = Math.min(sayfa, sayfaSayisi);
  const sayfaData = data.slice((aktifSayfa - 1) * SAYFA_BOYUT, aktifSayfa * SAYFA_BOYUT);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader title="Stok İşlemleri" backTo="/home" />

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
        </div>
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

          {/* Kullanıcı bazında özet — kartlar */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-subtle">Kullanıcılar ({ozet.length})</h2>
          </div>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(tumKullanici ? ozet : ozet.slice(0, KULLANICI_LIMIT)).map((g) => (
              <div key={g.user} className="card p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-700">
                    {basHarf(g.user)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-fg">{g.user}</p>
                    <p className="text-xs text-subtle">{g.belge} belge</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-elevated px-3 py-2">
                    <p className="truncate font-mono text-xl font-extrabold text-cyan-600">{fmt(g.kalem)}</p>
                    <p className="text-[11px] text-subtle">Kalem</p>
                  </div>
                  <div className="rounded-xl bg-elevated px-3 py-2">
                    <p className="truncate font-mono text-xl font-extrabold text-violet-600">{fmt(g.siparis.size)}</p>
                    <p className="text-[11px] text-subtle">Sipariş</p>
                  </div>
                  <div className="rounded-xl bg-elevated px-3 py-2">
                    <p className="truncate font-mono text-xl font-extrabold text-emerald-600">{fmt(g.hacim)}</p>
                    <p className="text-[11px] text-subtle">Desi</p>
                  </div>
                  <div className="rounded-xl bg-elevated px-3 py-2">
                    <p className="truncate font-mono text-xl font-extrabold text-amber-600">{fmt(g.agirlik)}</p>
                    <p className="text-[11px] text-subtle">kg</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {ozet.length > KULLANICI_LIMIT && (
            <button type="button" onClick={() => setTumKullanici((v) => !v)} className="mb-6 text-sm font-semibold text-brand-600 hover:underline">
              {tumKullanici ? "Daha az göster" : `Tüm kullanıcıları göster (${ozet.length})`}
            </button>
          )}

          {/* Detay kayıtlar */}
          <button type="button" onClick={() => setDetay((v) => !v)} className="mb-3 text-sm font-semibold text-brand-600 hover:underline">
            {detay ? "Detayı gizle" : `Detayı göster (${data.length} kayıt)`}
          </button>
          {detay && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-subtle">
                    <th className="px-3 py-2 font-semibold">Kullanıcı</th>
                    <th className="px-3 py-2 font-semibold">Tarih</th>
                    <th className="px-3 py-2 font-semibold">İşlem</th>
                    <th className="px-3 py-2 text-right font-semibold">Kalem</th>
                    <th className="px-3 py-2 text-right font-semibold">kg</th>
                    <th className="px-3 py-2 text-right font-semibold">Desi</th>
                    <th className="px-3 py-2 font-semibold">Kaynak Belge</th>
                    <th className="px-3 py-2 font-semibold">Belge No</th>
                  </tr>
                </thead>
                <tbody>
                  {sayfaData.map((r, i) => (
                    <tr key={i} className="border-b border-line/50 last:border-0">
                      <td className="px-3 py-2 font-semibold">{r.user || "—"}</td>
                      <td className="px-3 py-2 font-mono">{r.date || "—"}</td>
                      <td className="px-3 py-2">{r.typeText || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.item}</td>
                      <td className="px-3 py-2 text-right font-mono">{round(r.weight)}</td>
                      <td className="px-3 py-2 text-right font-mono">{round(r.volume)}</td>
                      <td className="px-3 py-2 font-mono">{r.order ? `${r.srcDocType} ${r.order}` : "—"}</td>
                      <td className="px-3 py-2 font-mono">{r.docNum || "—"}</td>
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
