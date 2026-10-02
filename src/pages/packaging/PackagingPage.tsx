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
  Camera,
  AlertTriangle,
  CornerDownLeft,
  X,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import CameraScanOverlay from "../../components/CameraScanOverlay";
import { useLocation, useNavigate } from "react-router-dom";
import { api as wmsApi } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import { caniasDateTime } from "../../store/pickingStore";

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
  desi: number; kg: number; paketli?: boolean; hazards?: Hazard[];
  elle?: boolean;      // birim hacim/ağırlık elle değiştirildi → XML satırında ISMANUEL=1
  // qty = Paket Miktarı (sipariş birimi, bu kaptaki adet). paketIci = Ürün Paket İçi Miktar (PERUNIT, sabit).
  // Stok adedi = paketIci × qty × (üst kap tekrarları). desi/kg STOK birimi başına.
  paketIci: number;    // PERUNIT — çevrim miktarı (sipariş birimi başına stok adedi)
  stokBirim?: string;  // SKUNIT
}
interface KoliNode {
  uid: string; tur: "koli"; no: number; kod?: string; atil?: boolean; beklemede?: boolean;
  hacim: number; dara?: number; hazards: Hazard[]; cocuklar: Node[];
  en?: number; boy?: number; yukseklik?: number; ol?: string;
  carpan?: number; // Paket miktarı: aynı içerikten kaç adet (varsayılan 1). Desi/kg/miktar bununla çarpılır.
  elle?: boolean;  // Kullanıcı desi/ağırlığı elle değiştirdi (ISMANUEL=1) — otomatik hesap bu satırı ezmez.
  elleDesi?: number; // Manuel desi (tek koli başına) — ayarlıysa içerik hesabını ezer.
  elleKg?: number;   // Manuel brüt ağırlık (tek koli başına) — ayarlıysa içerik hesabını ezer.
}
interface PaletNode { uid: string; tur: "palet"; ad: string; cocuklar: Node[]; carpan?: number; }
type Node = UrunNode | KoliNode | PaletNode;

interface KaynakUrun {
  code: string; name: string; unit: string; // unit = sipariş birimi (AKLSQUNIT)
  siparis: number;      // AKLSQUANTITY — sipariş birimi cinsinden toplam Paket Miktarı (limit buna göre)
  paketIci: number;     // PERUNIT — Ürün Paket İçi Miktar (çevrim, sabit)
  desi: number;         // birim (stok) hacmi
  kg: number;           // birim (stok) ağırlığı
  stokBirim: string;    // SKUNIT
  paletZorunlu?: boolean; // AKLISPALLETMUST = 1
  paketli?: boolean;
  hazards?: Hazard[];     // urun tehlike nitelikleri (CANIAS bayraklarindan)
  elle?: boolean;         // birim hacim/ağırlık bu oturumda elle değiştirildi
}

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
// Koli görsel genişliği DESİ ile orantılı (Bora: 4 desi ≈ 400px, 9 desi ≈ 900px).
// Aşırı büyümeyi önlemek için [220, 680] px arasında kısılır.
const boyutGenislik = (desi: number) => {
  const px = Math.round(Math.max(1, desi) * 100);
  return Math.min(680, Math.max(220, px));
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

// Kolinin kendi standart ebat desisi (kapasite / doluluk çubuğu için — değişmez, tam sayı)
const koliKendiDesi = (koli: KoliNode): number => yuvarlaDesi(koli.hacim);

// Koli içine konan ürünlerin ve iç kolilerin HAM (yuvarlanmamış) hacim toplamı.
// Doluluk göstergesi bunu kolinin kapasitesine oranlar.
const koliIcerikDesi = (koli: KoliNode): number =>
  koli.cocuklar.reduce((s, c) => s + nodeHacimHam(c), 0);

// --- Ağaç yardımcıları --------------------------------------------------------
const cocuk = (n: Node): Node[] => (n.tur === "urun" ? [] : n.cocuklar);

// Paket miktarı (çarpan): kap için >=1 tam sayı, ürün için 1. "Gizli 1" yerine gerçek çarpan.
const carpanOf = (n: Node): number => (n.tur === "urun" ? 1 : Math.max(1, Math.round(n.carpan ?? 1)));

// HAM (yuvarlanmamış) hacim — İÇERİK BAZLI. Her miktar değişimi (birim hacim kadar) buraya doğrusal yansır.
// - Ürün: birim hacim × ürün içi miktar × adet
// - Koli/Palet: içindekilerin ham hacim toplamı × paket çarpanı (kabın kendi ebadı EKLENMEZ)
const nodeHacimHam = (n: Node): number => {
  if (n.tur === "urun") return n.desi * n.paketIci * n.qty;
  if (n.tur === "koli" && typeof n.elleDesi === "number") return n.elleDesi * carpanOf(n); // manuel desi
  return cocuk(n).reduce((s, c) => s + nodeHacimHam(c), 0) * carpanOf(n);
};

// Node desisi — içerik bazlı ham hacmin TEK SEFERDE yuvarlanmışı (patron kuralı: <1 → 1, değilse floor).
const nodeDesi = (n: Node): number => yuvarlaDesi(nodeHacimHam(n));


// Node kilosu:
// - Ürün ise: ürün kg * adet
// - Koli ise: içindeki her şeyin kg toplamı + koli darası (kayıtlıysa, yoksa 0)
// - Palet ise: içindeki her şeyin toplam kg'si
const nodeKg = (n: Node): number => {
  if (n.tur === "urun") return n.kg * n.paketIci * n.qty;
  if (n.tur === "koli") {
    if (typeof n.elleKg === "number") return n.elleKg * carpanOf(n); // manuel ağırlık
    const icKg = cocuk(n).reduce((s, c) => s + nodeKg(c), 0);
    // 5 koli varsa 5 dara + 5x içerik
    return (icKg + koliDara(n)) * carpanOf(n);
  }
  return cocuk(n).reduce((s, c) => s + nodeKg(c), 0) * carpanOf(n);
};

const urunSay = (n: Node): number => (n.tur === "urun" ? 1 : cocuk(n).reduce((s, c) => s + urunSay(c), 0));
// Fiziksel koli adedi — paket çarpanları (×N) DAHİL. ×2 koli = 2 koli sayılır.
const koliSay = (ns: Node[], faktor = 1): number =>
  ns.reduce((s, n) => {
    if (n.tur === "urun") return s;
    const f = faktor * carpanOf(n);
    return s + (n.tur === "koli" ? f : 0) + koliSay(cocuk(n), f);
  }, 0);
// Fiziksel palet adedi — paket çarpanı dahil.
const paletSay = (ns: Node[]): number => ns.filter((n) => n.tur === "palet").reduce((s, n) => s + carpanOf(n), 0);

// Koli içindeki ürünlerin tehlike niteliklerinin birleşimi (OTOMATIK) — iç koliler dahil.
const koliHazards = (n: Node): Hazard[] => {
  const set = new Set<Hazard>();
  const gez = (x: Node) => { if (x.tur === "urun") (x.hazards ?? []).forEach((h) => set.add(h)); else x.cocuklar.forEach(gez); };
  cocuk(n).forEach(gez);
  return HAZARDS.filter((h) => set.has(h.id)).map((h) => h.id);
};

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
// Fiziksel paketlenmiş adet: her ürün, üstündeki tüm kapların çarpanları kadar sayılır.
function paketlenmis(ns: Node[], code: string, faktor = 1): number {
  return ns.reduce((s, n) => {
    if (n.tur === "urun") return s + (n.code === code ? n.qty * faktor : 0);
    return s + paketlenmis(cocuk(n), code, faktor * carpanOf(n));
  }, 0);
}

// Bir kabın (veya kök) altındaki ürünlere uygulanan toplam çarpan: kökten o kaba kadar carpan çarpımı.
function pathCarpan(ns: Node[], targetUid: string | null): number {
  if (!targetUid) return 1;
  const walk = (list: Node[], acc: number): number | null => {
    for (const n of list) {
      if (n.tur === "urun") continue;
      const own = acc * carpanOf(n);
      if (n.uid === targetUid) return own;
      const r = walk(n.cocuklar, own);
      if (r !== null) return r;
    }
    return null;
  };
  return walk(ns, 1) ?? 1;
}
function temizle(ns: Node[]): Node[] {
  return ns.filter((n) => n.tur !== "urun" || n.qty > 0).map((n) => (n.tur === "urun" ? n : ({ ...n, cocuklar: temizle(n.cocuklar) } as Node)));
}

const xmlEsc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// MZYSavePack için PSPACKITEMXML üretir.
// Düz TID/TPID tablosu: her düğüm bir satır, TPID üstündeki düğümün TID'si (kök = 0).
// RVOLUME / RNETWEIGHT = TEK bir paket örneği için (PACKQTY ayrı alan; backend PACKQTY ile çarpar).
//   - Koli hacmi = kolinin kendi ebat desisi (içerik hariç, patron kuralı)
//   - Koli ağırlığı = içindekiler + koli darası
function buildPackXml(nodes: Node[], ctx: { company: string; plant: string }): string {
  const rows: string[] = [];
  let seq = 0;
  // Her satır KENDİ BAŞINA okunur (ağaçta yukarı çıkmak yok):
  //   QUANTITY = Ürün Paket İçi Miktar (İçi, stok/sipariş çevrimi) | kap için adedi
  //   PACKQTY  = Ürün Paket Miktarı (sipariş birimi) | kap için 1
  //   PARENTPACKQTY = üst kapların kümüle tekrarı
  //   Satır toplamı (stok) = birim × QUANTITY × PACKQTY × PARENTPACKQTY
  const walk = (list: Node[], parentTid: number, ancCum: number, topLevel: boolean) => {
    for (const n of list) {
      const tid = ++seq;
      const r3 = (x: number) => Math.round(x * 1000) / 1000;
      let ISPACKITEM = 0, ISSCRAPBOX = 0, ISMANUEL = 0;
      let MATERIAL = "", MTEXT = "", QUNIT = "AD";
      let QUANTITY = 1, PACKQTY = 1, PARENTPACKQTY = 1, birimVol = 0, birimWt = 0;
      if (n.tur === "urun") {
        MATERIAL = n.code; MTEXT = n.name; QUNIT = n.unit || "AD";
        ISMANUEL = n.elle ? 1 : 0;  // birim hacim/ağırlık elle değiştirildiyse
        QUANTITY = n.paketIci;      // İçi Miktar (FCT)
        PACKQTY = n.qty;            // Paket Miktarı (sipariş birimi, bu kapta)
        PARENTPACKQTY = ancCum;     // üst kapların kümüle tekrarı
        birimVol = n.desi; birimWt = n.kg; // STOK birimi başına
      } else if (n.tur === "koli") {
        ISPACKITEM = 1; ISSCRAPBOX = n.atil ? 1 : 0; ISMANUEL = n.elle ? 1 : 0;
        MATERIAL = n.kod || boyutKodu(n.no);
        MTEXT = n.atil ? "Atıl Koli" : (n.kod || `Koli ${boyutKodu(n.no)}`);
        QUNIT = "AD";
        QUANTITY = topLevel ? 1 : carpanOf(n);
        PARENTPACKQTY = topLevel ? carpanOf(n) : ancCum;
        // Manuel müdahale (ISMANUEL=1): kullanıcının girdiği desi/ağırlık EZİLMEZ, XML'e aynen yazılır.
        birimVol = typeof n.elleDesi === "number" ? n.elleDesi : n.hacim;   // kolinin kendi hacmi (ebat ya da manuel)
        birimWt = typeof n.elleKg === "number" ? n.elleKg : koliDara(n);    // kolinin kendi ağırlığı (dara ya da manuel)
      } else {
        ISPACKITEM = 2; MATERIAL = ""; MTEXT = n.ad; QUNIT = "AD";
        QUANTITY = topLevel ? 1 : carpanOf(n);
        PARENTPACKQTY = topLevel ? carpanOf(n) : ancCum;
        birimVol = 0; birimWt = 0;  // paletin kendi hacmi/ağırlığı yok
      }
      const toplamCarpan = QUANTITY * PACKQTY * PARENTPACKQTY;
      const VOLUME = r3(birimVol);
      const NETWEIGHT = r3(birimWt);
      const RVOLUME = r3(birimVol * toplamCarpan);
      const RNETWEIGHT = r3(birimWt * toplamCarpan);
      rows.push(
        "  <ROW>" +
        `<TID>${tid}</TID>` +
        `<TPID>${parentTid}</TPID>` +
        `<ISPACKITEM>${ISPACKITEM}</ISPACKITEM>` +
        `<ISSCRAPBOX>${ISSCRAPBOX}</ISSCRAPBOX>` +
        `<ISMANUEL>${ISMANUEL}</ISMANUEL>` +
        `<COMPANY>${xmlEsc(ctx.company)}</COMPANY>` +
        `<PLANT>${xmlEsc(ctx.plant)}</PLANT>` +
        `<MATERIAL>${xmlEsc(MATERIAL)}</MATERIAL>` +
        `<MTEXT>${xmlEsc(MTEXT)}</MTEXT>` +
        `<QUANTITY>${r3(QUANTITY)}</QUANTITY>` +
        `<PACKQTY>${r3(PACKQTY)}</PACKQTY>` +
        `<PARENTPACKQTY>${r3(PARENTPACKQTY)}</PARENTPACKQTY>` +
        `<QUNIT>${xmlEsc(QUNIT)}</QUNIT>` +
        `<VOLUME>${VOLUME}</VOLUME>` +
        `<RVOLUME>${RVOLUME}</RVOLUME>` +
        "<VUNIT>DS</VUNIT>" +
        `<NETWEIGHT>${NETWEIGHT}</NETWEIGHT>` +
        `<RNETWEIGHT>${RNETWEIGHT}</RNETWEIGHT>` +
        "<NWUNIT>KG</NWUNIT>" +
        "</ROW>"
      );
      if (n.tur !== "urun") walk(n.cocuklar, tid, ancCum * carpanOf(n), false);
    }
  };
  walk(nodes, 0, 1, true);
  return `<ROOT>\n${rows.join("\n")}\n</ROOT>`;
}

// -----------------------------------------------------------------------------
// buildPackXml'in TERSİ — CANIAS'tan gelen (ya da kaydedilmiş) PSPACKITEMXML'i
// yeniden düzenlenebilir ağaca (Node[]) çözümler. Paketlemeyi geri çekip düzenleme
// ve dağıtım aşamasında paketleme gösterimi için. Aynı TID/TPID şemasını kullanır.
// Not: CANIAS'ın bu XML'i hangi servis/alanda döndürdüğü netleşince load'a bağlanır.
// -----------------------------------------------------------------------------
export function parsePackXml(xml: string): Node[] {
  if (!xml || typeof xml !== "string") return [];
  const unesc = (v: string) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const field = (row: string, tag: string): string => {
    const m = row.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">"));
    return m ? unesc(m[1]) : "";
  };
  const num = (row: string, tag: string): number => Number(field(row, tag)) || 0;

  interface Ham { tid: number; tpid: number; node: Node; }
  const hamlar: Ham[] = [];
  let idc = 0;
  const yeniId = () => `pp${++idc}`;

  const rowRe = /<ROW>([\s\S]*?)<\/ROW>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(xml)) !== null) {
    const r = m[1];
    const tid = num(r, "TID");
    const tpid = num(r, "TPID");
    const ispack = num(r, "ISPACKITEM");
    const material = field(r, "MATERIAL");
    const mtext = field(r, "MTEXT");
    const qunit = field(r, "QUNIT") || "AD";
    const quantity = num(r, "QUANTITY");
    const packqty = num(r, "PACKQTY");
    const parentpackqty = num(r, "PARENTPACKQTY") || 1;
    const volume = num(r, "VOLUME");
    const netweight = num(r, "NETWEIGHT");
    const manuel = num(r, "ISMANUEL") === 1;
    const atil = num(r, "ISSCRAPBOX") === 1;

    // buildPackXml: kök (topLevel) kapta QUANTITY=1 & PARENTPACKQTY=carpan; iç kapta QUANTITY=carpan.
    const carpan = tpid === 0 ? Math.max(1, Math.round(parentpackqty)) : Math.max(1, Math.round(quantity));

    let node: Node;
    if (ispack === 0) {
      node = { uid: yeniId(), tur: "urun", code: material, name: mtext || material, qty: Math.round(packqty), unit: qunit, desi: volume, kg: netweight, paketIci: quantity || 1, stokBirim: qunit, hazards: [], elle: manuel };
    } else if (ispack === 1) {
      const b = BOYUTLAR.find((x) => x.kod === material);
      const koli: KoliNode = { uid: yeniId(), tur: "koli", no: b?.n ?? 0, kod: material || b?.kod, en: b?.en, boy: b?.boy, yukseklik: b?.yukseklik, ol: b?.ol, hacim: b?.hacim ?? volume, dara: b?.dara, hazards: [], cocuklar: [], atil, elle: manuel, carpan };
      if (manuel) { koli.elleDesi = volume; koli.elleKg = netweight; }
      node = koli;
    } else {
      node = { uid: yeniId(), tur: "palet", ad: mtext || "Palet", cocuklar: [], carpan };
    }
    hamlar.push({ tid, tpid, node });
  }

  const byTid = new Map<number, Ham>();
  hamlar.forEach((h) => byTid.set(h.tid, h));
  const kokler: Node[] = [];
  for (const h of hamlar) {
    const parent = h.tpid !== 0 ? byTid.get(h.tpid) : undefined;
    if (parent && parent.node.tur !== "urun") (parent.node as KoliNode | PaletNode).cocuklar.push(h.node);
    else kokler.push(h.node);
  }
  return kokler;
}

// sürükleme durumu (modül seviyesi)
let drag: { kind: "node"; uid: string } | { kind: "kaynak"; code: string } | null = null;

export default function PackagingPage() {
  const { toast, show } = useToast();
  // Paketleme deposu ayarlardan (hardcode değil)
  const packWh = useAppStore((st) => st.settings.warehousePackaging);
  const compCode = useAppStore((st) => st.settings.company);
  const plantCode = useAppStore((st) => st.settings.facility);
  const sevkWh = useAppStore((st) => st.settings.warehouseDelivery); // sevkiyat konteynerinin deposu
  const location = useLocation();
  const navigate = useNavigate();
  const screenTimeout = useAppStore((st) => st.settings.screenTimeout ?? 3);
  const navState = (location.state as { order?: PackOrder } | null) || null;
  const idRef = useRef(100);
  const yid = () => `x${++idRef.current}`;

  const [sahne, setSahne] = useState<Node[]>([]);
  const [seciliKapId, setSeciliKapId] = useState<string | null>(null);
  const [duzenlenenKoliUid, setDuzenlenenKoliUid] = useState<string | null>(null);
  const [duzenlenenUrunCode, setDuzenlenenUrunCode] = useState<string | null>(null);
  const [xmlAcik, setXmlAcik] = useState(false);
  const [atilMod, setAtilMod] = useState(false);
  const [dropHedef, setDropHedef] = useState<string | null>(null);
  const [bitti, setBitti] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState<null | "bitir" | "beklet">(null); // hangi buton kaydediyor
  const [baslamaZamani, setBaslamaZamani] = useState<string>(""); // Paketlemeye giriş saati (PDTSTARTTIME)

  // CANIAS MZYListingPack Servisi — Paketlenecek Emirler & Ürünler
  const [emirler, setEmirler] = useState<PackOrder[]>([]);
  const [seciliEmir, setSeciliEmir] = useState<PackOrder | null>(null);
  const [urunler, setUrunler] = useState<KaynakUrun[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);

  const emirSec = async (emir: PackOrder) => {
    setSeciliEmir(emir);
    setSahne([]);
    setSeciliKapId(null);
    setBaslamaZamani(caniasDateTime()); // kullanıcı bu emirle paketlemeye girdi
    setYukleniyor(true);
    try {
      // 1) Yeni CANIAS MZYEnterPack servisini çağır (Paketlemeye Başla)
      const res = await wmsApi.enterPack({
        company: emir.company,
        plant: emir.plant,
        warehouse: emir.warehouse,
        stockPlace: emir.stockPlace,
        orderType: emir.orderType,
        orderNum: emir.orderNum,
      });

      if (res && res.lines && res.lines.length > 0) {
        const caniasUrunler: KaynakUrun[] = res.lines.map((l: Record<string, unknown>) => {
          // TBLITEMMATLINE tablosundan desi ve ağırlık (NWUNIT = GR ise KG'ye dönüştürülür)
          const matLine = Array.isArray(l.TBLITEMMATLINE)
            ? (l.TBLITEMMATLINE[0] as Record<string, unknown>)
            : (l.TBLITEMMATLINE as Record<string, unknown>) || {};

          const desi = Number(matLine?.VOLUME) || 0; // STOK birimi başına hacim (desi)
          let kg = Number(matLine?.NETWEIGHT) || 0;   // STOK birimi başına ağırlık
          if (String(matLine?.NWUNIT || "").toUpperCase() === "GR") {
            kg = kg / 1000;
          }

          // Yeni model (Bora): sipariş birimi cinsinden miktar + çevrim (İçi Miktar)
          const siparis = Number(l.AKLSQUANTITY ?? l.MOVEDQTY ?? l.MOVEQTY ?? l.QTY) || 0; // sipariş birimi toplam Paket Miktarı
          // İçi Miktar = FCT = PERUNIT / VALUE (sipariş birimi başına stok adedi).
          // Bora VALUE/FCT'yi enterPack'e ekleyince doğru hesaplanır; yoksa güvenli fallback (1).
          const perunit = Number(matLine?.PERUNIT ?? l.PERUNIT) || 0;
          const value = Number(matLine?.VALUE ?? l.VALUE) || 0;
          const fctDirect = Number(matLine?.FCT ?? l.FCT) || 0;
          const paketIci = fctDirect > 0 ? fctDirect : (perunit > 0 && value > 0 ? perunit / value : (perunit > 0 ? perunit : 1));
          const orderUnit = String(l.AKLSQUNIT || l.UNIT || "AD");
          const stokBirim = String(matLine?.SKUNIT || l.UNIT || "AD");
          const paletZorunlu = String(l.AKLISPALLETMUST ?? "0") === "1";

          // Tehlike nitelikleri (CANIAS malzeme bayraklari) -> koli etiketleri bunlardan OTOMATIK turetilir.
          // Not: enterPack TBLITEMMATLINE bu alanlari dondurmezse hepsi kapali gelir (Bora alanlari ekleyince calisir).
          const hbit = (v: unknown) => { const t = String(v ?? "").trim().toUpperCase(); return t === "1" || t === "TRUE" || t === "X" || t === "Y" || t === "E"; };
          const hz: Hazard[] = [];
          if (hbit(matLine?.AKLISBREAKABLE ?? l.AKLISBREAKABLE)) hz.push("kirilabilir");
          if (hbit(matLine?.ISEXPLOS ?? l.ISEXPLOS)) hz.push("yanici");
          if (hbit(matLine?.AKLISLIQUID ?? l.AKLISLIQUID)) hz.push("sivi");
          if (hbit(matLine?.AKLISTOXIC ?? l.AKLISTOXIC)) hz.push("toksik");
          if (hbit(matLine?.ISSPOIL ?? l.ISSPOIL)) hz.push("bozulur");

          return {
            code: String(l.MATERIAL || ""),
            name: String(l.MTEXT || l.MATERIAL || "Malzeme").trim(),
            unit: orderUnit,
            siparis,
            paketIci,
            desi: Number(desi.toFixed(2)),
            kg: Number(kg.toFixed(3)),
            stokBirim,
            paletZorunlu,
            hazards: hz,
          };
        });

        // MZYSavePack PSDELNUM = EnterPack'in döndürdüğü DELNUM (paket no). Gelmezse listedeki değer kalır.
        const enterHead = (res.head || {}) as Record<string, unknown>;
        const enterDelNum = String(enterHead.DELNUM ?? (res.lines[0] as Record<string, unknown> | undefined)?.DELNUM ?? "").trim();
        if (enterDelNum && enterDelNum !== emir.delNum) setSeciliEmir({ ...emir, delNum: enterDelNum });

        setUrunler(caniasUrunler);
        show({
          kind: "ok",
          text: `${emir.orderType}-${emir.orderNum} CANIAS kalemleri yüklendi (${caniasUrunler.length} kalem)`,
        });
        return;
      }

      // CANIAS'tan satır dönmediyse hiçbir mock/tahmini veri üretme
      setUrunler([]);
      show({
        kind: "info",
        text: `${emir.orderType}-${emir.orderNum} için CANIAS'ta açık paketlenecek malzeme bulunamadı`,
      });
    } catch (err) {
      console.warn("enterPack hatası:", err);
      setUrunler([]);
      show({
        kind: "err",
        text: "Paketleme başlatma hatası: " + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setYukleniyor(false);
    }
  };

  const listeGetir = async () => {
    setYukleniyor(true);
    try {
      // CANIAS Depo 10 üzerinden paketlenecek açık emirleri çek
      const rows = await wmsApi.getPackagingList({ warehouse: packWh });
      if (rows && rows.length > 0) {
        const yeniEmirler: PackOrder[] = rows.map((r) => ({
          company: String(r.COMPANY || compCode),
          plant: String(r.PLANT || plantCode),
          warehouse: String(r.WAREHOUSE || packWh),
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
    // Ara liste ekranından seçilen emirle gelindiyse doğrudan onu aç (MZYEnterPack).
    if (navState?.order) {
      setEmirler([navState.order]);
      emirSec(navState.order);
    } else {
      // Doğrudan /packaging/pack açıldıysa (state yok) eski davranış: listeyi çek.
      listeGetir();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Özet (başarı) ekranı otomatik kapanır: SCREENTIMEOUT sn sonra en başa (listeye) döner.
  useEffect(() => {
    if (!bitti) return;
    const sn = Math.max(1, Number(screenTimeout) || 3);
    const t = setTimeout(() => navigate("/packaging"), sn * 1000);
    return () => clearTimeout(t);
  }, [bitti, screenTimeout, navigate]);

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

  const genelHacim = sahne.reduce((s, n) => s + nodeHacimHam(n), 0); // ham (yuvarlanmamış) toplam hacim
  const genelDesi = yuvarlaDesi(genelHacim);
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
      en: b?.en,
      boy: b?.boy,
      yukseklik: b?.yukseklik,
      ol: b?.ol,
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
    if (atilMod) setAtilMod(false);
    show({ kind: "ok", text: `${atilMod ? "Atıl koli" : "Koli"} · ${b?.kod || `Boyut ${no}`} (${b?.ol || ""} cm · ${yuvarlaDesi(b?.hacim ?? boyutHacim(no))} DS)` });
  };

  const sil = (uid: string) => { setSahne((prev) => nodeRemove(prev, uid).list); show({ kind: "warn", text: "Kart silindi" }); };

  // Birim hacim/ağırlık ELLE düzenleme (oturum içi) — hem kaynak listeyi hem yerleştirilmiş düğümleri günceller, her şey yeniden hesaplanır.
  const birimGuncelle = (code: string, desi: number, kg: number) => {
    setUrunler((prev) => prev.map((u) => (u.code === code ? { ...u, desi, kg, elle: true } : u)));
    const guncelleAgac = (ns: Node[]): Node[] => ns.map((n) => (n.tur === "urun" ? (n.code === code ? { ...n, desi, kg, elle: true } : n) : ({ ...n, cocuklar: guncelleAgac(n.cocuklar) } as Node)));
    setSahne((prev) => guncelleAgac(prev));
    show({ kind: "ok", text: `${code} birim güncellendi — ${fmt(desi)} ds · ${fmt(kg)} kg (oturum içi)` });
  };
  // Hesaplamayı tazeleme (manuel) — sıfır adetli artıkları temizler, yeniden hesaplatır.
  const hesabiYenile = () => { setSahne((prev) => temizle([...prev])); show({ kind: "ok", text: "Hesaplama güncellendi" }); };

  const urunAdet = (uid: string, delta: number) => {
    if (delta > 0) {
      const node = nodeFind(sahne, uid);
      if (node && node.tur === "urun") {
        const k = urunler.find((x) => x.code === node.code);
        if (k) {
          const F = pathCarpan(sahne, uid); // bu ürüne uygulanan toplam paket çarpanı
          const kalan = k.siparis - paketlenmis(sahne, node.code);
          if (kalan < F) {
            show({ kind: "info", text: F > 1 ? `Paket çarpanı ×${F} — 1 adet artırmak için ${F} adet gerekiyor, kalan yok` : "Bu üründen siparişte daha fazla yok" });
            return;
          }
        }
      }
    }
    setSahne((prev) => temizle(nodeMap(prev, uid, (n) => (n.tur === "urun" ? { ...n, qty: Math.max(0, n.qty + delta) } : n))));
  };

  const hacim = (uid: string, v: number) => map(uid, (n) => (n.tur === "koli" ? { ...n, hacim: Math.max(0, v) } : n));
  // Paket miktarı (çarpan) — koli veya palet için
  const carpanla = (uid: string, delta: number) => {
    const yeni = nodeMap(sahne, uid, (n) => (n.tur !== "urun" ? ({ ...n, carpan: Math.max(1, Math.round((n.carpan ?? 1) + delta)) } as Node) : n));
    // Çarpan artışı içindekilerin fiziksel adedini katlar — sipariş miktarı aşılamaz.
    if (delta > 0) {
      const asan = siparisAsan(yeni);
      if (asan) {
        show({ kind: "info", text: `${asan.name}: paket çarpanı artırılamaz — sipariş miktarı aşılıyor (max ${asan.siparis} ${asan.unit})` });
        return;
      }
    }
    setSahne(yeni);
  };
  // Ürün miktarını doğrudan (elle) ayarla — sipariş miktarını (çarpan dahil) aşamaz.
  const urunAdetSet = (uid: string, value: number) => {
    const node = nodeFind(sahne, uid);
    if (!node || node.tur !== "urun") return;
    let v = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    const k = urunler.find((x) => x.code === node.code);
    if (k) {
      const F = pathCarpan(sahne, uid); // bu ürüne uygulanan toplam paket çarpanı
      const digerFiziksel = paketlenmis(sahne, node.code) - node.qty * F; // bu düğüm hariç
      const maxV = F > 0 ? Math.floor((k.siparis - digerFiziksel) / F) : 0;
      if (v > maxV) {
        v = Math.max(0, maxV);
        show({ kind: "info", text: F > 1 ? `Sipariş miktarı aşılamaz — bu pakette en fazla ${v} (×${F})` : `Sipariş miktarı aşılamaz — en fazla ${v}` });
      }
    }
    setSahne((prev) => temizle(nodeMap(prev, uid, (n) => (n.tur === "urun" ? { ...n, qty: v } : n))));
  };
  // Ürün paket içi miktarı (QUANTITY) elle değiştirme — manuel müdahale → satır ISMANUEL=1.
  const urunIciSet = (uid: string, value: number) => {
    const v = Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : 0;
    if (v <= 0) { show({ kind: "info", text: "Paket içi miktar 0'dan büyük olmalı" }); return; }
    setSahne((prev) => nodeMap(prev, uid, (n) => (n.tur === "urun" ? { ...n, paketIci: v, elle: true } : n)));
  };
  const beklet = (uid: string) => map(uid, (n) => (n.tur === "koli" ? { ...n, beklemede: !n.beklemede } : n));

  const [barkodGiris, setBarkodGiris] = useState("");
  const [kameraAcik, setKameraAcik] = useState(false);
  const [barkodHatasi, setBarkodHatasi] = useState<string | null>(null);
  const hataTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hataTimeoutRef.current) clearTimeout(hataTimeoutRef.current);
    };
  }, []);

  const barkodHatasiGoster = (mesaj = "Barkodlar eşleşmiyor") => {
    if (hataTimeoutRef.current) clearTimeout(hataTimeoutRef.current);
    setBarkodHatasi(mesaj);
    show({ kind: "error", text: mesaj });
    hataTimeoutRef.current = setTimeout(() => {
      setBarkodHatasi(null);
    }, 3000);
  };

  const kaynakEkle = (code: string, parentUid: string | null) => {
    const k = urunler.find((x) => x.code === code);
    if (!k) return;
    let parent = parentUid;
    if (parent) { const p = nodeFind(sahne, parent); if (!p || p.tur === "urun") parent = null; }
    const F = pathCarpan(sahne, parent); // hedef kaptaki toplam paket çarpanı
    const kalanFiziksel = k.siparis - paketlenmis(sahne, code);
    if (kalanFiziksel < F) {
      return show({ kind: "info", text: F > 1 ? `Paket çarpanı ×${F} için yeterli adet kalmadı (kalan ${Math.max(0, kalanFiziksel)})` : "Bu üründen kalmadı" });
    }
    const qty = Math.floor(kalanFiziksel / F); // kap başına düşen adet
    const yeni: UrunNode = { uid: yid(), tur: "urun", code: k.code, name: k.name, qty, unit: k.unit, desi: k.desi, kg: k.kg, paketIci: k.paketIci, stokBirim: k.stokBirim, paketli: k.paketli, hazards: k.hazards, elle: k.elle };
    setSahne((prev) => nodeAddUrun(prev, parent, yeni));
    show({ kind: "ok", text: F > 1 ? `${k.name} (+${qty}×${F} = ${qty * F} ${k.unit}) eklendi` : `${k.name} (+${qty} ${k.unit}) eklendi` });
  };

  const barkodIsle = async (rawBarkod: string) => {
    const ham = (rawBarkod || "").trim();
    if (!ham) return;

    const sadelestir = (s: string) => s.trim().toLowerCase().replace(/^0+/, "");
    const hedef = sadelestir(ham);
    const hedefKucuk = ham.toLowerCase();

    // 1. Önce sayfadaki paketlenecek ürün listesinden doğrudan eşleştirme dene
    let eslesen = urunler.find(
      (u) => sadelestir(u.code) === hedef || u.code.trim().toLowerCase() === hedefKucuk
    );

    // 2. Doğrudan eşleşmediyse CANIAS barkod okuma servisi ile dene
    if (!eslesen) {
      try {
        const res = await wmsApi.readBarcode(
          ham,
          seciliEmir?.warehouse || packWh,
          seciliEmir?.stockPlace || ""
        );
        if (res && res.material) {
          const matHedef = sadelestir(res.material);
          const matKucuk = res.material.trim().toLowerCase();
          eslesen = urunler.find(
            (u) => sadelestir(u.code) === matHedef || u.code.trim().toLowerCase() === matKucuk
          );
        }
      } catch (err) {
        console.warn("readBarcode hatası:", err);
      }
    }

    // 3. Eşleşme yoksa ekrana 3 saniye kalan hata mesajı göster
    if (!eslesen) {
      barkodHatasiGoster("Barkodlar eşleşmiyor");
      setBarkodGiris("");
      return;
    }

    // 4. Eşleşme varsa sahneye / seçili kaba ekle
    if (hataTimeoutRef.current) clearTimeout(hataTimeoutRef.current);
    setBarkodHatasi(null);
    kaynakEkle(eslesen.code, seciliKapId);
    setBarkodGiris("");
  };

  // Verilen ağaçta herhangi bir ürün sipariş (MOVEDQTY) miktarını aşıyor mu? İlk aşanı döner.
  const siparisAsan = (tree: Node[]): KaynakUrun | null => {
    for (const k of urunler) {
      if (paketlenmis(tree, k.code) > k.siparis) return k;
    }
    return null;
  };

  const tasi = (uid: string, parentUid: string | null): boolean => {
    const src = nodeFind(sahne, uid);
    if (!src) return false;
    if (parentUid) {
      if (uid === parentUid) return false;
      const p = nodeFind(sahne, parentUid);
      if (!p || p.tur === "urun") return false;
      if (src.tur !== "urun" && iceriyorMu(src, parentUid)) return false;
    }
    const r = nodeRemove(sahne, uid);
    if (!r.alinan) return false;
    const yeniSahne = nodeAdd(r.list, parentUid, r.alinan);
    // Sipariş miktarı hiçbir şekilde aşılamaz (çarpan dahil fiziksel adet)
    const asan = siparisAsan(yeniSahne);
    if (asan) {
      show({ kind: "error", text: `${asan.name}: sipariş miktarı aşılıyor (max ${asan.siparis} ${asan.unit})` });
      return false;
    }
    setSahne(yeniSahne);
    return true;
  };

  const birak = (parentUid: string | null) => {
    setDropHedef(null);
    if (!drag) return;
    if (drag.kind === "kaynak") kaynakEkle(drag.code, parentUid);
    else if (tasi(drag.uid, parentUid)) show({ kind: "ok", text: "Taşındı" });
    drag = null;
  };

  // Paketlemeyi kaydetme (Bora, 02.10):
  //  - bitir : tam kontroller (boş koli, koli yok, palet zorunlu) → MZYCreateContainer + MZYSavePack → özet ekranı.
  //  - beklet: yarım paketleme olduğu gibi → MZYUpdateDlvPlan (ayrı servis; konteyner OLUŞTURMAZ,
  //            hesabın/XML'in doğru oluşup oluşmadığını CANIAS'ta görmeyi sağlar) → listeye dönülür.
  const kaydet = async (mod: "bitir" | "beklet") => {
    if (kaydediliyor) return;
    if (!seciliEmir) return show({ kind: "warn", text: "Sevkiyat seçili değil" });
    if (mod === "beklet") {
      if (sahne.length === 0) return show({ kind: "info", text: "Bekletilecek paketleme yok — alan boş" });
    } else {
      let bos = false;
      const kontrol = (ns: Node[]) => ns.forEach((n) => { if (n.tur === "koli") { if (urunSay(n) === 0) bos = true; kontrol(n.cocuklar); } else if (n.tur === "palet") kontrol(n.cocuklar); });
      kontrol(sahne);
      if (bos) return show({ kind: "warn", text: "Boş koli var — kaydedilemez" });
      if (kSay === 0) return show({ kind: "info", text: "Paketlenecek koli yok" });
      // Palet zorunlu müşteri kontrolü (AKLISPALLETMUST=1)
      if (urunler.some((u) => u.paletZorunlu) && pSay === 0) {
        return show({ kind: "warn", text: "Bu sipariş palet ile gönderilmeli — en az bir palet ekleyin" });
      }
    }
    // Güvenlik: hiçbir ürün sipariş miktarını aşmasın (iki modda da)
    const asan = siparisAsan(sahne);
    if (asan) return show({ kind: "error", text: `${asan.name}: sipariş miktarı aşılıyor (max ${asan.siparis} ${asan.unit})` });

    const xml = buildPackXml(sahne, {
      company: seciliEmir.company || compCode,
      plant: seciliEmir.plant || plantCode,
    });

    setKaydediliyor(mod);
    try {
      if (mod === "beklet") {
        await wmsApi.updateDlvPlan({
          company: seciliEmir.company || compCode,
          plant: seciliEmir.plant || plantCode,
          delNum: seciliEmir.delNum,
          startTime: baslamaZamani,
          orderType: seciliEmir.orderType,
          orderNum: seciliEmir.orderNum,
          xml,
        });
        show({ kind: "info", text: "Paketleme beklemeye alındı. Listeye dönülüyor…" });
        setTimeout(() => navigate("/packaging"), 1200);
        return;
      }
      const sonuc = await wmsApi.savePack({
        company: seciliEmir.company || compCode,
        plant: seciliEmir.plant || plantCode,
        warehouse: seciliEmir.warehouse || packWh,
        delNum: seciliEmir.delNum,
        startTime: baslamaZamani,
        orderType: seciliEmir.orderType,
        orderNum: seciliEmir.orderNum,
        xml,
      });
      setBitti(true);
      show({ kind: "done", text: sonuc.containerId ? `Konteyner ${sonuc.containerId} — ${kSay} koli · ${pSay} palet kaydedildi` : `${kSay} koli · ${pSay} palet kaydedildi` });
    } catch (e) {
      show({ kind: "error", text: e instanceof Error ? e.message : (mod === "beklet" ? "Paketleme bekletilemedi" : "Paketleme kaydedilemedi") });
    } finally {
      setKaydediliyor(null);
    }
  };


  const api: Api = {
    seciliKapId,
    setSeciliKapId,
    sil,
    urunAdet,
    urunAdetSet,
    urunIciSet,
    hacim,
    carpanla,
    beklet,
    dropHedef,
    setDropHedef,
    birak,
    koliDuzenle: (uid: string) => setDuzenlenenKoliUid(uid),
  };

  const duzenlenenKoli = duzenlenenKoliUid
    ? (nodeFind(sahne, duzenlenenKoliUid) as KoliNode | null)
    : null;
  const duzenlenenUrun = duzenlenenUrunCode ? urunler.find((u) => u.code === duzenlenenUrunCode) ?? null : null;

  return (
    <div className="w-full px-1.5 py-3 lg:py-4">
      <PageHeader title="Paketleme" subtitle="Paketleme alanı › Palet › Koli › Ürün" backTo="/packaging" />

      {bitti && (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-2xl border border-emerald-400 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10 sm:flex-row sm:items-center">
          <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="flex-1 text-sm font-bold text-emerald-800 dark:text-emerald-200">Paketleme tamamlandı — {kSay} koli, {pSay} palet, {fmt(genelKg)} kg.</p>
          <button type="button" onClick={() => setBitti(false)} className="btn-ghost btn-sm">Devam et</button>
        </div>
      )}

      {/* ÜST ARAÇ ÇUBUĞU — tek satır */}
      <div className="card mt-3 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
              onClick={() => kaydet("beklet")}
              disabled={kaydediliyor !== null}
              className="inline-flex h-9 w-[130px] items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-subtle transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:scale-95 disabled:opacity-60 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
              title="Yarım paketlemenin hesabını CANIAS'a kaydet ve listeye dön (MZYUpdateDlvPlan — konteyner oluşturmaz)"
            >
              {kaydediliyor === "beklet" ? <RotateCw className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              <span>{kaydediliyor === "beklet" ? "Bekletiliyor…" : "Beklet"}</span>
            </button>
            <button type="button" onClick={() => kaydet("bitir")} disabled={kaydediliyor !== null} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-60">{kaydediliyor === "bitir" ? <RotateCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} {kaydediliyor === "bitir" ? "Kaydediliyor…" : "Paketlemeyi Bitir"}</button>
          </div>
        </div>
      </div>

      {/* 3 Saniye Kalan Barkod Eşleşmeme Hata Mesajı */}
      {barkodHatasi && (
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-600 shadow-sm animate-in fade-in slide-in-from-top-1 dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
            <span>{barkodHatasi}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (hataTimeoutRef.current) clearTimeout(hataTimeoutRef.current);
              setBarkodHatasi(null);
            }}
            className="text-xs font-semibold underline hover:opacity-80"
          >
            Kapat
          </button>
        </div>
      )}

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
                <span><b className="font-mono text-sm font-extrabold text-fg">{genelDesi}</b> desi <span className="font-mono text-[10px] font-semibold text-subtle" title="Ham hacim (yuvarlanmamış) — her miktar değişimi birim hacim kadar burada görünür">({fmt(genelHacim)})</span></span>
                <span><b className="font-mono text-sm font-extrabold text-fg">{fmt(genelKg)}</b> kg</span>
                <button type="button" onClick={hesabiYenile} title="Hesaplamayı yenile" className="ml-1 rounded-lg border border-line bg-surface p-1 text-subtle transition hover:text-brand-600 active:scale-95"><RotateCw className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setXmlAcik(true)} title="CANIAS'a gidecek veriyi önizle (XML)" className="rounded-lg border border-line bg-surface px-1.5 py-1 text-[10px] font-black text-subtle transition hover:text-brand-600 active:scale-95">XML</button>
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
            {/* Malzeme Ekle — Barkod ile hızlı ekleme */}
            <form
              onSubmit={(e) => { e.preventDefault(); barkodIsle(barkodGiris); }}
              className={`flex items-center gap-1.5 border-b px-3 py-2 transition ${barkodHatasi ? "border-red-400 bg-red-50/70 dark:border-red-500/50 dark:bg-red-500/10" : "border-line bg-brand-50/50 dark:bg-brand-500/10"}`}
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={barkodGiris}
                  onChange={(e) => setBarkodGiris(e.target.value)}
                  placeholder="Barkod ile malzeme ekle"
                  className="h-8 w-full rounded-lg border border-brand-200/80 bg-white pl-2.5 pr-8 text-xs font-medium text-fg placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-brand-500/30 dark:bg-card"
                />
                <button
                  type="submit"
                  title="Enter (Barkodu Onayla)"
                  aria-label="Enter"
                  disabled={!barkodGiris.trim()}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-brand-600 transition hover:bg-brand-100 hover:text-brand-800 disabled:opacity-30 dark:text-brand-300 dark:hover:bg-brand-500/25"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setKameraAcik(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-200/80 bg-white text-brand-700 transition hover:bg-brand-100 hover:text-brand-800 active:scale-95 dark:border-brand-500/30 dark:bg-card dark:text-brand-300 dark:hover:bg-brand-500/25"
                title="Kamera ile barkod okut"
              >
                <Camera className="h-4 w-4" />
              </button>
            </form>
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
                [...urunler].sort((a, b) => (Math.max(0, a.siparis - paketlenmis(sahne, a.code)) === 0 ? 1 : 0) - (Math.max(0, b.siparis - paketlenmis(sahne, b.code)) === 0 ? 1 : 0)).map((k) => {
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
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDuzenlenenUrunCode(k.code); }} title="Birim hacim/ağırlığı düzenle (oturum içi)" className="mt-0.5 inline-flex items-center gap-1 rounded font-mono text-[10px] font-semibold text-subtle transition hover:text-brand-600">
                            <Pencil className="h-2.5 w-2.5" /> Birim: {fmt(k.desi)} ds · {fmt(k.kg)} kg
                          </button>
                        </div>
                        {bittiK && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-1 font-mono font-black ${bittiK ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"}`} title="Kalan miktar">
                            <span className="text-sm">{kalan}</span>
                            <span className="text-[10px] font-bold">{k.unit}</span>
                          </span>
                          <span className="font-mono text-[10px] font-semibold text-subtle" title="Toplam sipariş miktarı">/ {k.siparis}</span>
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

      {kameraAcik && (
        <CameraScanOverlay
          onDetected={(kod) => {
            setKameraAcik(false);
            barkodIsle(kod);
          }}
          onClose={() => setKameraAcik(false)}
          prompt="Malzeme Barkodu Okutun"
        />
      )}

      {duzenlenenKoli && (
        <KoliDuzenleModal
          koli={duzenlenenKoli}
          onKaydet={({ desi, kg }) => {
            setSahne((prev) => nodeMap(prev, duzenlenenKoli.uid, (n) => (n.tur === "koli" ? { ...n, elleDesi: desi, elleKg: kg, elle: true } : n)));
            show({ kind: "ok", text: `Koli güncellendi — ${yuvarlaDesi(desi)} DS · ${fmt(kg)} kg (manuel)` });
            setDuzenlenenKoliUid(null);
          }}
          onSifirla={() => {
            setSahne((prev) => nodeMap(prev, duzenlenenKoli.uid, (n) => (n.tur === "koli" ? { ...n, elleDesi: undefined, elleKg: undefined, elle: false } : n)));
            show({ kind: "info", text: "Koli otomatik hesaba döndürüldü" });
            setDuzenlenenKoliUid(null);
          }}
          onKapat={() => setDuzenlenenKoliUid(null)}
        />
      )}

      {duzenlenenUrun && (
        <BirimDuzenleModal
          urun={duzenlenenUrun}
          onKaydet={(desi, kg) => { birimGuncelle(duzenlenenUrun.code, desi, kg); setDuzenlenenUrunCode(null); }}
          onKapat={() => setDuzenlenenUrunCode(null)}
        />
      )}

      {xmlAcik && (
        <XmlOnizlemeModal
          xml={buildPackXml(sahne, { company: seciliEmir?.company || compCode, plant: seciliEmir?.plant || plantCode })}
          ozet={{ palet: pSay, koli: kSay, desi: genelDesi, kg: genelKg, emir: seciliEmir ? `${seciliEmir.orderType}-${seciliEmir.orderNum}` : "—", depo: sevkWh || "TANIMSIZ" }}
          onKapat={() => setXmlAcik(false)}
        />
      )}

      <ToastView toast={toast} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// KOLİ BOYUTLARI DÜZENLEME EKRANI (SADECE SEÇİLİ KOLİ İÇİN BOYUT DÜZENLEME)
// Sağ üstte: 'Paketlemeye Geri Dön' tuşu. Sol üstte: Geri dön tuşu YOK.
// Depocu monitörden klavyeyle En, Boy ve Yükseklik değerlerini doğrudan yazar.
// Sadece tıklanmış olan o tek koli güncellenir, diğer koliler etkilenmez.
// -----------------------------------------------------------------------------

interface KoliDuzenleData { desi: number; kg: number; }

// -----------------------------------------------------------------------------
// KOLİ MANUEL DÜZENLEME — POP-UP (MODAL)
// Kullanıcı ÖLÇÜ (en/boy/yükseklik) değil, doğrudan DESİ ve AĞIRLIK girer (manuel müdahale).
// Değerler tek koli başınadır; paket çarpanı (×N) ile toplam otomatik hesaplanır.
// "Otomatiğe dön" ile manuel değerler silinir, içerik bazlı hesaba geri dönülür.
// -----------------------------------------------------------------------------
function KoliDuzenleModal({ koli, onKaydet, onSifirla, onKapat }: { koli: KoliNode; onKaydet: (d: KoliDuzenleData) => void; onSifirla: () => void; onKapat: () => void; }) {
  const otoDesi = yuvarlaDesi(cocuk(koli).reduce((s, c) => s + nodeHacimHam(c), 0)) || koliKendiDesi(koli);
  const otoKg = Number((cocuk(koli).reduce((s, c) => s + nodeKg(c), 0) + koliDara(koli)).toFixed(3));

  const [desi, setDesi] = useState<number | string>(koli.elleDesi ?? otoDesi);
  const [kg, setKg] = useState<number | string>(koli.elleKg ?? otoKg);
  const numDesi = Number(desi) > 0 ? Number(desi) : 0;
  const numKg = Number(kg) >= 0 ? Number(kg) : 0;
  const elleMi = koli.elleDesi != null || koli.elleKg != null;
  const carpan = carpanOf(koli);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onKapat}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-fg">Desi &amp; Ağırlık</h2>
            <span className="rounded-lg border border-line bg-elevated px-2 py-0.5 font-mono text-xs font-bold text-brand-600 dark:text-brand-300">{koli.kod || `Koli ${boyutKodu(koli.no)}`}</span>
          </div>
          <button type="button" onClick={onKapat} className="rounded-lg p-1 text-subtle transition hover:bg-elevated hover:text-fg" aria-label="Kapat"><X className="h-5 w-5" /></button>
        </div>

        <p className="mb-4 text-xs text-subtle">
          Tek koli başına değerleri elle girin — ölçü değil, doğrudan desi ve ağırlık.
          {carpan > 1 ? ` Paket çarpanı ×${carpan} ile toplam otomatik çarpılır.` : ""}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-fg">Desi (DS)</label>
            <input type="number" min="0" step="1" value={desi} onChange={(e) => setDesi(e.target.value === "" ? "" : parseFloat(e.target.value))} className="w-full rounded-xl border border-line bg-elevated px-3.5 py-2.5 font-mono text-base font-bold text-fg transition focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20" autoFocus />
            <p className="mt-1 text-[10px] text-subtle">Otomatik: {otoDesi} DS</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-fg">Ağırlık (KG)</label>
            <input type="number" min="0" step="0.001" value={kg} onChange={(e) => setKg(e.target.value === "" ? "" : parseFloat(e.target.value))} className="w-full rounded-xl border border-line bg-elevated px-3.5 py-2.5 font-mono text-base font-bold text-fg transition focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            <p className="mt-1 text-[10px] text-subtle">Otomatik: {fmt(otoKg)} kg</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={onSifirla} disabled={!elleMi} className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-subtle transition hover:text-fg active:scale-95 disabled:opacity-40">Otomatiğe dön</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onKapat} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-elevated hover:text-fg active:scale-95">İptal</button>
            <button type="button" onClick={() => onKaydet({ desi: numDesi, kg: numKg })} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 active:scale-95"><Check className="h-4 w-4" /> Kaydet</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Birim hacim/ağırlık düzenleme modalı (oturum içi) — hesabı test etme / yanlış veriyi düzeltme için.
function BirimDuzenleModal({ urun, onKaydet, onKapat }: { urun: KaynakUrun; onKaydet: (desi: number, kg: number) => void; onKapat: () => void; }) {
  const [desi, setDesi] = useState<number | string>(urun.desi);
  const [kg, setKg] = useState<number | string>(urun.kg);
  const nd = Number(desi) >= 0 ? Number(desi) : 0;
  const nk = Number(kg) >= 0 ? Number(kg) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onKapat}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black text-fg">{urun.name}</h2>
            <p className="font-mono text-xs font-bold text-subtle">{urun.code} · birim: {urun.stokBirim}</p>
          </div>
          <button type="button" onClick={onKapat} className="rounded-lg p-1 text-subtle transition hover:bg-elevated hover:text-fg" aria-label="Kapat"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-xs text-subtle">Stok birimi başına birim hacim (desi) ve ağırlık (kg). Değişiklik yalnızca bu oturumda geçerlidir; CANIAS malzeme kartına yazılmaz. Kaydedince tüm hesaplar yenilenir.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-fg">Birim Hacim (DS)</label>
            <input type="number" min="0" step="0.01" value={desi} onChange={(e) => setDesi(e.target.value === "" ? "" : parseFloat(e.target.value))} className="w-full rounded-xl border border-line bg-elevated px-3.5 py-2.5 font-mono text-base font-bold text-fg transition focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20" autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-fg">Birim Ağırlık (KG)</label>
            <input type="number" min="0" step="0.001" value={kg} onChange={(e) => setKg(e.target.value === "" ? "" : parseFloat(e.target.value))} className="w-full rounded-xl border border-line bg-elevated px-3.5 py-2.5 font-mono text-base font-bold text-fg transition focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onKapat} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-elevated hover:text-fg active:scale-95">İptal</button>
          <button type="button" onClick={() => onKaydet(nd, nk)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 active:scale-95"><Check className="h-4 w-4" /> Kaydet</button>
        </div>
      </div>
    </div>
  );
}

// CANIAS'a gidecek paketleme verisinin (PSPACKITEMXML) önizlemesi — test/kontrol için.
function XmlOnizlemeModal({ xml, ozet, onKapat }: { xml: string; ozet: { palet: number; koli: number; desi: number; kg: number; emir: string; depo: string }; onKapat: () => void; }) {
  const kopyala = () => { try { navigator.clipboard?.writeText(xml); } catch { /* yok say */ } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onKapat}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-fg">Gönderilecek Veri — Önizleme</h2>
          <button type="button" onClick={onKapat} className="rounded-lg p-1 text-subtle transition hover:bg-elevated hover:text-fg" aria-label="Kapat"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-fg">
          <span className="rounded-lg bg-elevated px-2 py-1">Emir: <b className="font-mono">{ozet.emir}</b></span>
          <span className="rounded-lg bg-elevated px-2 py-1" title="Sevkiyat konteynerinin oluşturulacağı depo (numarayı CANIAS üretir)">Sevkiyat deposu: <b className="font-mono">{ozet.depo}</b></span>
          <span className="rounded-lg bg-elevated px-2 py-1"><b className="font-mono">{ozet.palet}</b> palet</span>
          <span className="rounded-lg bg-elevated px-2 py-1"><b className="font-mono">{ozet.koli}</b> koli</span>
          <span className="rounded-lg bg-elevated px-2 py-1"><b className="font-mono">{ozet.desi}</b> desi</span>
          <span className="rounded-lg bg-elevated px-2 py-1"><b className="font-mono">{fmt(ozet.kg)}</b> kg</span>
        </div>
        <pre className="flex-1 overflow-auto rounded-xl border border-line bg-elevated/50 p-3 font-mono text-[10px] leading-relaxed text-fg whitespace-pre-wrap break-all">{xml}</pre>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={kopyala} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition hover:bg-elevated active:scale-95">Kopyala</button>
          <button type="button" onClick={onKapat} className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 active:scale-95">Kapat</button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
interface Api {
  seciliKapId: string | null;
  setSeciliKapId: (v: string | null) => void;
  sil: (uid: string) => void;
  urunAdet: (uid: string, d: number) => void;
  urunAdetSet: (uid: string, value: number) => void;
  urunIciSet: (uid: string, value: number) => void;
  hacim: (uid: string, v: number) => void;
  carpanla: (uid: string, delta: number) => void;
  beklet: (uid: string) => void;
  dropHedef: string | null;
  setDropHedef: (v: string | null) => void;
  birak: (parentUid: string | null) => void;
  koliDuzenle: (uid: string) => void;
}

// Paket miktarı (çarpan) kontrolü — aynı içerikten kaç adet paket olduğu.
// Desi, ağırlık ve ürün miktarı bu sayı ile çarpılır.
function CarpanKontrol({ node, api }: { node: KoliNode | PaletNode; api: Api }) {
  const c = Math.max(1, Math.round(node.carpan ?? 1));
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      title="Tekrar (paketleme) miktarı — bu koli/paletten kaç tane (aynı yapı). Üst kap çarpanı olarak iner."
      className={`inline-flex items-center gap-0.5 rounded-lg border px-0.5 py-0.5 ${c > 1 ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/15" : "border-line bg-surface"}`}
    >
      <button type="button" onClick={(e) => { e.stopPropagation(); api.carpanla(node.uid, -1); }} disabled={c <= 1} className="flex h-6 w-6 items-center justify-center rounded-md text-subtle transition hover:bg-elevated hover:text-fg active:scale-95 disabled:opacity-30" aria-label="Tekrar miktarı azalt">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className={`min-w-[2.1rem] text-center font-mono text-xs font-black tabular-nums ${c > 1 ? "text-brand-700 dark:text-brand-300" : "text-fg"}`}>×{c}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); api.carpanla(node.uid, 1); }} className="flex h-6 w-6 items-center justify-center rounded-md text-subtle transition hover:bg-elevated hover:text-fg active:scale-95" aria-label="Tekrar miktarı artır">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function KartNode({ node, api, parentTur, faktor = 1 }: { node: Node; api: Api; parentTur?: "sahne" | "palet" | "koli"; faktor?: number }) {
  if (node.tur === "urun") return <UrunKart urun={node} api={api} parentTur={parentTur} faktor={faktor} />;
  if (node.tur === "palet") return <PaletKart palet={node} api={api} faktor={faktor} />;
  return <KoliKart koli={node} api={api} parentTur={parentTur} faktor={faktor} />;
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

function PaletKart({ palet, api, faktor = 1 }: { palet: PaletNode; api: Api; faktor?: number }) {
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
          </div>
        </div>
        <CarpanKontrol node={palet} api={api} />
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
                {solKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="palet" faktor={faktor * carpanOf(palet)} />)}
              </div>
              {/* Sağ Sütun (Bağımsız) */}
              <div className="flex flex-1 min-w-0 flex-row flex-wrap content-start items-start gap-[4px]">
                {sagKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="palet" faktor={faktor * carpanOf(palet)} />)}
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

function KoliKart({ koli, api, parentTur, faktor = 1 }: { koli: KoliNode; api: Api; parentTur?: "sahne" | "palet" | "koli"; faktor?: number }) {
  const [acik, setAcik] = useState(true);
  const b = boyutBul(koli.no);
  const secili = api.seciliKapId === koli.uid;
  const drop = api.dropHedef === koli.uid;
  const kDesi = koliKendiDesi(koli);
  const icDesiHam = koliIcerikDesi(koli);
  const icDesiYuvarlanmis = yuvarlaDesi(icDesiHam);
  const toplamKg = nodeKg(koli);
  const daraKg = koliDara(koli);
  const carpan = carpanOf(koli);
  const toplamDesi = nodeDesi(koli); // kDesi × carpan
  const dolu = koli.hacim > 0 ? (icDesiHam / koli.hacim) * 100 : 0;
  const atil = koli.atil;
  const inContainer = parentTur === "palet" || parentTur === "koli";
  const genislik = boyutGenislik(koli.elleDesi ?? (yuvarlaDesi(icDesiHam) || kDesi));

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
      style={!inContainer ? { minWidth: genislik, maxWidth: genislik } : undefined}
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
                <span className="truncate text-xs font-bold text-fg">{atil ? "Atıl Koli" : koli.kod || `Koli ${boyutKodu(koli.no)}`}</span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <CarpanKontrol node={koli} api={api} />
                <SilButon onSil={() => api.sil(koli.uid)} className="rounded-lg p-1.5 text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10" iconCls="h-4 w-4" />
              </div>
            </div>

            <div className="mt-1 flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-fg">
                <span>{koli.kod || `Boyut ${koli.no}`}</span>
                {(koli.ol || boyutOl(koli.no)) && <span>{koli.ol || boyutOl(koli.no)} cm</span>}
                <span className="rounded bg-brand-100/80 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                  {kDesi} DS
                </span>
              </div>
              <div className="flex items-center gap-1">
                <p className="font-mono text-[10px] font-bold text-fg flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{urunSay(koli)} ürün</span>
                  {carpan > 1 && <span className="rounded bg-brand-100 px-1 text-[9px] font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">×{carpan}</span>}
                  <span title={`Toplam desi: ${toplamDesi} ds${carpan > 1 ? ` (${kDesi} × ${carpan})` : ""} · İçerik: ${icDesiYuvarlanmis} ds`}>{toplamDesi} ds</span>
                  <span title={`Toplam brüt ağırlık: ${fmt(toplamKg)} kg${carpan > 1 ? ` (${carpan} koli, dara dahil)` : ""} · Koli darası: ${fmt(daraKg)} kg`}>{fmt(toplamKg)} kg</span>
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    api.koliDuzenle(koli.uid);
                  }}
                  className="rounded p-0.5 text-subtle transition hover:bg-elevated hover:text-fg active:scale-95"
                  title="Boyutları Düzenle"
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
                <span>{atil ? "Atıl Koli" : koli.kod || `Koli ${boyutKodu(koli.no)}`}</span>
                <span className="text-xs font-bold text-fg flex items-center gap-2">
                  <span>{koli.kod || `Boyut ${koli.no}`}</span>
                  {(koli.ol || boyutOl(koli.no)) && <span>{koli.ol || boyutOl(koli.no)} cm</span>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-[11px] font-bold text-fg flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{urunSay(koli)} ürün</span>
                  {carpan > 1 && <span className="rounded bg-brand-100 px-1 text-[9px] font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" title="Paket çarpanı">×{carpan}</span>}
                  {koli.elleDesi != null && <span className="rounded bg-amber-100 px-1 text-[9px] font-black text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" title="Desi/ağırlık elle girildi">manuel</span>}
                  <span className="text-subtle" title="Koli ebat kapasitesi">kap {kDesi} ds</span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <CarpanKontrol node={koli} api={api} />
              <SilButon onSil={() => api.sil(koli.uid)} className="rounded-lg p-1.5 text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10" iconCls="h-4 w-4" />
            </div>
          </div>
        )}

        {!isNestedKoli && (
          <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-black/5 pt-1.5 dark:border-white/10">
            <button type="button" onClick={(e) => { e.stopPropagation(); api.koliDuzenle(koli.uid); }} title="Desi / ağırlığı düzenle" className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-subtle transition hover:border-brand-300 hover:text-brand-600 active:scale-95">
              <Pencil className="h-3.5 w-3.5" /> Düzenle
            </button>
            <div className="flex items-baseline gap-3 font-mono leading-none">
              <span className="text-xl font-black text-fg" title={`Toplam desi${carpan > 1 ? ` (×${carpan} dahil)` : ""}`}>{toplamDesi}<span className="ml-0.5 text-[11px] font-bold text-subtle">ds</span></span>
              <span className="text-[10px] font-semibold text-subtle" title="Ham hacim (yuvarlanmamış)">({fmt(nodeHacimHam(koli))})</span>
              <span className="text-xl font-black text-fg" title={`Toplam brüt ağırlık${carpan > 1 ? ` (×${carpan} dahil)` : ""} · Dara: ${fmt(daraKg)} kg`}>{fmt(toplamKg)}<span className="ml-0.5 text-[11px] font-bold text-subtle">kg</span></span>
            </div>
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-2" title={`Doluluk: %${Math.round(dolu)} (İçerik: ${icDesiYuvarlanmis} DS / Kapasite: ${kDesi} DS)`}>
          <span className="flex items-center gap-1 text-[11px] font-bold text-fg"><Weight className="h-3.5 w-3.5" /> Doluluk</span>
          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div className={`h-full rounded-full ${dolu > 100 ? "bg-rose-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, dolu)}%` }} />
          </div>
          <span className={`font-mono text-[10px] font-bold ${dolu > 100 ? "text-rose-500" : "text-amber-500"}`}>%{Math.round(dolu)}</span>
        </div>

        {(() => {
          const aktif = koliHazards(koli);
          if (aktif.length === 0) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-1" title="Ürün özelliklerinden otomatik">
              {HAZARDS.filter((h) => aktif.includes(h.id)).map((h) => {
                const Icon = h.icon;
                return (
                  <span key={h.id} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${h.cls}`}>
                    <Icon className="h-3 w-3" /> {h.label}
                  </span>
                );
              })}
            </div>
          );
        })()}
      </div>

      {acik && (
        <div className="mt-[2px] max-h-[360px] overflow-y-auto rounded-xl border border-dashed border-slate-300/70 dark:border-slate-600/50 bg-elevated/30 px-[3px] py-1.5">
          {koli.cocuklar.length === 0 ? (
            <p className="w-full py-3 text-center text-[11px] text-subtle">Boş koli</p>
          ) : (
            <div className="flex items-start gap-[3px]">
              {/* Sol Sütun (Bağımsız) */}
              <div className="flex flex-1 min-w-0 flex-col gap-[3px]">
                {solKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="koli" faktor={faktor * carpanOf(koli)} />)}
              </div>
              {/* Sağ Sütun (Bağımsız) */}
              <div className="flex flex-1 min-w-0 flex-col gap-[3px]">
                {sagKolon.map((c) => <KartNode key={c.uid} node={c} api={api} parentTur="koli" faktor={faktor * carpanOf(koli)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UrunKart({ urun, api, parentTur, faktor = 1 }: { urun: UrunNode; api: Api; parentTur?: "sahne" | "palet" | "koli"; faktor?: number }) {
  const isPalet = parentTur === "palet";
  const [draft, setDraft] = useState(String(urun.qty));
  useEffect(() => { setDraft(String(urun.qty)); }, [urun.qty]);
  const commit = () => {
    const v = parseInt(draft, 10);
    api.urunAdetSet(urun.uid, Number.isNaN(v) ? 0 : v);
  };
  const [iciDraft, setIciDraft] = useState(String(urun.paketIci));
  useEffect(() => { setIciDraft(String(urun.paketIci)); }, [urun.paketIci]);
  const iciCommit = () => {
    const v = parseFloat(iciDraft.replace(",", "."));
    if (!Number.isFinite(v) || v === urun.paketIci) { setIciDraft(String(urun.paketIci)); return; }
    api.urunIciSet(urun.uid, v);
  };
  const etiket = "block text-[9px] font-black uppercase tracking-wide text-subtle";
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
      <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1">
        {/* 1) Ürün Paket İçi Miktar (QUANTITY) */}
        <div>
          <span className={etiket} title="Ürün Paket İçi Miktar (XML: QUANTITY)">İçi</span>
          <input
            type="text"
            inputMode="decimal"
            value={iciDraft}
            onChange={(e) => setIciDraft(e.target.value.replace(/[^0-9.,]/g, ""))}
            onFocus={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
            onClick={(e) => e.stopPropagation()}
            onBlur={iciCommit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
            className={`h-6 w-12 rounded-md border bg-surface px-1 text-center font-mono text-sm font-black text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${urun.elle ? "border-amber-400" : "border-line"}`}
            title={urun.elle ? "Elle değiştirildi (ISMANUEL=1)" : "Ürün paket içi miktarı — elle değiştirilebilir"}
          />
        </div>
        {/* 2) Ürün Paket Miktarı (PACKQTY) */}
        <div>
          <span className={etiket} title="Ürün Paket Miktarı (XML: PACKQTY)">Paket</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); api.urunAdet(urun.uid, -1); }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-rose-300 text-rose-500 transition hover:bg-rose-50 active:scale-95 dark:hover:bg-rose-500/10"><Minus className="h-3.5 w-3.5" /></button>
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => { e.stopPropagation(); e.currentTarget.select(); }}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
            className="h-6 w-14 rounded-md border border-line bg-surface px-1 text-center font-mono text-sm font-black text-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            title="Miktarı elle gir (sipariş miktarını aşamaz)"
          />
          <button type="button" onClick={(e) => { e.stopPropagation(); api.urunAdet(urun.uid, +1); }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-300 text-emerald-600 transition hover:bg-emerald-50 active:scale-95 dark:hover:bg-emerald-500/10"><Plus className="h-3.5 w-3.5" /></button>
          <span className={`ml-0.5 text-[10px] font-bold ${urun.paketli ? "text-slate-900" : "text-fg"}`}>{urun.unit}</span>
        </div>
        </div>
        {/* 3) Bağlı Paket Miktarı / Paket Sayısı (PARENTPACKQTY) — kolinin ×N değerinden gelir */}
        <div>
          <span className={etiket} title="Bağlı Paket Miktarı / Paket Sayısı (XML: PARENTPACKQTY)">Bağlı</span>
          <span className={`flex h-6 min-w-[2.5rem] items-center justify-center rounded-md border border-dashed px-1.5 font-mono text-sm font-black ${faktor > 1 ? "border-amber-400 text-amber-700 dark:text-amber-300" : "border-line text-fg"}`} title="Kolinin/paletin ×N paket sayısından gelir; değiştirmek için kolideki ×N'yi kullanın">×{faktor}</span>
        </div>
        <SilButon onSil={() => api.sil(urun.uid)} className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10" iconCls="h-3 w-3" />
      </div>
      <p className="mt-0.5 font-mono text-[9px] font-semibold text-subtle" title="Toplam stok adedi = İçi × Paket × Bağlı">
        = {fmt(urun.paketIci)} × {fmt(urun.qty)} × {faktor} = {fmt(urun.paketIci * urun.qty * faktor)} stok
      </p>
    </div>
  );
}

// Silmeden önce onay + 3 sn geri sayım (yanlışlıkla silmeyi önler)
function SilButon({ onSil, className, iconCls = "h-3.5 w-3.5" }: { onSil: () => void; className?: string; iconCls?: string }) {
  // Yanlislikla silmeye karsi tek adim onay (Evet / Iptal) — geri sayim yok.
  const [onay, setOnay] = useState(false);
  if (!onay) {
    return (
      <button type="button" title="Sil" onClick={(e) => { e.stopPropagation(); setOnay(true); }} className={className ?? "flex h-7 w-7 items-center justify-center rounded-md text-subtle transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:hover:bg-rose-500/10"}>
        <Trash2 className={iconCls} />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" title="Sil" onClick={(e) => { e.stopPropagation(); onSil(); setOnay(false); }} className="inline-flex h-7 items-center gap-1 rounded-md bg-rose-600 px-2.5 text-[11px] font-bold text-white transition hover:bg-rose-700 active:scale-95">
        <Check className="h-3.5 w-3.5" /> Evet
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOnay(false); }} className="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2.5 text-[11px] font-bold text-subtle transition hover:text-fg active:scale-95">İptal</button>
    </span>
  );
}
