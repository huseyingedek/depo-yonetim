import { useRef, useState } from "react";
import {
  Package,
  Box,
  Layers,
  ScanLine,
  Camera,
  Check,
  Plus,
  Minus,
  Truck,
  ChevronRight,
  ChevronDown,
  Weight,
  PackagePlus,
  Pause,
  Container,
  Trash2,
  MapPin,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
  Move,
  GripVertical,
  X,
  ArrowRight,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";

// -----------------------------------------------------------------------------
// PAKETLEME — TASARIM AŞAMASI (Hibrit: yapı listesi + palet görseli)
// Palet › Koli › Ürün. Tüm butonlar/alanlar local state ile çalışır (tasarımsal).
// Taşıma: koli → başka palet, ürün → başka koli (kısmi miktar). Sürükle-bırak +
// "Taşı" diyaloğu. Aynı ürün aynı koli/palette birden çok satır olabilir.
// CANIAS AKLPAKET servisi daha sonra bağlanacak.
// -----------------------------------------------------------------------------

interface Urun {
  uid: string;
  code: string;
  name: string;
  qty: number;
  unit: string;
  desi: number; // birim başı desi
  kg: number; // birim başı kg
}
interface Koli {
  id: string;
  no: number;
  tip: string;
  renk: RenkKey;
  beklemede?: boolean;
  atil?: boolean;
  urunler: Urun[];
}
interface Palet {
  id: string;
  ad: string;
  koliler: Koli[];
}
type RenkKey = "blue" | "orange" | "green" | "violet" | "rose" | "cyan";

type TasiHedef =
  | { kind: "urun"; paletId: string; koliId: string; uid: string }
  | { kind: "koli"; paletId: string; koliId: string };

const RENKLER: Record<RenkKey, { bg: string; ring: string; text: string }> = {
  blue: { bg: "bg-sky-100 dark:bg-sky-500/20", ring: "ring-sky-400", text: "text-sky-700 dark:text-sky-300" },
  orange: { bg: "bg-orange-100 dark:bg-orange-500/20", ring: "ring-orange-400", text: "text-orange-700 dark:text-orange-300" },
  green: { bg: "bg-emerald-100 dark:bg-emerald-500/20", ring: "ring-emerald-400", text: "text-emerald-700 dark:text-emerald-300" },
  violet: { bg: "bg-violet-100 dark:bg-violet-500/20", ring: "ring-violet-400", text: "text-violet-700 dark:text-violet-300" },
  rose: { bg: "bg-rose-100 dark:bg-rose-500/20", ring: "ring-rose-400", text: "text-rose-700 dark:text-rose-300" },
  cyan: { bg: "bg-cyan-100 dark:bg-cyan-500/20", ring: "ring-cyan-400", text: "text-cyan-700 dark:text-cyan-300" },
};
const RENK_SIRA: RenkKey[] = ["blue", "orange", "green", "violet", "rose", "cyan"];

function baslangicPaletleri(): Palet[] {
  return [
    {
      id: "PLT-1",
      ad: "Palet 1",
      koliler: [
        {
          id: "KOLI-7",
          no: 7,
          tip: "İç Kullanım Koli 280×165×170",
          renk: "blue",
          urunler: [
            { uid: "u1", code: "SV101", name: "Fotokopi Kağıdı A4 80Gr", qty: 10, unit: "PK", desi: 1.19, kg: 2.55 },
            { uid: "u2", code: "ZZ2328", name: "Koton Baskılı Koli Bandı 45×100", qty: 24, unit: "AD", desi: 0.076, kg: 0.0075 },
          ],
        },
        {
          id: "KOLI-2",
          no: 2,
          tip: "İç Kullanım Koli 300×300×330",
          renk: "orange",
          urunler: [{ uid: "u3", code: "SV101", name: "Fotokopi Kağıdı A4 80Gr", qty: 5, unit: "PK", desi: 1.19, kg: 2.55 }],
        },
        {
          id: "KOLI-3",
          no: 3,
          tip: "İç Kullanım Koli 320×280×170",
          renk: "green",
          urunler: [{ uid: "u4", code: "ZZ2328", name: "Koton Baskılı Koli Bandı 45×100", qty: 8, unit: "AD", desi: 0.635, kg: 0.2575 }],
        },
      ],
    },
  ];
}

const kalemler = [
  { code: "SV101", name: "Fotokopi Kağıdı A4 80Gr Beyaz", siparis: 20, paketlenen: 15, unit: "PK" },
  { code: "ZZ2328", name: "Koton Baskılı Koli Bandı 45X100", siparis: 40, paketlenen: 32, unit: "AD" },
];

const fmt = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
const koliDesi = (k: Koli) => k.urunler.reduce((s, u) => s + u.desi * u.qty, 0);
const koliKg = (k: Koli) => k.urunler.reduce((s, u) => s + u.kg * u.qty, 0);
const koliAdet = (k: Koli) => k.urunler.reduce((s, u) => s + u.qty, 0);

// Sürükle-bırak için sürüklenen öğe (modül seviyesi — dataTransfer serileştirme derdi yok)
let suruklenen: TasiHedef | null = null;

export default function PackagingPage() {
  const { toast, show } = useToast();
  const idRef = useRef(100);
  const yeniId = () => `x${++idRef.current}`;

  const [paletler, setPaletler] = useState<Palet[]>(baslangicPaletleri);
  const [aktifPaletId, setAktifPaletId] = useState("PLT-1");
  const [seciliKoliId, setSeciliKoliId] = useState<string>("KOLI-7");
  const [acikPalet, setAcikPalet] = useState<Record<string, boolean>>({ "PLT-1": true });
  const [acikKoli, setAcikKoli] = useState<Record<string, boolean>>({ "KOLI-7": true });
  const [arama, setArama] = useState("");
  const [barkod, setBarkod] = useState("");
  const [bitti, setBitti] = useState(false);
  const [dropHedef, setDropHedef] = useState<string | null>(null);

  // Taşıma diyaloğu
  const [tasi, setTasi] = useState<TasiHedef | null>(null);
  const [hedefPaletId, setHedefPaletId] = useState("");
  const [hedefKoliId, setHedefKoliId] = useState("");
  const [tasiAdet, setTasiAdet] = useState(1);

  const aktifPalet = paletler.find((p) => p.id === aktifPaletId) ?? paletler[0];
  const seciliKoli = paletler.flatMap((p) => p.koliler).find((k) => k.id === seciliKoliId);

  const genelDesi = paletler.reduce((s, p) => s + p.koliler.reduce((a, k) => a + koliDesi(k), 0), 0);
  const genelKg = paletler.reduce((s, p) => s + p.koliler.reduce((a, k) => a + koliKg(k), 0), 0);
  const genelKoli = paletler.reduce((s, p) => s + p.koliler.length, 0);
  const genelPaletSayisi = paletler.length;

  const q = arama.trim().toLocaleLowerCase("tr-TR");
  const koliEsles = (k: Koli) =>
    !q ||
    `koli ${k.no}`.includes(q) ||
    k.tip.toLocaleLowerCase("tr-TR").includes(q) ||
    k.urunler.some((u) => u.name.toLocaleLowerCase("tr-TR").includes(q) || u.code.toLocaleLowerCase("tr-TR").includes(q));

  // --- Temel aksiyonlar ------------------------------------------------------
  const paletGuncelle = (paletId: string, fn: (p: Palet) => Palet) =>
    setPaletler((prev) => prev.map((p) => (p.id === paletId ? fn(p) : p)));

  const yeniPalet = () => {
    const id = `PLT-${yeniId()}`;
    setPaletler((prev) => [...prev, { id, ad: `Palet ${prev.length + 1}`, koliler: [] }]);
    setAktifPaletId(id);
    setAcikPalet((s) => ({ ...s, [id]: true }));
    show({ kind: "ok", text: "Yeni palet oluşturuldu" });
    return id;
  };

  const yeniKoli = (paletId: string, atil = false) => {
    const id = `KOLI-${yeniId()}`;
    paletGuncelle(paletId, (p) => {
      const no = (p.koliler.reduce((m, k) => Math.max(m, k.no), 0) || 0) + 1;
      const renk = RENK_SIRA[p.koliler.length % RENK_SIRA.length];
      return { ...p, koliler: [...p.koliler, { id, no, tip: atil ? "Atıl Koli" : "Yeni Koli", renk, atil, urunler: [] }] };
    });
    setAcikPalet((s) => ({ ...s, [paletId]: true }));
    setAcikKoli((s) => ({ ...s, [id]: true }));
    setSeciliKoliId(id);
    setAktifPaletId(paletId);
    show({ kind: "ok", text: atil ? "Atıl koli eklendi" : "Yeni koli eklendi" });
    return id;
  };

  const koliSil = (paletId: string, koliId: string) => {
    paletGuncelle(paletId, (p) => ({ ...p, koliler: p.koliler.filter((k) => k.id !== koliId) }));
    show({ kind: "warn", text: "Koli silindi" });
  };

  const urunAdet = (koliId: string, uid: string, delta: number) =>
    setPaletler((prev) =>
      prev.map((p) => ({
        ...p,
        koliler: p.koliler.map((k) =>
          k.id !== koliId
            ? k
            : { ...k, urunler: k.urunler.map((u) => (u.uid === uid ? { ...u, qty: u.qty + delta } : u)).filter((u) => u.qty > 0) }
        ),
      }))
    );

  const bekletToggle = (koliId?: string) => {
    if (!koliId) return show({ kind: "info", text: "Önce bir koli seçin" });
    setPaletler((prev) => prev.map((p) => ({ ...p, koliler: p.koliler.map((k) => (k.id === koliId ? { ...k, beklemede: !k.beklemede } : k)) })));
  };

  const barkodOkut = () => {
    const kod = barkod.trim();
    if (!kod) return;
    if (!seciliKoli) return show({ kind: "info", text: "Önce bir koli seçin" });
    setPaletler((prev) =>
      prev.map((p) => ({
        ...p,
        koliler: p.koliler.map((k) =>
          k.id !== seciliKoliId
            ? k
            : { ...k, urunler: [...k.urunler, { uid: yeniId(), code: kod, name: "Fotokopi Kağıdı A4 80Gr", qty: 1, unit: "PK", desi: 1.19, kg: 2.55 }] }
        ),
      }))
    );
    setBarkod("");
    show({ kind: "ok", text: `${kod} · koliye eklendi` });
  };

  const koliNoSec = (no: number) => {
    const k = aktifPalet?.koliler.find((x) => x.no === no);
    if (k) {
      setSeciliKoliId(k.id);
      setAcikKoli((s) => ({ ...s, [k.id]: true }));
    } else show({ kind: "info", text: `Koli ${no} yok` });
  };

  const hepsiKatla = (ac: boolean) => {
    const kMap: Record<string, boolean> = {};
    const pMap: Record<string, boolean> = {};
    paletler.forEach((p) => {
      pMap[p.id] = ac;
      p.koliler.forEach((k) => (kMap[k.id] = ac));
    });
    setAcikPalet(pMap);
    setAcikKoli(kMap);
  };

  const bitir = () => {
    setBitti(true);
    show({ kind: "done", text: `${genelKoli} koli · ${genelPaletSayisi} palet paketlendi` });
  };

  // --- TAŞIMA: ürün → başka koli (kısmi miktar destekli) ---------------------
  const urunTasi = (kaynak: { koliId: string; uid: string }, hedefKoli: string, adet: number, yeniPaletId?: string) => {
    setPaletler((prev) => {
      let tasinan: Urun | null = null;
      let next = prev.map((p) => ({
        ...p,
        koliler: p.koliler.map((k) => {
          if (k.id !== kaynak.koliId) return k;
          const u = k.urunler.find((x) => x.uid === kaynak.uid);
          if (u) tasinan = { ...u };
          return { ...k, urunler: k.urunler.map((x) => (x.uid === kaynak.uid ? { ...x, qty: x.qty - adet } : x)).filter((x) => x.qty > 0) };
        }),
      }));
      if (!tasinan) return prev;
      const eklenecek: Urun = { ...(tasinan as Urun), uid: yeniId(), qty: adet };
      if (hedefKoli === "__new__" && yeniPaletId) {
        next = next.map((p) =>
          p.id !== yeniPaletId
            ? p
            : {
                ...p,
                koliler: [
                  ...p.koliler,
                  {
                    id: `KOLI-${yeniId()}`,
                    no: (p.koliler.reduce((m, k) => Math.max(m, k.no), 0) || 0) + 1,
                    tip: "Yeni Koli",
                    renk: RENK_SIRA[p.koliler.length % RENK_SIRA.length],
                    urunler: [eklenecek],
                  },
                ],
              }
        );
      } else {
        // Hedefte AYNI ürün olsa bile YENİ satır olarak eklenir (duplike desteklenir).
        next = next.map((p) => ({ ...p, koliler: p.koliler.map((k) => (k.id === hedefKoli ? { ...k, urunler: [...k.urunler, eklenecek] } : k)) }));
      }
      return next;
    });
  };

  // --- TAŞIMA: koli → başka palet -------------------------------------------
  const koliTasi = (kaynak: { paletId: string; koliId: string }, hedefPalet: string) => {
    const yeni = hedefPalet === "__new__";
    const yeniPid = yeni ? `PLT-${yeniId()}` : hedefPalet;
    setPaletler((prev) => {
      let tasinan: Koli | null = null;
      let next = prev.map((p) => {
        if (p.id !== kaynak.paletId) return p;
        const k = p.koliler.find((x) => x.id === kaynak.koliId);
        if (k) tasinan = { ...k };
        return { ...p, koliler: p.koliler.filter((x) => x.id !== kaynak.koliId) };
      });
      if (!tasinan) return prev;
      if (yeni) {
        next = [...next, { id: yeniPid, ad: `Palet ${next.length + 1}`, koliler: [{ ...(tasinan as Koli), no: 1 }] }];
      } else {
        next = next.map((p) =>
          p.id !== hedefPalet ? p : { ...p, koliler: [...p.koliler, { ...(tasinan as Koli), no: (p.koliler.reduce((m, k) => Math.max(m, k.no), 0) || 0) + 1 }] }
        );
      }
      return next;
    });
    if (yeni) {
      setAcikPalet((s) => ({ ...s, [yeniPid]: true }));
      setAktifPaletId(yeniPid);
    }
  };

  // --- Taşı diyaloğunu aç ----------------------------------------------------
  const tasiAc = (hedef: TasiHedef) => {
    setTasi(hedef);
    if (hedef.kind === "urun") {
      const src = paletler.flatMap((p) => p.koliler).find((k) => k.id === hedef.koliId);
      const u = src?.urunler.find((x) => x.uid === hedef.uid);
      setTasiAdet(u?.qty ?? 1);
      setHedefPaletId(hedef.paletId);
      const digerKoli = paletler.find((p) => p.id === hedef.paletId)?.koliler.find((k) => k.id !== hedef.koliId);
      setHedefKoliId(digerKoli?.id ?? "__new__");
    } else {
      const digerPalet = paletler.find((p) => p.id !== hedef.paletId);
      setHedefPaletId(digerPalet?.id ?? "__new__");
    }
  };

  const tasiOnayla = () => {
    if (!tasi) return;
    if (tasi.kind === "urun") {
      const src = paletler.flatMap((p) => p.koliler).find((k) => k.id === tasi.koliId);
      const u = src?.urunler.find((x) => x.uid === tasi.uid);
      const max = u?.qty ?? 0;
      const adet = Math.max(1, Math.min(tasiAdet, max));
      urunTasi({ koliId: tasi.koliId, uid: tasi.uid }, hedefKoliId, adet, hedefKoliId === "__new__" ? hedefPaletId : undefined);
      show({ kind: "ok", text: `${adet} ${u?.unit ?? ""} taşındı` });
    } else {
      koliTasi({ paletId: tasi.paletId, koliId: tasi.koliId }, hedefPaletId);
      show({ kind: "ok", text: "Koli taşındı" });
    }
    setTasi(null);
  };

  // --- Sürükle-bırak: ürün → koli (tam miktar) ------------------------------
  const koliyeBirak = (koliId: string) => {
    setDropHedef(null);
    if (!suruklenen || suruklenen.kind !== "urun" || suruklenen.koliId === koliId) return;
    const src = paletler.flatMap((p) => p.koliler).find((k) => k.id === suruklenen!.koliId);
    const u = src?.urunler.find((x) => x.uid === (suruklenen as { uid: string }).uid);
    urunTasi({ koliId: suruklenen.koliId, uid: suruklenen.uid }, koliId, u?.qty ?? 1);
    show({ kind: "ok", text: "Ürün taşındı" });
    suruklenen = null;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Paketleme"
        subtitle="Palet › Koli › Ürün · sürükle-bırak veya Taşı ile düzenle"
        backTo="/home"
      />

      {bitti && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-emerald-400 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10 sm:flex-row sm:items-center">
          <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="flex-1 text-sm font-bold text-emerald-800 dark:text-emerald-200">
            Paketleme tamamlandı — {genelKoli} koli, {genelPaletSayisi} palet, {fmt(genelKg)} kg.
          </p>
          <button type="button" onClick={() => setBitti(false)} className="btn-ghost btn-sm">
            Devam et
          </button>
        </div>
      )}

      {/* Sevkiyat + barkod + aksiyonlar */}
      <div className="card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-extrabold text-fg">
              <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">SO-847786</span>
              KOTON MAĞAZACILIK
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              Semerciler Mah. Çark Cad. No:51 · Adapazarı / Sakarya
            </p>
          </div>

          <div className="flex items-center gap-2 xl:w-[380px]">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
              <input
                value={barkod}
                onChange={(e) => setBarkod(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && barkodOkut()}
                placeholder="Ürün / koli barkodu okut"
                className="field-input pl-12 font-mono text-sm"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              onClick={() => show({ kind: "info", text: "Kamera (tasarım)" })}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-muted transition hover:bg-elevated"
              aria-label="Kamera ile okut"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <ToolbarBtn icon={Layers} label="Palet Kullan" onClick={yeniPalet} />
          <ToolbarBtn icon={Container} label="Atıl Koli" onClick={() => yeniKoli(aktifPaletId, true)} />
          <ToolbarBtn icon={Box} label="Paket Seç" onClick={() => show({ kind: "info", text: "Paket seçimi (tasarım)" })} />
          <ToolbarBtn icon={Pause} label="Beklet" onClick={() => bekletToggle(seciliKoliId)} />
          <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] font-bold text-subtle">Koli No</span>
            {[1, 2, 3, 4, 5, 0].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => koliNoSec(n)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-sm font-bold text-muted transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <button type="button" onClick={bitir} className="btn-primary h-10 px-5">
              <Truck className="h-4 w-4" /> Bitir
            </button>
          </div>
        </div>
      </div>

      {/* Paketlenecek kalemler */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {kalemler.map((k) => {
          const bittiK = k.paketlenen >= k.siparis;
          return (
            <div key={k.code} className={`w-60 shrink-0 rounded-xl border p-3 ${bittiK ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-line bg-surface"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-xs font-bold text-fg">{k.name}</p>
                {bittiK && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
              </div>
              <div className="mt-2 flex items-baseline justify-between font-mono">
                <span className="text-sm font-black text-fg">
                  {k.paketlenen}
                  <span className="text-subtle"> / {k.siparis}</span>
                </span>
                <span className="text-[11px] font-bold text-subtle">{k.unit}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div className={`h-full rounded-full ${bittiK ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${(k.paketlenen / k.siparis) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Ana alan */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* SOL: Paket Yapısı */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Layers className="h-4 w-4 text-subtle" /> Paket Yapısı
              <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold text-subtle">{genelPaletSayisi} palet · {genelKoli} koli</span>
            </h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => hepsiKatla(false)} className="rounded-lg p-1.5 text-subtle transition hover:bg-elevated" title="Hepsini kapat">
                <ChevronsDownUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => hepsiKatla(true)} className="rounded-lg p-1.5 text-subtle transition hover:bg-elevated" title="Hepsini aç">
                <ChevronsUpDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={yeniPalet} className="btn-ghost btn-sm ml-1 text-brand-600">
                <PackagePlus className="h-4 w-4" /> Palet
              </button>
            </div>
          </div>

          <div className="border-b border-line p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="Koli / ürün / kod ara…"
                className="h-10 w-full rounded-xl border border-line bg-elevated/40 pl-10 pr-3 text-sm text-fg outline-none transition placeholder:text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          <div className="max-h-[560px] flex-1 overflow-y-auto p-2">
            {paletler.map((p) => {
              const pAcik = acikPalet[p.id] ?? true;
              const gorunen = p.koliler.filter(koliEsles);
              if (q && gorunen.length === 0) return null;
              const pDesi = p.koliler.reduce((s, k) => s + koliDesi(k), 0);
              const pKg = p.koliler.reduce((s, k) => s + koliKg(k), 0);
              const paletDrop = dropHedef === p.id;
              return (
                <div key={p.id} className="mb-1">
                  <div
                    onClick={() => setAktifPaletId(p.id)}
                    onDragOver={(e) => {
                      if (suruklenen?.kind === "koli") {
                        e.preventDefault();
                        setDropHedef(p.id);
                      }
                    }}
                    onDragLeave={() => paletDrop && setDropHedef(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropHedef(null);
                      if (suruklenen?.kind === "koli" && suruklenen.paletId !== p.id) {
                        koliTasi({ paletId: suruklenen.paletId, koliId: suruklenen.koliId }, p.id);
                        show({ kind: "ok", text: "Koli taşındı" });
                        suruklenen = null;
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2.5 transition ${
                      paletDrop ? "bg-brand-50 ring-2 ring-brand-400 dark:bg-brand-500/10" : aktifPaletId === p.id ? "bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-500/10" : "hover:bg-elevated"
                    }`}
                  >
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAcikPalet((s) => ({ ...s, [p.id]: !pAcik })); }} className="shrink-0 text-subtle">
                      {pAcik ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      <Layers className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold text-fg">{p.ad}</span>
                      <span className="block text-[11px] text-subtle">{p.koliler.length} koli</span>
                    </span>
                    <span className="text-right font-mono text-[11px]">
                      <span className="block font-bold text-fg">{fmt(pDesi)} ds</span>
                      <span className="block text-subtle">{fmt(pKg)} kg</span>
                    </span>
                  </div>

                  {pAcik && (
                    <div className="ml-3 space-y-1 border-l border-line pl-3">
                      {gorunen.length === 0 && <p className="px-2 py-3 text-center text-xs text-subtle">Bu palette koli yok</p>}
                      {gorunen.map((k) => {
                        const kAcik = acikKoli[k.id] ?? false;
                        const secili = seciliKoliId === k.id;
                        const renk = RENKLER[k.renk];
                        const koliDrop = dropHedef === k.id;
                        return (
                          <div key={k.id}>
                            <div
                              draggable
                              onDragStart={(e) => { e.stopPropagation(); suruklenen = { kind: "koli", paletId: p.id, koliId: k.id }; }}
                              onDragOver={(e) => { if (suruklenen?.kind === "urun") { e.preventDefault(); setDropHedef(k.id); } }}
                              onDragLeave={() => koliDrop && setDropHedef(null)}
                              onDrop={(e) => { e.preventDefault(); koliyeBirak(k.id); }}
                              onClick={() => { setSeciliKoliId(k.id); setAktifPaletId(p.id); }}
                              className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-2 transition ${
                                koliDrop ? "bg-emerald-50 ring-2 ring-emerald-400 dark:bg-emerald-500/10" : secili ? "bg-brand-50 ring-1 ring-brand-300 dark:bg-brand-500/10" : "hover:bg-elevated"
                              }`}
                            >
                              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle/60" />
                              <button type="button" onClick={(e) => { e.stopPropagation(); setAcikKoli((s) => ({ ...s, [k.id]: !kAcik })); }} className="shrink-0 text-subtle">
                                {kAcik ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${renk.bg} ${renk.text}`}>
                                <Box className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-bold text-fg">Koli {k.no}</span>
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${renk.bg} ${renk.text}`}>{k.urunler.length} kalem</span>
                                  {k.atil && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-600/40 dark:text-slate-300">atıl</span>}
                                  {k.beklemede && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/30 dark:text-amber-200">beklemede</span>}
                                </span>
                                <span className="block truncate text-[11px] text-subtle">{k.tip}</span>
                              </span>
                              <span className="text-right font-mono text-[11px]">
                                <span className="block font-bold text-fg">{fmt(koliDesi(k))} ds</span>
                                <span className="block text-subtle">{fmt(koliKg(k))} kg</span>
                              </span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); tasiAc({ kind: "koli", paletId: p.id, koliId: k.id }); }} className="shrink-0 rounded-lg p-1 text-subtle transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10" title="Koliyi taşı">
                                <Move className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); koliSil(p.id, k.id); }} className="shrink-0 rounded-lg p-1 text-subtle transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" title="Koliyi sil">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            {kAcik && (
                              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-line pl-3">
                                {k.urunler.length === 0 && <p className="px-2 py-2 text-[11px] text-subtle">Ürün yok — buraya sürükleyin ya da barkod okutun</p>}
                                {k.urunler.map((u) => (
                                  <div
                                    key={u.uid}
                                    draggable
                                    onDragStart={(e) => { e.stopPropagation(); suruklenen = { kind: "urun", paletId: p.id, koliId: k.id, uid: u.uid }; }}
                                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-elevated"
                                  >
                                    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-subtle/50" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-semibold text-fg">{u.name}</span>
                                      <span className="block font-mono text-[10px] text-subtle">{u.code}</span>
                                    </span>
                                    <span className="w-14 text-right font-mono text-xs font-bold text-fg">
                                      {u.qty} <span className="text-[10px] font-semibold text-subtle">{u.unit}</span>
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <StepBtn icon={Minus} tone="down" onClick={() => urunAdet(k.id, u.uid, -1)} />
                                      <StepBtn icon={Plus} tone="up" onClick={() => urunAdet(k.id, u.uid, +1)} />
                                      <button type="button" onClick={() => tasiAc({ kind: "urun", paletId: p.id, koliId: k.id, uid: u.uid })} className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-300 text-brand-600 transition hover:bg-brand-50 dark:hover:bg-brand-500/10" title="Ürünü taşı (kısmi)">
                                        <Move className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button type="button" onClick={() => yeniKoli(p.id)} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-xs font-semibold text-subtle transition hover:border-brand-400 hover:text-brand-600">
                        <Plus className="h-4 w-4" /> Bu palete koli ekle
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* SAĞ: Palet Görseli */}
        <div className="flex flex-col rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Container className="h-4 w-4 text-subtle" /> Palet Görseli
            </h2>
            <span className="font-mono text-[11px] font-semibold text-subtle">{fmt(genelDesi)} ds · {fmt(genelKg)} kg</span>
          </div>

          {paletler.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto border-b border-line p-2">
              {paletler.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAktifPaletId(p.id)}
                  onDragOver={(e) => suruklenen?.kind === "koli" && e.preventDefault()}
                  onDrop={() => {
                    if (suruklenen?.kind === "koli" && suruklenen.paletId !== p.id) {
                      koliTasi({ paletId: suruklenen.paletId, koliId: suruklenen.koliId }, p.id);
                      show({ kind: "ok", text: "Koli taşındı" });
                      suruklenen = null;
                    }
                  }}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${aktifPaletId === p.id ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" : "bg-elevated text-subtle hover:text-fg"}`}
                >
                  {p.ad}
                </button>
              ))}
            </div>
          )}

          <div className="p-5">
            <div className="rounded-2xl border-2 border-dashed border-line bg-elevated/40 p-3">
              <div className="flex flex-wrap content-start items-end gap-2 overflow-y-auto" style={{ minHeight: 200, maxHeight: 320 }}>
                {aktifPalet?.koliler.length === 0 && (
                  <div className="flex w-full flex-col items-center justify-center gap-2 py-10 text-subtle">
                    <Package className="h-8 w-8" />
                    <p className="text-xs">Bu palette koli yok</p>
                    <button type="button" onClick={() => yeniKoli(aktifPaletId)} className="btn-ghost btn-sm text-brand-600">
                      <Plus className="h-4 w-4" /> Koli ekle
                    </button>
                  </div>
                )}
                {aktifPalet?.koliler.map((k) => {
                  const renk = RENKLER[k.renk];
                  const secili = seciliKoliId === k.id;
                  const d = koliDesi(k);
                  const boyut = Math.max(88, Math.min(172, 74 + d * 10));
                  const koliDrop = dropHedef === "vis-" + k.id;
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setSeciliKoliId(k.id)}
                      onDragOver={(e) => { if (suruklenen?.kind === "urun") { e.preventDefault(); setDropHedef("vis-" + k.id); } }}
                      onDragLeave={() => koliDrop && setDropHedef(null)}
                      onDrop={(e) => { e.preventDefault(); setDropHedef(null); koliyeBirak(k.id); }}
                      style={{ width: boyut, height: boyut }}
                      className={`relative flex flex-col justify-between rounded-xl p-2.5 text-left transition-all ${renk.bg} ${
                        koliDrop ? "ring-2 ring-emerald-500 shadow-lg" : secili ? `ring-2 ${renk.ring} shadow-lg` : `ring-1 ring-black/5 hover:ring-2 ${renk.ring}`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md bg-white/60 text-[11px] font-black ${renk.text} dark:bg-black/20`}>{k.no}</span>
                        {k.beklemede ? <Pause className={`h-4 w-4 ${renk.text}`} /> : <Box className={`h-4 w-4 ${renk.text}`} />}
                      </div>
                      <div>
                        <p className={`font-mono text-xs font-black ${renk.text}`}>{fmt(d)} ds</p>
                        <p className={`font-mono text-[10px] font-semibold ${renk.text} opacity-80`}>{fmt(koliKg(k))} kg</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-1.5">
              <div className="h-3 rounded-b-md bg-gradient-to-b from-amber-700/70 to-amber-800/70" />
              <div className="flex justify-between px-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-3 w-6 rounded-b-md bg-amber-800/70" />
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-wide text-subtle">{aktifPalet?.ad}</p>
            </div>

            {seciliKoli && (
              <div className="mt-4 rounded-xl border border-line bg-elevated/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-bold text-fg">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md ${RENKLER[seciliKoli.renk].bg} ${RENKLER[seciliKoli.renk].text} text-[11px] font-black`}>{seciliKoli.no}</span>
                    Koli {seciliKoli.no}
                  </p>
                  <button type="button" onClick={() => bekletToggle(seciliKoli.id)} className="btn-ghost btn-sm">
                    <Pause className="h-3.5 w-3.5" /> {seciliKoli.beklemede ? "Devam" : "Beklet"}
                  </button>
                </div>
                <p className="mt-0.5 text-[11px] text-subtle">{seciliKoli.tip}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-xs">
                  <span className="flex items-center gap-1 text-fg"><Box className="h-3.5 w-3.5 text-subtle" /> {koliAdet(seciliKoli)} adet</span>
                  <span className="text-fg">{fmt(koliDesi(seciliKoli))} ds</span>
                  <span className="flex items-center gap-1 text-fg"><Weight className="h-3.5 w-3.5 text-subtle" /> {fmt(koliKg(seciliKoli))} kg</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Taşı diyaloğu */}
      {tasi && (
        <TasiDialog
          tasi={tasi}
          paletler={paletler}
          hedefPaletId={hedefPaletId}
          setHedefPaletId={setHedefPaletId}
          hedefKoliId={hedefKoliId}
          setHedefKoliId={setHedefKoliId}
          tasiAdet={tasiAdet}
          setTasiAdet={setTasiAdet}
          onIptal={() => setTasi(null)}
          onOnayla={tasiOnayla}
        />
      )}

      <ToastView toast={toast} />
    </div>
  );
}

// -----------------------------------------------------------------------------

function TasiDialog({
  tasi,
  paletler,
  hedefPaletId,
  setHedefPaletId,
  hedefKoliId,
  setHedefKoliId,
  tasiAdet,
  setTasiAdet,
  onIptal,
  onOnayla,
}: {
  tasi: TasiHedef;
  paletler: Palet[];
  hedefPaletId: string;
  setHedefPaletId: (v: string) => void;
  hedefKoliId: string;
  setHedefKoliId: (v: string) => void;
  tasiAdet: number;
  setTasiAdet: (v: number) => void;
  onIptal: () => void;
  onOnayla: () => void;
}) {
  const kaynakKoli = paletler.flatMap((p) => p.koliler).find((k) => k.id === tasi.koliId);
  const urun = tasi.kind === "urun" ? kaynakKoli?.urunler.find((u) => u.uid === tasi.uid) : undefined;
  const hedefPalet = paletler.find((p) => p.id === hedefPaletId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onIptal}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-fg">
            <Move className="h-5 w-5 text-brand-600" /> {tasi.kind === "urun" ? "Ürünü Taşı" : "Koliyi Taşı"}
          </h3>
          <button type="button" onClick={onIptal} className="rounded-lg p-1 text-subtle hover:bg-elevated"><X className="h-5 w-5" /></button>
        </div>

        {tasi.kind === "urun" ? (
          <>
            <div className="mb-3 rounded-xl bg-elevated/50 p-3">
              <p className="text-sm font-bold text-fg">{urun?.name}</p>
              <p className="mt-0.5 font-mono text-xs text-subtle">{urun?.code} · Koli {kaynakKoli?.no} · Mevcut {urun?.qty} {urun?.unit}</p>
            </div>

            <label className="mb-3 block">
              <span className="field-label">Miktar</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={urun?.qty ?? 1}
                  value={tasiAdet}
                  onChange={(e) => setTasiAdet(Math.max(1, Math.min(Number(e.target.value) || 1, urun?.qty ?? 1)))}
                  className="field-input flex-1 font-mono"
                />
                <button type="button" onClick={() => setTasiAdet(urun?.qty ?? 1)} className="btn-ghost btn-sm shrink-0">Tümü</button>
              </div>
            </label>

            <label className="mb-3 block">
              <span className="field-label">Hedef palet</span>
              <select value={hedefPaletId} onChange={(e) => setHedefPaletId(e.target.value)} className="field-input">
                {paletler.map((p) => (<option key={p.id} value={p.id}>{p.ad}</option>))}
              </select>
            </label>

            <label className="mb-4 block">
              <span className="field-label">Hedef koli</span>
              <select value={hedefKoliId} onChange={(e) => setHedefKoliId(e.target.value)} className="field-input">
                {hedefPalet?.koliler.filter((k) => k.id !== tasi.koliId).map((k) => (
                  <option key={k.id} value={k.id}>Koli {k.no} · {k.urunler.length} kalem</option>
                ))}
                <option value="__new__">+ Yeni koli oluştur</option>
              </select>
            </label>

            <p className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-elevated/50 py-2 text-xs font-semibold text-subtle">
              Koli {kaynakKoli?.no} <ArrowRight className="h-3.5 w-3.5" /> {hedefKoliId === "__new__" ? "Yeni koli" : `Koli ${hedefPalet?.koliler.find((k) => k.id === hedefKoliId)?.no ?? "?"}`} · {tasiAdet} {urun?.unit}
            </p>
          </>
        ) : (
          <>
            <div className="mb-3 rounded-xl bg-elevated/50 p-3">
              <p className="text-sm font-bold text-fg">Koli {kaynakKoli?.no}</p>
              <p className="mt-0.5 text-xs text-subtle">{kaynakKoli?.tip} · {kaynakKoli?.urunler.length} kalem</p>
            </div>
            <label className="mb-4 block">
              <span className="field-label">Hedef palet</span>
              <select value={hedefPaletId} onChange={(e) => setHedefPaletId(e.target.value)} className="field-input">
                {paletler.filter((p) => p.id !== tasi.paletId).map((p) => (<option key={p.id} value={p.id}>{p.ad}</option>))}
                <option value="__new__">+ Yeni palet oluştur</option>
              </select>
            </label>
          </>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onIptal} className="btn-ghost flex-1 justify-center py-2.5">İptal</button>
          <button type="button" onClick={onOnayla} className="btn-primary flex-1 justify-center py-2.5">Taşı</button>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label, onClick }: { icon: typeof Box; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10">
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function StepBtn({ icon: Icon, tone, onClick }: { icon: typeof Plus; tone: "up" | "down"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-6 w-6 items-center justify-center rounded-md border transition active:scale-90 ${tone === "up" ? "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" : "border-rose-300 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"}`}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
