import { useEffect, useRef, useState } from "react";
import {
  Box,
  Boxes,
  Layers,
  Check,
  Plus,
  Minus,
  Truck,
  Weight,
  Pause,
  Play,
  Trash2,
  GripVertical,
  Flame,
  Droplets,
  Skull,
  Clock,
  GlassWater,
  Ruler,
  PackageCheck,
  Recycle,
  ChevronDown,
  ChevronRight,
  Package,
  Pencil,
  RotateCw,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import { api as wmsApi } from "../../api/client";

// -----------------------------------------------------------------------------
// PAKETLEME — TASARIM AŞAMASI · KART SİSTEMİ
// Üst: kontrol çubuğu · Sol/geniş: PAKETLEME ALANI (gri sahne) · Sağ: ürünler.
// Sahne › Palet › Koli › Ürün (gri alana direkt ürün/koli de konabilir).
// Sağdaki ürünler sahneye sürüklenir; paketlendikçe "kalan" düşer.
// Servis (AKLPAKET) sonra bağlanır.
// -----------------------------------------------------------------------------

type Hazard = "kirilabilir" | "yanici" | "sivi" | "toksik" | "agir" | "bozulur";

interface UrunNode {
  uid: string; tur: "urun"; code: string; name: string; qty: number; unit: string;
  desi: number; kg: number; paketli?: boolean;
}
interface KoliNode {
  uid: string; tur: "koli"; no: number; kod?: string; atil?: boolean; beklemede?: boolean;
  hacim: number; dara?: number; hazards: Hazard[]; cocuklar: Node[];
}
interface PaletNode { uid: string; tur: "palet"; ad: string; cocuklar: Node[]; }
type Node = UrunNode | KoliNode | PaletNode;

interface KaynakUrun { code: string; name: string; unit: string; siparis: number; desi: number; kg: number; paketli?: boolean; }

export interface PackOrder {
  company: string;
  plant: string;
  warehouse: string;
  stockPlace: string;
  worker: string;
  orderType: string;
  orderNum: string;
  whsText: string;
  itemCount: number;
  customer: string;
  delNum: string;
  tblItem?: unknown;
}

const HAZARDS: { id: Hazard; label: string; icon: typeof Flame; cls: string }[] = [
  { id: "kirilabilir", label: "Kırılabilir", icon: GlassWater, cls: "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-950/40 dark:text-yellow-300" },
  { id: "yanici", label: "Yanıcı", icon: Flame, cls: "border-rose-400/60 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300" },
  { id: "sivi", label: "Sıvı", icon: Droplets, cls: "border-blue-400/60 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300" },
  { id: "toksik", label: "Toksik", icon: Skull, cls: "border-purple-400/60 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-950/40 dark:text-purple-300" },
  { id: "agir", label: "Ağır Yük", icon: Layers, cls: "border-indigo-400/60 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300" },
  { id: "bozulur", label: "Bozulur", icon: Clock, cls: "border-green-400/60 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-950/40 dark:text-green-300" },
];


// Koli boyutları — CANIAS resmi verileri (KOL00, KOL01, KOL02, KOL03, KOL04, KOL07)
export interface KoliBoyutTanimi {
  kod: string;
  n: number;
  ad: string;
  ol: string;        // cm: En × Boy × Yükseklik
  en: number;        // cm
  boy: number;       // cm
  yukseklik: number; // cm
  hacim: number;     // desi
  dara: number;      // kg
  barkod?: string;
  ic: string;
  txt: string;
  btn: string;
  ring: string;
}

export const BOYUTLAR: KoliBoyutTanimi[] = [
  {
    kod: "KOL01",
    n: 1,
    ad: "Koli 1",
    ol: "32×28×17",
    en: 32,
    boy: 28,
    yukseklik: 17,
    hacim: 5.08,
    dara: 0.266,
    ring: "ring-emerald-500",
    ic: "text-emerald-500",
    txt: "text-emerald-700 dark:text-emerald-300",
    btn: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  },
  {
    kod: "KOL02",
    n: 2,
    ad: "Koli 2",
    ol: "30×30×33",
    en: 30,
    boy: 30,
    yukseklik: 33,
    hacim: 9.9,
    dara: 0.411,
    ring: "ring-sky-500",
    ic: "text-sky-500",
    txt: "text-sky-700 dark:text-sky-300",
    btn: "border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/10",
  },
  {
    kod: "KOL03",
    n: 3,
    ad: "Koli 3",
    ol: "45×30×34",
    en: 45,
    boy: 30,
    yukseklik: 34,
    hacim: 15.3,
    dara: 0.518,
    barkod: "A00000384",
    ic: "text-amber-500",
    ring: "ring-amber-500",
    txt: "text-amber-700 dark:text-amber-300",
    btn: "border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10",
  },
  {
    kod: "KOL04",
    n: 4,
    ad: "Koli 4",
    ol: "60×35×35",
    en: 60,
    boy: 35,
    yukseklik: 35,
    hacim: 24.5,
    dara: 0.63,
    ic: "text-orange-500",
    ring: "ring-orange-500",
    txt: "text-orange-700 dark:text-orange-300",
    btn: "border-orange-200 bg-orange-50 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10",
  },
  {
    kod: "KOL07",
    n: 5,
    ad: "Koli 5",
    ol: "28×17×17",
    en: 28,
    boy: 17,
    yukseklik: 17,
    hacim: 2.7,
    dara: 0.145,
    ic: "text-rose-500",
    ring: "ring-rose-500",
    txt: "text-rose-700 dark:text-rose-300",
    btn: "border-rose-200 bg-rose-50 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10",
  },
  {
    kod: "KOL00",
    n: 0,
    ad: "Koli 0",
    ol: "24×17×34",
    en: 24,
    boy: 17,
    yukseklik: 34,
    hacim: 4.63,
    dara: 0.23,
    ic: "text-violet-500",
    ring: "ring-violet-500",
    txt: "text-violet-700 dark:text-violet-300",
    btn: "border-violet-200 bg-violet-50 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10",
  },
];

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: false }).format(n);
const boyutBul = (no: number) => BOYUTLAR.find((b) => b.n === no);
const boyutHacim = (no: number) => boyutBul(no)?.hacim ?? 10;
const boyutGenislik = (no: number) => {
  const b = boyutBul(no);
  return b ? Math.round(180 + b.en * 2.8) : 260;
};
const boyutOl = (no: number) => boyutBul(no)?.ol ?? "";
const boyutKodu = (no: number) => boyutBul(no)?.kod ?? `KOL0${no}`;

// --- Desi & Ağırlık Kuralları (Patron Kuralı) --------------------------------
// Desi kuralı: 1'den küçükse 1, 1 ve üzeri ise tam sayı (virgülden sonrası atılır / Math.floor)
const yuvarlaDesi = (d: number): number => {
  if (d <= 0) return 0;
  return Math.max(1, Math.floor(d));
};

const koliDara = (koli: KoliNode): number => {
  if (typeof koli.dara === "number") return koli.dara;
  return boyutBul(koli.no)?.dara ?? 0;
};

// Kolinin kendi standart ebat desisi (değişmez, tam sayı)
const koliKendiDesi = (koli: KoliNode): number => yuvarlaDesi(koli.hacim);

// Koli içine konan ürünler ve iç kolilerin hacim toplamı
const koliIcerikDesi = (koli: KoliNode): number => {
  return koli.cocuklar.reduce((s, c) => {
    if (c.tur === "urun") return s + c.desi * c.qty;
    if (c.tur === "koli") return s + koliKendiDesi(c);
    return s + nodeDesi(c);
  }, 0);
};

// --- Ağaç yardımcıları --------------------------------------------------------
const cocuk = (n: Node): Node[] => (n.tur === "urun" ? [] : n.cocuklar);

// Node desisi:
// - Ürün ise: ürün desisi * adet (yuvarlanmış)
// - Koli ise: kolinin kendi standart desisi
// - Palet ise: içindeki kolilerin ve malzemelerin desilerinin tam toplamı
const nodeDesi = (n: Node): number => {
  if (n.tur === "urun") return yuvarlaDesi(n.desi * n.qty);
  if (n.tur === "koli") return koliKendiDesi(n);
  return cocuk(n).reduce((s, c) => s + nodeDesi(c), 0);
};

// Node kilosu:
// - Ürün ise: ürün kg * adet
// - Koli ise: içindeki her şeyin kg toplamı + koli darası (kayıtlıysa, yoksa 0)
// - Palet ise: içindeki her şeyin toplam kg'si
const nodeKg = (n: Node): number => {
  if (n.tur === "urun") return n.kg * n.qty;
  if (n.tur === "koli") {
    const icKg = cocuk(n).reduce((s, c) => s + nodeKg(c), 0);
    return icKg + koliDara(n);
  }
  return cocuk(n).reduce((s, c) => s + nodeKg(c), 0);
};

const urunSay = (n: Node): number => (n.tur === "urun" ? 1 : cocuk(n).reduce((s, c) => s + urunSay(c), 0));
const koliSay = (ns: Node[]): number => ns.reduce((s, n) => s + (n.tur === "koli" ? 1 : 0) + (n.tur === "urun" ? 0 : koliSay(cocuk(n))), 0);
const paletSay = (ns: Node[]): number => ns.filter((n) => n.tur === "palet").length;

function iceriyorMu(n: Node, uid: string): boolean {
  return cocuk(n).some((c) => c.uid === uid || iceriyorMu(c, uid));
}
function nodeMap(ns: Node[], uid: string, fn: (n: Node) => Node): Node[] {
  return ns.map((n) => (n.uid === uid ? fn(n) : n.tur === "urun" ? n : ({ ...n, cocuklar: nodeMap(n.cocuklar, uid, fn) } as Node)));
}
function nodeRemove(ns: Node[], uid: string): { list: Node[]; alinan: Node | null } {
  let alinan: Node | null = null;
  const list: Node[] = [];
  for (const n of ns) {
    if (n.uid === uid) { alinan = n; continue; }
    if (n.tur === "urun") list.push(n);
    else { const r = nodeRemove(n.cocuklar, uid); if (r.alinan) alinan = r.alinan; list.push({ ...n, cocuklar: r.list } as Node); }
  }
  return { list, alinan };
}
function nodeAdd(ns: Node[], parentUid: string | null, yeni: Node): Node[] {
  if (parentUid === null) return [...ns, yeni];
  return ns.map((n) =>
    n.uid === parentUid && n.tur !== "urun" ? ({ ...n, cocuklar: n.cocuklar.concat(yeni) } as Node)
      : n.tur === "urun" ? n : ({ ...n, cocuklar: nodeAdd(n.cocuklar, parentUid, yeni) } as Node)
  );
}
function nodeFind(ns: Node[], uid: string): Node | null {
  for (const n of ns) { if (n.uid === uid) return n; if (n.tur !== "urun") { const f = nodeFind(n.cocuklar, uid); if (f) return f; } }
  return null;
}
// Ürünü hedef kaba koyar: aynı kapta aynı kod varsa ADEDİNİ artırır (yeni kart açmaz).
function nodeAddUrun(ns: Node[], parentUid: string | null, yeni: UrunNode): Node[] {
  const ekle = (list: Node[]): Node[] => {
    const idx = list.findIndex((c) => c.tur === "urun" && c.code === yeni.code);
    if (idx >= 0) return list.map((c, i) => (i === idx && c.tur === "urun" ? { ...c, qty: c.qty + yeni.qty } : c));
    return [...list, yeni];
  };
  if (parentUid === null) return ekle(ns);
  return ns.map((n) =>
    n.uid === parentUid && n.tur !== "urun" ? ({ ...n, cocuklar: ekle(n.cocuklar) } as Node)
      : n.tur === "urun" ? n : ({ ...n, cocuklar: nodeAddUrun(n.cocuklar, parentUid, yeni) } as Node)
  );
}
function paketlenmis(ns: Node[], code: string): number {
  return ns.reduce((s, n) => s + (n.tur === "urun" ? (n.code === code ? n.qty : 0) : paketlenmis(cocuk(n), code)), 0);
}
function temizle(ns: Node[]): Node[] {
  return ns.filter((n) => n.tur !== "urun" || n.qty > 0).map((n) => (n.tur === "urun" ? n : ({ ...n, cocuklar: temizle(n.cocuklar) } as Node)));
}

// sürükleme durumu (modül seviyesi)
let drag: { kind: "node"; uid: string } | { kind: "kaynak"; code: string } | null = null;

export default function PackagingPage() {
  const { toast, show } = useToast();
  const idRef = useRef(100);
  const yid = () => `x${++idRef.current}`;

  const [sahne, setSahne] = useState<Node[]>([]);
  const [seciliKapId, setSeciliKapId] = useState<string | null>(null);
  const [atilMod, setAtilMod] = useState(false);
  const [dropHedef, setDropHedef] = useState<string | null>(null);
  const [bitti, setBitti] = useState(false);
  const [bekletildi, setBekletildi] = useState(false);

  // CANIAS MZYListingPack Servisi — Paketlenecek Emirler & Ürünler
  const [emirler, setEmirler] = useState<PackOrder[]>([]);
  const [seciliEmir, setSeciliEmir] = useState<PackOrder | null>(null);
  const [urunler, setUrunler] = useState<KaynakUrun[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaynakTuru, setKaynakTuru] = useState<"canias" | "varsayilan">("canias");

  const emirSec = async (emir: PackOrder) => {
    setSeciliEmir(emir);
    setSahne([]);
    setSeciliKapId(null);
    setYukleniyor(true);
    try {
      // CANIAS MZYGetStock ile bu siparişin stok yerindeki (Örn: SO-847786) GERÇEK malzemelerini çek
      const sp = emir.stockPlace || `SO-${emir.orderNum}`;
      const stocks = await wmsApi.queryStock({
        warehouse: "10",
        stockPlace: sp,
        container: true,
        onlyPickWarehouse: false,
      });

      if (stocks && stocks.length > 0) {
        const caniasUrunler: KaynakUrun[] = stocks.map((s) => ({
          code: s.material,
          name: s.name || s.material,
          unit: s.unit || "AD",
          siparis: s.availStock || 1,
          desi: 0.2,
          kg: 0.5,
        }));
        setUrunler(caniasUrunler);
        setKaynakTuru("canias");
        show({ kind: "ok", text: `${emir.orderType}-${emir.orderNum} için ${caniasUrunler.length} kalem malzeme CANIAS'tan yüklendi` });
      } else {
        setUrunler([]);
        setKaynakTuru("canias");
        show({ kind: "info", text: `${emir.orderType}-${emir.orderNum} stok yerinde açık malzeme bulunamadı` });
      }
    } catch (err) {
      console.warn("queryStock hatası:", err);
      setUrunler([]);
    } finally {
      setYukleniyor(false);
    }
  };

  const listeGetir = async () => {
    setYukleniyor(true);
    try {
      // CANIAS Depo 10 üzerinden paketlenecek açık emirleri çek
      const rows = await wmsApi.getPackagingList({ warehouse: "10" });
      if (rows && rows.length > 0) {
        const yeniEmirler: PackOrder[] = rows.map((r) => ({
          company: String(r.COMPANY || "01"),
          plant: String(r.PLANT || "100"),
          warehouse: String(r.WAREHOUSE || "10"),
          stockPlace: String(r.STOCKPLACE || ""),
          worker: String(r.WORKER || ""),
          orderType: String(r.ORDERTYPE || "SO"),
          orderNum: String(r.ORDERNUM || ""),
          whsText: String(r.WHSTEXT || ""),
          itemCount: Number(r.ITEMCOUNT) || 1,
          customer: String(r.CUSNAME1 || "Müşteri"),
          delNum: String(r.DELNUM || ""),
          tblItem: r.TBLITEM,
        }));
        setEmirler(yeniEmirler);
        // Otomatik sipariş seçilmez, kullanıcı kendisi seçer (F5 temiz gelir)
        setSeciliEmir(null);
        setUrunler([]);
        setKaynakTuru("canias");
      } else {
        setEmirler([]);
        setSeciliEmir(null);
        setUrunler([]);
      }
    } catch (err) {
      console.warn("MZYListingPack hatası:", err);
      setEmirler([]);
      setSeciliEmir(null);
      setUrunler([]);
    } finally {
      setYukleniyor(false);
    }
  };

  useEffect(() => {
    listeGetir();
  }, []);

  // Sürükle-bırak sırasında kenara yaklaşınca otomatik kaydırma (tablet + fare).
  // İmleç hangi kaydırılabilir alanın (sayfa, paketleme alanı, ürün listesi, koli)
  // üst/alt kenarına yaklaşırsa o alanı yumuşakça kaydırır.
  useEffect(() => {
    const KENAR = 70; // kenardan bu kadar px kala tetiklenir
    const MAKS = 18; // kare başına maksimum kayma (px)
    let hiz = 0;
    let hedef: HTMLElement | Window | null = null;
    let raf = 0;

    const kaydirilabilir = (el: Element | null): HTMLElement | null => {
      let n = el as HTMLElement | null;
      while (n && n !== document.body && n !== document.documentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) return n;
        n = n.parentElement;
      }
      return null;
    };

    const dongu = () => {
      if (hiz !== 0 && hedef) {
        if (hedef instanceof Window) hedef.scrollBy(0, hiz);
        else hedef.scrollTop += hiz;
      }
      raf = requestAnimationFrame(dongu);
    };

    const uzerinde = (e: DragEvent) => {
      if (!drag) { hiz = 0; return; }
      const y = e.clientY;
      const cont = kaydirilabilir(document.elementFromPoint(e.clientX, y));
      if (cont) {
        const r = cont.getBoundingClientRect();
        if (y < r.top + KENAR) { hedef = cont; hiz = -Math.ceil(MAKS * (1 - Math.max(0, y - r.top) / KENAR)); }
        else if (y > r.bottom - KENAR) { hedef = cont; hiz = Math.ceil(MAKS * (1 - Math.max(0, r.bottom - y) / KENAR)); }
        else hiz = 0;
      } else {
        const h = window.innerHeight;
        if (y < KENAR) { hedef = window; hiz = -Math.ceil(MAKS * (1 - y / KENAR)); }
        else if (y > h - KENAR) { hedef = window; hiz = Math.ceil(MAKS * (1 - (h - y) / KENAR)); }
        else hiz = 0;
      }
    };
    const dur = () => { hiz = 0; hedef = null; };

    window.addEventListener("dragover", uzerinde);
    window.addEventListener("drop", dur);
    window.addEventListener("dragend", dur);
    raf = requestAnimationFrame(dongu);
    return () => {
      window.removeEventListener("dragover", uzerinde);
      window.removeEventListener("drop", dur);
      window.removeEventListener("dragend", dur);
      cancelAnimationFrame(raf);
    };
  }, []);

  const genelDesi = sahne.reduce((s, n) => s + nodeDesi(n), 0);
  const genelKg = sahne.reduce((s, n) => s + nodeKg(n), 0);
  const kSay = koliSay(sahne);
  const pSay = paletSay(sahne);

  const map = (uid: string, fn: (n: Node) => Node) => setSahne((prev) => nodeMap(prev, uid, fn));

  const paletEkle = () => {
    const uid = `plt-${yid()}`;
    setSahne((prev) => [...prev, { uid, tur: "palet", ad: `Palet ${prev.filter((n) => n.tur === "palet").length + 1}`, cocuklar: [] }]);
    setSeciliKapId(uid);
    show({ kind: "ok", text: "Palet eklendi" });
  };

  const koliEkle = (no: number) => {
    const uid = yid();
    const b = boyutBul(no);
    const yeni: KoliNode = {
      uid,
      tur: "koli",
      no,
      kod: b?.kod,
      hacim: b?.hacim ?? boyutHacim(no),
      dara: b?.dara ?? 0,
      hazards: [],
      atil: atilMod,
      cocuklar: []
    };
    const hedef = seciliKapId ? nodeFind(sahne, seciliKapId) : null;
    const parent = hedef && hedef.tur !== "urun" ? seciliKapId : null;
    setSahne((prev) => nodeAdd(prev, parent, yeni));
    setSeciliKapId(uid);
    show({ kind: "ok", text: `${atilMod ? "Atıl koli" : "Koli"} · ${b?.kod || `Boyut ${no}`} (${b?.ol || ""} cm · ${yuvarlaDesi(b?.hacim ?? boyutHacim(no))} DS)` });
  };

  const sil = (uid: string) => { setSahne((prev) => nodeRemove(prev, uid).list); show({ kind: "warn", text: "Kart silindi" }); };

  const urunAdet = (uid: string, delta: number) =>
    setSahne((prev) => temizle(nodeMap(prev, uid, (n) => (n.tur === "urun" ? { ...n, qty: Math.max(0, n.qty + delta) } : n))));

  const hacim = (uid: string, v: number) => map(uid, (n) => (n.tur === "koli" ? { ...n, hacim: Math.max(0, v) } : n));
  const hazardToggle = (uid: string, h: Hazard) => map(uid, (n) => (n.tur === "koli" ? { ...n, hazards: n.hazards.includes(h) ? n.hazards.filter((x) => x !== h) : n.hazards.concat(h) } : n));
  const beklet = (uid: string) => map(uid, (n) => (n.tur === "koli" ? { ...n, beklemede: !n.beklemede } : n));

  const kaynakEkle = (code: string, parentUid: string | null) => {
    const k = urunler.find((x) => x.code === code);
    if (!k) return;
    if (k.siparis - paketlenmis(sahne, code) <= 0) return show({ kind: "info", text: "Bu üründen kalmadı" });
    const yeni: UrunNode = { uid: yid(), tur: "urun", code: k.code, name: k.name, qty: 1, unit: k.unit, desi: k.desi, kg: k.kg, paketli: k.paketli };
    let parent = parentUid;
    if (parent) { const p = nodeFind(sahne, parent); if (!p || p.tur === "urun") parent = null; }
    setSahne((prev) => nodeAddUrun(prev, parent, yeni));
    show({ kind: "ok", text: `${k.name} +1` });
  };

  const tasi = (uid: string, parentUid: string | null) => {
    const src = nodeFind(sahne, uid);
    if (!src) return;
    if (parentUid) {
      if (uid === parentUid) return;
      const p = nodeFind(sahne, parentUid);
      if (!p || p.tur === "urun") return;
      if (src.tur !== "urun" && iceriyorMu(src, parentUid)) return;
    }
    setSahne((prev) => {
      const r = nodeRemove(prev, uid);
      if (!r.alinan) return prev;
      return nodeAdd(r.list, parentUid, r.alinan);
    });
  };

  const birak = (parentUid: string | null) => {
    setDropHedef(null);
    if (!drag) return;
    if (drag.kind === "kaynak") kaynakEkle(drag.code, parentUid);
    else { tasi(drag.uid, parentUid); show({ kind: "ok", text: "Taşındı" }); }
    drag = null;
  };

  const bitir = () => {
    let bos = false;
    const kontrol = (ns: Node[]) => ns.forEach((n) => { if (n.tur === "koli") { if (urunSay(n) === 0) bos = true; kontrol(n.cocuklar); } else if (n.tur === "palet") kontrol(n.cocuklar); });
    kontrol(sahne);
    if (bos) return show({ kind: "warn", text: "Boş koli var — kaydedilemez" });
    if (kSay === 0) return show({ kind: "info", text: "Paketlenecek koli yok" });
    setBitti(true);
    show({ kind: "done", text: `${kSay} koli · ${pSay} palet paketlendi` });
  };

  const paketlemeyiBeklet = () => {
    setBekletildi((v) => {
      const yeni = !v;
      show({
        kind: yeni ? "info" : "ok",
        text: yeni ? "Paketleme işlemi beklemeye alındı" : "Paketleme işlemine devam ediliyor",
      });
      return yeni;
    });
  };

  function koliIcineKoli(parentUid: string) {
    const uid = yid();
    const b = boyutBul(1);
    const yeni: KoliNode = { uid, tur: "koli", no: 1, kod: b?.kod, hacim: b?.hacim ?? boyutHacim(1), dara: b?.dara ?? 0, hazards: [], cocuklar: [] };
    setSahne((prev) => nodeAdd(prev, parentUid, yeni));
    setSeciliKapId(uid);
    show({ kind: "ok", text: "Koli içine koli eklendi" });
  }

  const api: Api = { seciliKapId, setSeciliKapId, sil, urunAdet, hacim, hazardToggle, beklet, koliIcineEkle: koliIcineKoli, dropHedef, setDropHedef, birak };

  return (
    <div className="w-full px-1.5 py-3 lg:py-4">
      <PageHeader title="Paketleme" subtitle="Paketleme alanı › Palet › Koli › Ürün" backTo="/home" />

      {bitti && (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-2xl border border-emerald-400 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10 sm:flex-row sm:items-center">
          <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="flex-1 text-sm font-bold text-emerald-800 dark:text-emerald-200">Paketleme tamamlandı — {kSay} koli, {pSay} palet, {fmt(genelKg)} kg.</p>
          <button type="button" onClick={() => setBitti(false)} className="btn-ghost btn-sm">Devam et</button>
        </div>
      )}

      {/* ÜST ARAÇ ÇUBUĞU — tek satır */}
      <div className="card mt-3 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:flex-nowrap">
          {/* Sevkiyat Seçimi / CANIAS Paketleme Emri */}
          <div className="flex min-w-0 items-center gap-1.5">
            <select
              value={seciliEmir?.orderNum || ""}
              onChange={(e) => {
                const found = emirler.find((x) => x.orderNum === e.target.value);
                if (found) {
                  emirSec(found);
                } else {
                  setSeciliEmir(null);
                  setUrunler([]);
                  setSahne([]);
                  setSeciliKapId(null);
                }
              }}
              className="max-w-[280px] truncate rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-fg focus:outline-none focus:ring-1 focus:ring-brand-500"
              title="Paketlenecek Sipariş Seçin"
            >
              <option value="">
                {yukleniyor
                  ? "Emirler yükleniyor"
                  : emirler.length > 0
                    ? `Paketlenecek Sevkiyatı Seçiniz`
                    : "Açık Paketleme Emri Yok"}
              </option>
              {emirler.map((e) => (
                <option key={e.orderNum} value={e.orderNum}>
                  {e.orderType}-{e.orderNum} · {e.customer.slice(0, 24)}
                </option>
              ))}
            </select>
            {seciliEmir && (
              <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                {seciliEmir.orderType}-{seciliEmir.orderNum}
              </span>
            )}
            {seciliEmir?.delNum && (
              <span className="hidden font-mono text-[10px] text-subtle xl:inline" title="Teslimat Kodu">
                {seciliEmir.delNum}
              </span>
            )}
          </div>

          <span className="hidden h-6 w-px shrink-0 bg-line xl:block" />

          {/* Koli Boyutu — 6 renkli boyut butonu; altında ölçüsü yazılı */}
          <div className="flex shrink-0 items-start gap-1.5">
            <Ruler className="mt-3.5 h-4 w-4 shrink-0 text-subtle" />
            {BOYUTLAR.map((b) => {
              const ik = 14 + (b.n === 0 ? 10 : b.n) * 1.6;
              return (
                <div key={b.n} className="flex flex-col items-center gap-0.5">
                  <button type="button" onClick={() => koliEkle(b.n)} title={`Boyut ${b.n} (${b.kod}) · ${b.ol} cm · ${yuvarlaDesi(b.hacim)} DS · Dara: ${b.dara} kg`} className={`group relative flex h-11 w-11 items-center justify-center rounded-xl border-2 transition active:scale-95 ${atilMod ? "border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-500/40 dark:bg-slate-600/20" : b.btn}`}>
                    <Box strokeWidth={2.25} style={{ width: ik, height: ik }} className={atilMod ? "text-slate-400 dark:text-slate-300" : b.ic} />
                    <span className={`absolute bottom-0.5 right-1 text-[10px] font-black ${atilMod ? "text-slate-500 dark:text-slate-300" : b.txt}`}>{b.n}</span>
                  </button>
                  <span className={`font-mono text-[9px] font-bold leading-none ${atilMod ? "text-slate-500 dark:text-slate-300" : b.txt}`}>{b.ol}</span>
                </div>
              );
            })}
            <button type="button" onClick={() => setAtilMod((v) => !v)} className={`inline-flex h-11 items-center gap-1 rounded-xl border-2 px-2.5 text-[11px] font-bold transition ${atilMod ? "border-slate-400 bg-slate-200 text-slate-700 dark:border-slate-500 dark:bg-slate-600/40 dark:text-slate-200" : "border-line bg-surface text-subtle hover:text-fg"}`} title="Atıl koli"><Recycle className="h-4 w-4" /> Atıl</button>
            <button type="button" onClick={paletEkle} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-brand-300/80 bg-brand-50/80 px-3 text-xs font-bold text-brand-700 transition hover:bg-brand-100 active:scale-95 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300 dark:hover:bg-brand-500/25" title="Yeni Palet Ekle"><Layers className="h-4 w-4" /> Palet Ekle</button>
          </div>

          {/* Aksiyonlar */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={paketlemeyiBeklet}
              className={`inline-flex h-9 w-[130px] items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition active:scale-95 ${bekletildi
                ? "border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200"
                : "border-line bg-surface text-subtle hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                }`}
              title={bekletildi ? "Paketlemeye Devam Et" : "Paketlemeyi Beklet"}
            >
              {bekletildi ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              <span>{bekletildi ? "Devam Ettir" : "Beklet"}</span>
            </button>
            <button type="button" onClick={bitir} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700"><Truck className="h-4 w-4" /> Paketlemeyi Bitir</button>
          </div>
        </div>
      </div>

      {/* İÇERİK: geniş paketleme alanı (sol) + ürün listesi (sağ) */}
      <div className="mt-3 flex flex-col gap-2 xl:flex-row">
        {/* ORTA: PAKETLEME ALANI (gri sahne) */}
        <main className="min-w-0 flex-1">
          <div
            onClick={() => setSeciliKapId(null)}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setDropHedef("sahne"); } }}
            onDragLeave={() => dropHedef === "sahne" && setDropHedef(null)}
            onDrop={(e) => { e.preventDefault(); birak(null); }}
            className={`min-h-[60vh] rounded-2xl border-2 p-3 transition ${dropHedef === "sahne" ? "border-brand-400 bg-brand-100/60 dark:bg-brand-500/10" : seciliKapId === null ? "border-brand-300 bg-slate-100/80 dark:border-brand-500/30 dark:bg-slate-800/40" : "border-slate-300 dark:border-slate-600 bg-slate-100/70 dark:bg-slate-800/40"}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                <Boxes className="h-4 w-4 text-subtle" />
                <span>Paketleme Alanı</span>
                {seciliKapId === null && <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">Hedef</span>}
              </h2>
              <div className="flex items-center gap-2.5 text-xs font-bold text-fg">
                <span className="font-mono text-sm font-extrabold text-fg">Toplam:</span>
                <span><b className="font-mono text-sm font-extrabold text-fg">{pSay}</b> palet</span>
                <span><b className="font-mono text-sm font-extrabold text-fg">{kSay}</b> koli</span>
                <span><b className="font-mono text-sm font-extrabold text-fg">{genelDesi}</b> desi</span>
                <span><b className="font-mono text-sm font-extrabold text-fg">{fmt(genelKg)}</b> kg</span>
              </div>
            </div>

            <div className="max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-0">
                {sahne.length === 0 && (
                  <div className="flex w-full flex-col items-center justify-center gap-2 py-16 text-subtle">
                    <Package className="h-9 w-9 text-subtle/50" />
                    <p className="text-sm font-medium">
                      {seciliEmir
                        ? "Paketleme alanı boş — yukarıdan palet veya koli ekleyip sağdaki ürünleri sürükleyin"
                        : "Paketlemeye başlamak için yukarıdan bir sevkiyat seçin, ardından palet veya koli ekleyin"}
                    </p>
                  </div>
                )}
                {sahne.map((n) => <KartNode key={n.uid} node={n} api={api} parentTur="sahne" />)}
              </div>
            </div>
          </div>
        </main>

        {/* SAĞ: PAKETLENECEK ÜRÜNLER */}
        <aside className="xl:w-80 xl:shrink-0">
          <div className="flex flex-col rounded-2xl border border-line bg-surface shadow-card xl:sticky xl:top-4">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Package className="h-4 w-4 text-subtle" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-fg">Paketlenecek Ürünler</h2>
              </div>
              <div className="flex items-center gap-1">
                <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold text-subtle">{urunler.length}</span>
              </div>
            </div>
            <div className="max-h-[calc(100vh-200px)] space-y-2 overflow-y-auto p-2.5">
              {!seciliEmir ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-subtle">
                  <Package className="h-8 w-8 text-subtle/50" />
                  <p className="text-xs font-semibold text-fg">Sevkiyat Seçilmedi</p>
                  <p className="text-[11px] text-subtle">Paketlenecek ürünleri listelemek için yukarıdan bir sevkiyat seçin.</p>
                </div>
              ) : yukleniyor ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-subtle">
                  <RotateCw className="h-6 w-6 animate-spin text-brand-600" />
                  <p className="text-xs">Malzemeler aranıyor</p>
                </div>
              ) : urunler.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-subtle text-center">
                  <Package className="h-8 w-8 text-subtle/50" />
                  <p className="text-xs font-medium">Bu sevkiyatta açık paketlenecek ürün kalmadı</p>
                </div>
              ) : (
                urunler.map((k) => {
                  const pk = paketlenmis(sahne, k.code);
                  const kalan = Math.max(0, k.siparis - pk);
                  const bittiK = kalan === 0;
                  return (
                    <div
                      key={k.code}
                      draggable={!bittiK}
                      onDragStart={(e) => {
                        e.dataTransfer?.setData("text/plain", k.code);
                        drag = { kind: "kaynak", code: k.code };
                      }}
                      className={`rounded-xl border p-3 transition ${bittiK ? "border-emerald-300 bg-emerald-50/60 opacity-70 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-slate-400 dark:border-slate-400 bg-surface hover:border-brand-400 cursor-grab"}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-fg">{k.name}</p>
                          <p className="font-mono text-[10px] font-bold text-fg">{k.code}{k.paketli && " · paketli"}</p>
                        </div>
                        {bittiK && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-1 text-xs">
                          <span className={`font-mono text-sm font-black ${bittiK ? "text-emerald-600 dark:text-emerald-400" : "text-fg"}`}>{kalan}</span>
                          <span className={`text-[11px] font-bold ${bittiK ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-fg"}`}>kaldı</span>
                          <span className="ml-1 font-mono text-xs font-black text-fg">{k.siparis}</span>
                          <span className="text-[11px] font-bold text-fg">sipariş</span>
                          <span className="text-[10px] font-bold text-fg">{k.unit}</span>
                        </div>
                        <button type="button" disabled={bittiK} onClick={() => kaynakEkle(k.code, seciliKapId)} className="inline-flex items-center gap-1 rounded-lg border border-brand-300 px-2 py-1 text-[11px] font-bold text-brand-600 transition hover:bg-brand-50 disabled:opacity-40 dark:hover:bg-brand-500/10"><Plus className="h-3.5 w-3.5" /> Ekle</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}

// -----------------------------------------------------------------------------
interface Api {
  seciliKapId: string | null;
  setSeciliKapId: (v: string | null) => void;
  sil: (uid: string) => void;
  urunAdet: (uid: string, d: number) => void;
  hacim: (uid: string, v: number) => void;
  hazardToggle: (uid: string, h: Hazard) => void;
  beklet: (uid: string) => void;
  koliIcineEkle: (pid: string) => void;
  dropHedef: string | null;
  setDropHedef: (v: string | null) => void;
  birak: (parentUid: string | null) => void;
}

function KartNode({ node, api, parentTur }: { node: Node; api: Api; parentTur?: "sahne" | "palet" | "koli" }) {
  if (node.tur === "urun") return <UrunKart urun={node} api={api} parentTur={parentTur} />;
  if (node.tur === "palet") return <PaletKart palet={node} api={api} />;
  return <KoliKart koli={node} api={api} parentTur={parentTur} />;
}

// Palet içi akıllı yerleşim algoritması:
// - Palet sağ ve sol olmak üzere 2 ana bölüme ayrılır.
// - Koli: 2 birim genişlik kaplar (kolonun tamamı, yani paletin 1/2'si).
// - Malzeme (kolisiz): 1 birim genişlik kaplar (kolonun yarısı, yani paletin 1/4'ü).
//   Böylece paletin sağında ve solunda ikişer malzeme, toplamda tek satırda 4 malzeme yan yana yerleşir.
// - Malzemeler yerleştirilirken yarım kalan kolonlar önce 2'ye tamamlanır, ardından satırlar dengeli doldurulur.
function paletKolonlaraAyir(cocuklar: Node[]): { solKolon: Node[]; sagKolon: Node[] } {
  const solKolon: Node[] = [];
  const sagKolon: Node[] = [];
  let solBirim = 0;
  let sagBirim = 0;

  for (const item of cocuklar) {
    if (item.tur === "urun") {
      // Eğer bir tarafta tek kalmış (çiftlenmemiş) malzeme varsa, önce orayı 2'ye tamamla
      if (solBirim % 2 !== 0) {
        solKolon.push(item);
        solBirim += 1;
      } else if (sagBirim % 2 !== 0) {
        sagKolon.push(item);
        sagBirim += 1;
      } else if (solBirim <= sagBirim) {
        solKolon.push(item);
        solBirim += 1;
      } else {
        sagKolon.push(item);
        sagBirim += 1;
      }
    } else {
      // Koli tam kolon (2 birim) kaplar; tek kalan yarım satır varsa satır sonuna yuvarlanır
      const solDolu = solBirim % 2 !== 0 ? solBirim + 1 : solBirim;
      const sagDolu = sagBirim % 2 !== 0 ? sagBirim + 1 : sagBirim;

      if (solDolu <= sagDolu) {
        solKolon.push(item);
        solBirim = solDolu + 2;
      } else {
        sagKolon.push(item);
        sagBirim = sagDolu + 2;
      }
    }
  }

  return { solKolon, sagKolon };
}

function PaletKart({ palet, api }: { palet: PaletNode; api: Api }) {
  const [acik, setAcik] = useState(true);
  const secili = api.seciliKapId === palet.uid;
  const drop = api.dropHedef === palet.uid;

  // Sağ ve sol sütunları bağımsız akacak şekilde akıllı palet yerleşimiyle ayırıyoruz
  const { solKolon, sagKolon } = paletKolonlaraAyir(palet.cocuklar);

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); drag = { kind: "node", uid: palet.uid }; }}
      onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); api.setDropHedef(palet.uid); } }}
      onDragLeave={() => drop && api.setDropHedef(null)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); api.birak(palet.uid); }}
      onClick={(e) => { e.stopPropagation(); api.setSeciliKapId(palet.uid); }}
      className={`flex w-full flex-col rounded-2xl border-2 p-3 transition ${drop ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10" : secili ? "border-amber-400 bg-amber-50/60 ring-2 ring-amber-200 dark:bg-amber-500/5 dark:ring-amber-500/20" : "border-amber-300/70 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5"}`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle/50" />
        <button type="button" onClick={(e) => { e.stopPropagation(); setAcik((v) => !v); }} className="shrink-0 text-subtle">{acik ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"><Layers className="h-5 w-5" /></span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-sm font-extrabold text-fg">{palet.ad}</p>
          {secili && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/30 dark:text-amber-200">Hedef</span>}
          <div className="inline-flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-fg flex items-center gap-2">
              <span>Toplam:</span>
              <span>{koliSay(palet.cocuklar)} koli</span>
              <span>{nodeDesi(palet)} desi</span>
              <span>{fmt(nodeKg(palet))} kg</span>
            </span>
            <button type="button" onClick={(e) => e.stopPropagation()} className="rounded p-0.5 text-subtle transition hover:bg-amber-100 hover:text-fg active:scale-95 dark:hover:bg-amber-500/20" title="Düzenle">
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        </div>
        <SilButon onSil={() => api.sil(palet.uid)} className="rounded-lg p-1.5 text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10" iconCls="h-4 w-4" />
      </div>
      {acik && (
        <div className="mt-1.5 rounded-xl border border-dashed border-amber-300/60 dark:border-amber-500/40 bg-white/40 p-1 dark:bg-black/10">
          {palet.cocuklar.length === 0 ? (
            <p className="w-full py-4 text-center text-[11px] text-subtle">Boş palet — koli ekle</p>
          ) : (
            <div className="flex items-start gap-[4px]">
              {/* Sol Sütun (Bağımsız) */}
              <div className="flex flex-1 min-w-0 flex-row flex-wrap content-start items-start gap-[4px]">
                {solKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="palet" />)}
              </div>
              {/* Sağ Sütun (Bağımsız) */}
              <div className="flex flex-1 min-w-0 flex-row flex-wrap content-start items-start gap-[4px]">
                {sagKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="palet" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Koli içi akıllı sıra algoritması:
// - Normalde bir sol bir sağ gider.
// - Eğer koyma sırası sağ tarafta idi ise ve oraya koli kondu ise sonraki iki yerleştirme sola konulur ve sayaç sola getirilir.
// - Eğer sıra solda ise ve oraya koli konursa sonraki 3 yerleştirme sağa yapılır ve sonra sayaç sola getirilir.
function koliKolonlaraAyir(cocuklar: Node[]): { solKolon: Node[]; sagKolon: Node[] } {
  const solKolon: Node[] = [];
  const sagKolon: Node[] = [];

  let siradakiNormal: "sol" | "sag" = "sol";
  let zorunluYon: "sol" | "sag" | null = null;
  let zorunluKalan = 0;

  for (const item of cocuklar) {
    let hedefYon: "sol" | "sag";

    if (zorunluKalan > 0 && zorunluYon) {
      hedefYon = zorunluYon;
      zorunluKalan--;
      if (zorunluKalan === 0) {
        // Sayaç tamamlandı: sayaç SOLA getirilir
        siradakiNormal = "sol";
        zorunluYon = null;
      }
    } else {
      hedefYon = siradakiNormal;
      siradakiNormal = siradakiNormal === "sol" ? "sag" : "sol";
    }

    if (hedefYon === "sol") {
      solKolon.push(item);
    } else {
      sagKolon.push(item);
    }

    // Eğer konulan nesne bir koli ise özel dengeleme kuralları devreye girer:
    if (item.tur === "koli") {
      if (hedefYon === "sag") {
        // Sağ tarafta iken koli konduysa sonraki iki yerleştirme sola konulur ve sayaç sıfırlanır
        zorunluYon = "sol";
        zorunluKalan = 2;
      } else {
        // Sol tarafta iken koli konduysa sonraki 3 yerleştirme sağa yapılır ve sonra sayaç sıfırlanır
        zorunluYon = "sag";
        zorunluKalan = 3;
      }
    }
  }

  return { solKolon, sagKolon };
}

function KoliKart({ koli, api, parentTur }: { koli: KoliNode; api: Api; parentTur?: "sahne" | "palet" | "koli" }) {
  const [acik, setAcik] = useState(true);
  const b = boyutBul(koli.no);
  const secili = api.seciliKapId === koli.uid;
  const drop = api.dropHedef === koli.uid;
  const kDesi = koliKendiDesi(koli);
  const icDesiHam = koliIcerikDesi(koli);
  const icDesiYuvarlanmis = yuvarlaDesi(icDesiHam);
  const toplamKg = nodeKg(koli);
  const daraKg = koliDara(koli);
  const dolu = koli.hacim > 0 ? (icDesiHam / koli.hacim) * 100 : 0;
  const atil = koli.atil;
  const inContainer = parentTur === "palet" || parentTur === "koli";

  const isNestedKoli = parentTur === "koli";

  // Koli içi sağ ve sol sütunları akıllı dengeleme algoritmasıyla ayırıyoruz
  const { solKolon, sagKolon } = koliKolonlaraAyir(koli.cocuklar);

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); drag = { kind: "node", uid: koli.uid }; }}
      onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); api.setDropHedef(koli.uid); } }}
      onDragLeave={() => drop && api.setDropHedef(null)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); api.birak(koli.uid); }}
      onClick={(e) => { e.stopPropagation(); api.setSeciliKapId(koli.uid); }}
      style={!inContainer ? { minWidth: boyutGenislik(koli.no), maxWidth: Math.max(boyutGenislik(koli.no), 380) } : undefined}
      className={`flex min-w-0 w-full flex-col rounded-2xl border-2 p-[2px] shadow-sm transition ${b?.btn} ${secili ? `ring-2 ${b?.ring}` : ""}`}
    >
      <div className="px-2 pt-1.5 pb-0.5">
        {isNestedKoli ? (
          <>
            <div className="flex items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle/50" />
                <button type="button" onClick={(e) => { e.stopPropagation(); setAcik((v) => !v); }} className="shrink-0 text-subtle">
                  {acik ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${atil ? "bg-slate-200 text-slate-600 dark:bg-slate-600/50 dark:text-slate-200" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"}`}>
                  {koli.no}
                </span>
                <span className="truncate text-xs font-bold text-fg">{atil ? "Atıl Koli" : `Koli ${boyutKodu(koli.no)}`}</span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={(e) => { e.stopPropagation(); api.koliIcineEkle(koli.uid); }} className="rounded-lg p-1.5 text-subtle transition hover:bg-brand-50 hover:text-brand-600 active:scale-95 dark:hover:bg-brand-500/10" title="İçine koli ekle">
                  <Box className="h-4 w-4" />
                </button>
                <SilButon onSil={() => api.sil(koli.uid)} className="rounded-lg p-1.5 text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10" iconCls="h-4 w-4" />
              </div>
            </div>

            <div className="mt-1 flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-fg">
                <span>Boyut {koli.no}</span>
                {boyutOl(koli.no) && <span>{boyutOl(koli.no)} cm</span>}
                <span className="rounded bg-brand-100/80 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                  {kDesi} DS
                </span>
              </div>
              <div className="flex items-center gap-1">
                <p className="font-mono text-[10px] font-bold text-fg flex items-center gap-2">
                  <span>{urunSay(koli)} ürün</span>
                  <span title={`Koli Desisi: ${kDesi} ds (İçerik: ${icDesiYuvarlanmis} ds)`}>{kDesi} ds</span>
                  <span title={`Toplam brüt ağırlık: ${fmt(toplamKg)} kg (Koli darası: ${fmt(daraKg)} kg)`}>{fmt(toplamKg)} kg</span>
                </p>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded p-0.5 text-subtle transition hover:bg-elevated hover:text-fg active:scale-95"
                  title="Düzenle"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2">
            <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-subtle/50" />
            <button type="button" onClick={(e) => { e.stopPropagation(); setAcik((v) => !v); }} className="mt-0.5 shrink-0 text-subtle">{acik ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${atil ? "bg-slate-200 text-slate-600 dark:bg-slate-600/50 dark:text-slate-200" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"}`}>{koli.no}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
                <span>{atil ? "Atıl Koli" : `Koli ${boyutKodu(koli.no)}`}</span>
                <span className="text-xs font-bold text-fg flex items-center gap-2">
                  <span>Boyut {koli.no}</span>
                  {boyutOl(koli.no) && <span>{boyutOl(koli.no)} cm</span>}
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="rounded p-0.5 text-subtle transition hover:bg-elevated hover:text-fg active:scale-95"
                    title="Düzenle"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <p className="font-mono text-[11px] font-bold text-fg flex items-center gap-2">
                  <span>{urunSay(koli)} ürün</span>
                  <span title={`Koli Desisi: ${kDesi} ds (İçerik: ${icDesiYuvarlanmis} ds)`}>{kDesi} ds</span>
                  <span title={`Toplam brüt ağırlık: ${fmt(toplamKg)} kg (Koli darası: ${fmt(daraKg)} kg)`}>{fmt(toplamKg)} kg</span>
                </p>
                <span className="px-3 text-[11px] font-bold text-fg">
                  {kDesi} Desi
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={(e) => { e.stopPropagation(); api.koliIcineEkle(koli.uid); }} className="rounded-lg p-1.5 text-subtle transition hover:bg-brand-50 hover:text-brand-600 active:scale-95 dark:hover:bg-brand-500/10" title="İçine koli ekle"><Box className="h-4 w-4" /></button>
              <SilButon onSil={() => api.sil(koli.uid)} className="rounded-lg p-1.5 text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10" iconCls="h-4 w-4" />
            </div>
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-2" title={`Doluluk: %${Math.round(dolu)} (İçerik: ${icDesiYuvarlanmis} DS / Kapasite: ${kDesi} DS)`}>
          <span className="flex items-center gap-1 text-[11px] font-bold text-fg"><Weight className="h-3.5 w-3.5" /> Doluluk</span>
          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div className={`h-full rounded-full ${dolu > 105 ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, dolu)}%` }} />
          </div>
          <span className={`font-mono text-[10px] font-bold ${dolu > 105 ? "text-rose-500" : "text-emerald-500"}`}>%{Math.round(dolu)}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {HAZARDS.map((h) => {
            const on = koli.hazards.includes(h.id);
            const Icon = h.icon;
            return (
              <button key={h.id} type="button" onClick={(e) => { e.stopPropagation(); api.hazardToggle(koli.uid, h.id); }} title={h.label} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition ${on ? h.cls : "border-line bg-surface text-subtle/60 hover:text-fg"}`}>
                <Icon className="h-3 w-3" /> {on ? h.label : ""}
              </button>
            );
          })}
        </div>
      </div>

      {acik && (
        <div className="mt-[2px] max-h-[360px] overflow-y-auto rounded-xl border border-dashed border-slate-300/70 dark:border-slate-600/50 bg-elevated/30 px-[3px] py-1.5">
          {koli.cocuklar.length === 0 ? (
            <p className="w-full py-3 text-center text-[11px] text-subtle">Boş koli</p>
          ) : (
            <div className="flex items-start gap-[3px]">
              {/* Sol Sütun (Bağımsız) */}
              <div className="flex flex-1 min-w-0 flex-col gap-[3px]">
                {solKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="koli" />)}
              </div>
              {/* Sağ Sütun (Bağımsız) */}
              <div className="flex flex-1 min-w-0 flex-col gap-[3px]">
                {sagKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="koli" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UrunKart({ urun, api, parentTur }: { urun: UrunNode; api: Api; parentTur?: "sahne" | "palet" | "koli" }) {
  const isPalet = parentTur === "palet";
  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); drag = { kind: "node", uid: urun.uid }; }}
      onClick={(e) => e.stopPropagation()}
      className={`flex ${isPalet ? "w-[calc((100%-4px)/2)] shrink-0" : "w-full"} min-w-0 flex-col rounded-xl border p-2 transition ${urun.paketli ? "border-slate-400 dark:border-slate-400 bg-white text-slate-900" : "border-slate-400 dark:border-slate-400 bg-surface hover:border-brand-400"}`}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[11px] font-bold leading-tight ${urun.paketli ? "text-slate-900" : "text-fg"}`}>{urun.name}</p>
          <p className={`font-mono text-[10px] font-bold ${urun.paketli ? "text-slate-900" : "text-fg"}`}>{urun.code}{urun.paketli && " · pk"}</p>
        </div>
        {urun.paketli && <PackageCheck className="h-3 w-3 shrink-0 text-emerald-600" />}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
        <span className={`font-mono text-sm font-black ${urun.paketli ? "text-slate-900" : "text-fg"}`}>{urun.qty}<span className={`ml-0.5 text-[10px] font-bold ${urun.paketli ? "text-slate-900" : "text-fg"}`}>{urun.unit}</span></span>
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          <button type="button" onClick={(e) => { e.stopPropagation(); api.urunAdet(urun.uid, -1); }} className="flex h-6 w-6 items-center justify-center rounded-md border border-rose-300 text-rose-500 transition hover:bg-rose-50 active:scale-95 dark:hover:bg-rose-500/10"><Minus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); api.urunAdet(urun.uid, +1); }} className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-300 text-emerald-600 transition hover:bg-emerald-50 active:scale-95 dark:hover:bg-emerald-500/10"><Plus className="h-3.5 w-3.5" /></button>
          <SilButon onSil={() => api.sil(urun.uid)} className="flex h-6 w-6 items-center justify-center rounded-md text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10" iconCls="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}

// Silmeden önce onay + 3 sn geri sayım (yanlışlıkla silmeyi önler)
function SilButon({ onSil, className, iconCls = "h-3.5 w-3.5" }: { onSil: () => void; className?: string; iconCls?: string }) {
  const [onay, setOnay] = useState(false);
  const [kalan, setKalan] = useState(3);
  useEffect(() => {
    if (!onay) return;
    setKalan(3);
    const t = setInterval(() => setKalan((k) => (k <= 1 ? 0 : k - 1)), 1000);
    return () => clearInterval(t);
  }, [onay]);
  if (!onay) {
    return (
      <button type="button" title="Sil" onClick={(e) => { e.stopPropagation(); setOnay(true); }} className={className ?? "flex h-7 w-7 items-center justify-center rounded-md text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10"}>
        <Trash2 className={iconCls} />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" disabled={kalan > 0} title={kalan > 0 ? `${kalan} sn bekle` : "Sil"} onClick={(e) => { e.stopPropagation(); onSil(); setOnay(false); }} className="inline-flex h-7 items-center gap-1 rounded-md bg-rose-600 px-2.5 text-[11px] font-bold text-white transition enabled:hover:bg-rose-700 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-60">
        <Check className="h-3.5 w-3.5" /> {kalan > 0 ? kalan : "Evet"}
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOnay(false); }} className="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2.5 text-[11px] font-bold text-subtle transition hover:text-fg active:scale-95">İptal</button>
    </span>
  );
}
