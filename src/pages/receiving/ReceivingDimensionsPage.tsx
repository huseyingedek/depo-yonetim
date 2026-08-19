import { useState } from "react";
import { useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  Save,
  ArrowLeft,
  Loader2,
  Flame,
  Droplets,
  GlassWater,
  Skull,
  Clock,
} from "lucide-react";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";

export default function ReceivingDimensionsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const stateData = location.state || {};
  const vendorCode = searchParams.get("vendor") || stateData.vendor || id || "800980";
  const vendorName = searchParams.get("vendorName") || stateData.vendorName || "Tedarikçi";
  const waybillNo = searchParams.get("waybill") || stateData.waybillNo || "";
  const targetWH = searchParams.get("targetWH") || stateData.targetWarehouse || "";

  const material = stateData.material || "";
  const materialName = stateData.name || "Malzeme";
  const materialUnit = stateData.unit || "AD";
  const materialImage = stateData.image || "";
  const barcodes = stateData.barcodes || [];
  const selectedBarcode = stateData.selectedBarcode || "";
  const openOrders = stateData.openOrders || [];
  const receivedItems = stateData.items || [];

  const initialForm = stateData.matSizeForm || {
    pwidth: 0,
    plength: 0,
    pheight: 0,
    lunit: "CM",
    volume: 0,
    vunit: "M3",
    netweight: 0,
    nwunit: "KG",
    brutweight: 0,
    bwunit: "KG",
    isexplos: false,
    isspoil: false,
    aklisbreakable: false,
    aklisliquid: false,
    aklistoxic: false,
    aklpalpos: 1,
  };

  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const { toast, show } = useToast();

  const handleNumChange = (field: string, valStr: string) => {
    const sanitized = valStr.replace(",", ".");
    const num = Number(sanitized) || 0;
    setForm((prev: any) => {
      const next = { ...prev, [field]: num };
      // En x Boy x Yükseklik girildiyse otomatik hacim (m3) hesapla
      if (field === "pwidth" || field === "plength" || field === "pheight") {
        const w = field === "pwidth" ? num : prev.pwidth;
        const l = field === "plength" ? num : prev.plength;
        const h = field === "pheight" ? num : prev.pheight;
        if (w > 0 && l > 0 && h > 0) {
          next.volume = Number(((w * l * h) / 1000000).toFixed(4));
        }
      }
      return next;
    });
  };

  const backUrl = `/receiving/${encodeURIComponent(vendorCode)}?waybill=${encodeURIComponent(
    waybillNo
  )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
    vendorCode
  )}&vendorName=${encodeURIComponent(vendorName)}`;

  const handleCancel = () => {
    navigate(backUrl, {
      state: {
        items: receivedItems,
        waybillNo,
        targetWarehouse: targetWH,
        vendor: vendorCode,
        vendorName,
        currentMaterial: stateData.currentMaterial,
        openOrders,
        matSizeForm: form,
      },
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!material) {
      show({ kind: "err", text: "Malzeme kodu bulunamadı." });
      return;
    }

    if (form.pwidth <= 0 || form.plength <= 0 || form.pheight <= 0) {
      show({
        kind: "err",
        text: "Lütfen En, Boy ve Yükseklik ölçülerini (0'dan büyük) giriniz.",
      });
      sesHata();
      return;
    }

    if (form.brutweight <= 0 && form.netweight <= 0) {
      show({
        kind: "err",
        text: "Lütfen en az bir geçerli Ağırlık değeri giriniz.",
      });
      sesHata();
      return;
    }

    setIsSaving(true);

    try {
      const netWeight = form.netweight > 0 ? form.netweight : form.brutweight;
      const brutWeight = form.brutweight > 0 ? form.brutweight : form.netweight;
      const calcVol =
        form.volume > 0
          ? form.volume
          : Number(((form.pwidth * form.plength * form.pheight) / 1000000).toFixed(4));

      const payload = {
        material,
        pwidth: form.pwidth,
        plength: form.plength,
        pheight: form.pheight,
        vunit: form.vunit || "M3",
        volume: calcVol,
        netweight: netWeight,
        nwunit: form.nwunit || "KG",
        brutweight: brutWeight,
        bwunit: form.bwunit || "KG",
        isexplos: form.isexplos,
        isspoil: form.isspoil,
        aklisbreakable: form.aklisbreakable,
        aklisliquid: form.aklisliquid,
        aklistoxic: form.aklistoxic,
        aklpalpos: form.aklpalpos || 1,
      };

      const res = await api.setMatSize(payload);

      if (!res.ok) {
        throw new Error(res.message || "Ölçü bilgileri kaydedilemedi.");
      }

      sesBasarili();
      show({
        kind: "ok",
        text: `${materialName} ölçüleri kaydedildi.`,
      });

      const updatedDimensions = {
        width: form.pwidth,
        length: form.plength,
        height: form.pheight,
        volume: calcVol,
        netWeight,
        brutWeight,
      };

      const updatedMaterial = {
        material,
        name: materialName,
        image: materialImage,
        unit: materialUnit,
        isSpecialLot: stateData.isSpecialLot ?? false,
        barcodes,
        selectedBarcode,
        dimensions: updatedDimensions,
      };

      setTimeout(() => {
        navigate(backUrl, {
          state: {
            matSizeSaved: true,
            updatedDimensions,
            currentMaterial: updatedMaterial,
            matSizeForm: form,
            items: receivedItems,
            waybillNo,
            targetWarehouse: targetWH,
            vendor: vendorCode,
            vendorName,
            openOrders,
            activeStep: "quantity",
            areDimensionsDone: true,
            isProductScanned: true,
          },
        });
      }, 500);
    } catch (err: any) {
      sesHata();
      show({
        kind: "err",
        text: err?.message || "CANIAS MzySetMatSize çağrısında hata oluştu.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-2 sm:p-3 animate-fade-in space-y-2 select-none">
      {/* Toast Bildirimleri */}
      <ToastView toast={toast} />

      {/* ULTRA KOMPAKT ÜST BAŞLIK & AKSİYON ŞERİDİ (TEK SATIR) */}
      <div className="flex items-center justify-between gap-2 bg-surface border border-line px-3 py-1.5 rounded-2xl shadow-xs">
        {/* Sol Taraf: Geri Butonu + Başlık + Ürün Adı & Kodu */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated/60 text-subtle hover:bg-elevated hover:text-fg transition"
            title="Geri Dön"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-black text-fg whitespace-nowrap">
              2 · Ölçü Girişi
            </span>
            <span className="chip bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-extrabold py-0.5 px-1.5 shrink-0">
              {material || "KOD"}
            </span>
            <span className="text-xs font-bold text-subtle truncate max-w-[200px] sm:max-w-[340px]" title={materialName}>
              {materialName}
            </span>
          </div>
        </div>

        {/* Sağ Taraf: Vazgeç ve Kaydet Butonları */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-line bg-surface hover:bg-elevated px-2.5 py-1 text-[11px] font-bold text-subtle transition"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-extrabold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Kaydet
              </>
            )}
          </button>
        </div>
      </div>

      {/* TÜM GİRİŞLERİ BARINDIRAN TEK KOMPAKT YATAY KART (6 INCH YATAY TELEFON İÇİN SCROLL'SUZ) */}
      <form onSubmit={handleSave} className="rounded-2xl border border-line bg-surface p-2.5 sm:p-3 shadow-card space-y-2">
        {/* 1. SATIR: EN, BOY, YÜKSEKLİK, NET KG, BRÜT KG, HACİM (TEK 6'LI YATAY IZGARA) */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {/* Genişlik / En */}
          <div>
            <label className="text-[10px] font-extrabold text-subtle block mb-0.5 truncate">
              Genişlik / En (cm) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.pwidth || ""}
              onChange={(e) => handleNumChange("pwidth", e.target.value)}
              placeholder="0.0"
              className="field-input w-full font-mono text-xs font-bold text-center h-8 py-1 px-1 rounded-lg"
              autoFocus
              required
            />
          </div>

          {/* Uzunluk / Boy */}
          <div>
            <label className="text-[10px] font-extrabold text-subtle block mb-0.5 truncate">
              Uzunluk / Boy (cm) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.plength || ""}
              onChange={(e) => handleNumChange("plength", e.target.value)}
              placeholder="0.0"
              className="field-input w-full font-mono text-xs font-bold text-center h-8 py-1 px-1 rounded-lg"
              required
            />
          </div>

          {/* Yükseklik */}
          <div>
            <label className="text-[10px] font-extrabold text-subtle block mb-0.5 truncate">
              Yükseklik (cm) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.pheight || ""}
              onChange={(e) => handleNumChange("pheight", e.target.value)}
              placeholder="0.0"
              className="field-input w-full font-mono text-xs font-bold text-center h-8 py-1 px-1 rounded-lg"
              required
            />
          </div>

          {/* Net Ağırlık */}
          <div>
            <label className="text-[10px] font-extrabold text-subtle block mb-0.5 truncate">
              Net Ağırlık (kg) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.netweight || ""}
              onChange={(e) => handleNumChange("netweight", e.target.value)}
              placeholder="0.00"
              className="field-input w-full font-mono text-xs font-bold text-center h-8 py-1 px-1 rounded-lg"
            />
          </div>

          {/* Brüt Ağırlık */}
          <div>
            <label className="text-[10px] font-extrabold text-subtle block mb-0.5 truncate">
              Brüt Ağırlık (kg) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.brutweight || ""}
              onChange={(e) => handleNumChange("brutweight", e.target.value)}
              placeholder="0.00"
              className="field-input w-full font-mono text-xs font-bold text-center h-8 py-1 px-1 rounded-lg"
            />
          </div>

          {/* Hacim */}
          <div>
            <label className="text-[10px] font-extrabold text-subtle block mb-0.5 truncate">
              Hacim (m³)
            </label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={form.volume || ""}
              onChange={(e) => handleNumChange("volume", e.target.value)}
              placeholder="0.0000"
              className="field-input w-full font-mono text-xs font-bold text-center h-8 py-1 px-1 rounded-lg bg-elevated/40"
            />
          </div>
        </div>

        {/* 2. SATIR: ÖZEL NİTELİKLER & GÜVENLİK & PALET KATI (TEK YATAY ESNEK SATIR) */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap pt-1.5 border-t border-line/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Kırılabilir */}
            <label className="flex items-center gap-1 rounded-lg border border-line bg-elevated/30 px-2 py-1 cursor-pointer hover:border-emerald-500/50 transition">
              <input
                type="checkbox"
                checked={form.aklisbreakable}
                onChange={(e) => setForm({ ...form, aklisbreakable: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-line text-emerald-600 focus:ring-0"
              />
              <GlassWater className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] font-bold text-fg">Kırılabilir</span>
            </label>

            {/* Sıvı */}
            <label className="flex items-center gap-1 rounded-lg border border-line bg-elevated/30 px-2 py-1 cursor-pointer hover:border-emerald-500/50 transition">
              <input
                type="checkbox"
                checked={form.aklisliquid}
                onChange={(e) => setForm({ ...form, aklisliquid: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-line text-emerald-600 focus:ring-0"
              />
              <Droplets className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-[11px] font-bold text-fg">Sıvı</span>
            </label>

            {/* Yanıcı */}
            <label className="flex items-center gap-1 rounded-lg border border-line bg-elevated/30 px-2 py-1 cursor-pointer hover:border-emerald-500/50 transition">
              <input
                type="checkbox"
                checked={form.isexplos}
                onChange={(e) => setForm({ ...form, isexplos: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-line text-emerald-600 focus:ring-0"
              />
              <Flame className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-[11px] font-bold text-fg">Yanıcı</span>
            </label>

            {/* Bozulabilir */}
            <label className="flex items-center gap-1 rounded-lg border border-line bg-elevated/30 px-2 py-1 cursor-pointer hover:border-emerald-500/50 transition">
              <input
                type="checkbox"
                checked={form.isspoil}
                onChange={(e) => setForm({ ...form, isspoil: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-line text-emerald-600 focus:ring-0"
              />
              <Clock className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-[11px] font-bold text-fg">Bozulabilir</span>
            </label>

            {/* Toksik */}
            <label className="flex items-center gap-1 rounded-lg border border-line bg-elevated/30 px-2 py-1 cursor-pointer hover:border-emerald-500/50 transition">
              <input
                type="checkbox"
                checked={form.aklistoxic}
                onChange={(e) => setForm({ ...form, aklistoxic: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-line text-emerald-600 focus:ring-0"
              />
              <Skull className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-[11px] font-bold text-fg">Toksik</span>
            </label>
          </div>
        </div>
      </form>
    </div>
  );
}
