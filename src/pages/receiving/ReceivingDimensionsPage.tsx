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
  Ruler,
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
    pwidth: stateData.dimensions?.width || 0,
    plength: stateData.dimensions?.length || 0,
    pheight: stateData.dimensions?.height || 0,
    lunit: "CM",
    volume: stateData.dimensions?.volume || 0,
    vunit: "M3",
    netweight: stateData.dimensions?.netWeight || 0,
    nwunit: "KG",
    brutweight: stateData.dimensions?.brutWeight || 0,
    bwunit: "KG",
    isexplos: Boolean(stateData.specialAttributes?.isexplos),
    isspoil: Boolean(stateData.specialAttributes?.isspoil),
    aklisbreakable: Boolean(stateData.specialAttributes?.aklisbreakable),
    aklisliquid: Boolean(stateData.specialAttributes?.aklisliquid),
    aklistoxic: Boolean(stateData.specialAttributes?.aklistoxic),
    aklpalpos: 1,
  };

  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const { toast, show } = useToast();

  const handleNumChange = (field: string, valStr: string) => {
    const sanitized = valStr.replace(",", ".");
    const num = Number(sanitized) || 0;
    setForm((prev: typeof initialForm) => {
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

  const handleBack = () => {
    navigate(backUrl, {
      state: {
        items: receivedItems,
        waybillNo,
        targetWarehouse: targetWH,
        vendor: vendorCode,
        vendorName,
        currentMaterial: stateData.material ? {
          material: stateData.material,
          name: stateData.name,
          image: stateData.image,
          unit: stateData.unit,
          isSpecialLot: stateData.isSpecialLot ?? false,
          barcodes: stateData.barcodes || [],
          selectedBarcode: stateData.selectedBarcode || "",
          dimensions: stateData.dimensions,
          specialAttributes: stateData.specialAttributes,
        } : null,
        openOrders,
        activeStep: stateData.activeStep || "product",
        isProductScanned: Boolean(stateData.material),
        areDimensionsDone: Boolean(stateData.areDimensionsDone),
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
        text: "Lütfen Genişlik (En), Uzunluk (Boy) ve Yükseklik ölçülerini (0'dan büyük) giriniz.",
      });
      sesHata();
      return;
    }

    if (form.brutweight <= 0 && form.netweight <= 0) {
      show({
        kind: "err",
        text: "Lütfen en az bir geçerli Ağırlık (Net veya Brüt) değeri giriniz.",
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
        specialAttributes: {
          isexplos: form.isexplos,
          isspoil: form.isspoil,
          aklisbreakable: form.aklisbreakable,
          aklisliquid: form.aklisliquid,
          aklistoxic: form.aklistoxic,
        },
      };

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
    } catch (err: unknown) {
      sesHata();
      show({
        kind: "err",
        text: err instanceof Error ? err.message : "CANIAS MzySetMatSize çağrısında hata oluştu.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-surface text-fg flex flex-col justify-start animate-fade-in select-none p-2 sm:p-3">
      <div className="w-full max-w-5xl mx-auto space-y-2 flex-1 flex flex-col justify-start">
        {/* Toast Bildirimleri */}
        <ToastView toast={toast} />

        {/* Kompakt Üst Başlık Satırı */}
        <div className="flex items-center justify-between border-b border-line/40 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-elevated border border-line text-subtle hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-2xs"
            title="Geri Dön"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
            <Ruler className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <h3 className="text-xs sm:text-sm font-black text-fg whitespace-nowrap">
              Ölçü ve Nitelik Tanımlama
            </h3>
            <span className="font-mono text-[11px] font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded shadow-2xs">
              {material || "KOD"}
            </span>
            <span className="text-xs text-subtle truncate max-w-[220px] sm:max-w-md font-semibold" title={materialName}>
              {materialName}
            </span>
          </div>
        </div>
      </div>

      {/* Form Gövdesi: Tek Birleşik Kart İçerisinde Ölçümler ve Özel Nitelikler */}
      <form onSubmit={handleSave} className="w-full">
        <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4 shadow-card flex flex-col md:flex-row gap-4 items-stretch">
          {/* Sol Bölüm: Boyut, Ağırlık ve Hacim Girişleri */}
          <div className="flex-1 min-w-0 space-y-2 flex flex-col justify-between">
            <span className="text-[11px] font-black text-ink-700 dark:text-ink-200 uppercase tracking-wider block">
              Ölçüm Bilgileri
            </span>

            {/* 1. Sıra: En, Boy, Yükseklik */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-black text-ink-700 dark:text-ink-200 block mb-0.5 text-center">
                  En (cm) <span className="text-rose-500 font-black">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.pwidth || ""}
                  onChange={(e) => handleNumChange("pwidth", e.target.value)}
                  placeholder="0.0"
                  className="w-full font-mono text-sm font-black text-center h-8.5 py-0.5 px-1.5 rounded-lg border border-line bg-surface text-fg focus:border-emerald-500 focus:outline-none shadow-2xs"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-ink-700 dark:text-ink-200 block mb-0.5 text-center">
                  Boy (cm) <span className="text-rose-500 font-black">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.plength || ""}
                  onChange={(e) => handleNumChange("plength", e.target.value)}
                  placeholder="0.0"
                  className="w-full font-mono text-sm font-black text-center h-8.5 py-0.5 px-1.5 rounded-lg border border-line bg-surface text-fg focus:border-emerald-500 focus:outline-none shadow-2xs"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-ink-700 dark:text-ink-200 block mb-0.5 text-center">
                  Yükseklik (cm) <span className="text-rose-500 font-black">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.pheight || ""}
                  onChange={(e) => handleNumChange("pheight", e.target.value)}
                  placeholder="0.0"
                  className="w-full font-mono text-sm font-black text-center h-8.5 py-0.5 px-1.5 rounded-lg border border-line bg-surface text-fg focus:border-emerald-500 focus:outline-none shadow-2xs"
                  required
                />
              </div>
            </div>

            {/* 2. Sıra: Net KG, Brüt KG, Hacim M³ */}
            <div className="grid grid-cols-3 gap-2 border-t border-line/40 pt-2">
              <div>
                <label className="text-[11px] font-black text-ink-700 dark:text-ink-200 block mb-0.5 text-center">
                  Net (kg) <span className="text-rose-500 font-black">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.netweight || ""}
                  onChange={(e) => handleNumChange("netweight", e.target.value)}
                  placeholder="0.00"
                  className="w-full font-mono text-sm font-black text-center h-8.5 py-0.5 px-1.5 rounded-lg border border-line bg-surface text-fg focus:border-emerald-500 focus:outline-none shadow-2xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-ink-700 dark:text-ink-200 block mb-0.5 text-center">
                  Brüt (kg) <span className="text-rose-500 font-black">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.brutweight || ""}
                  onChange={(e) => handleNumChange("brutweight", e.target.value)}
                  placeholder="0.00"
                  className="w-full font-mono text-sm font-black text-center h-8.5 py-0.5 px-1.5 rounded-lg border border-line bg-surface text-fg focus:border-emerald-500 focus:outline-none shadow-2xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-black text-ink-700 dark:text-ink-200 block mb-0.5 text-center">
                  Hacim (m³)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.volume || ""}
                  onChange={(e) => handleNumChange("volume", e.target.value)}
                  placeholder="0.0000"
                  className="w-full font-mono text-sm font-black text-center h-8.5 py-0.5 px-1.5 rounded-lg border border-line bg-surface text-fg focus:border-emerald-500 focus:outline-none shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Dikey Ayırıcı Çizgi */}
          <div className="hidden md:block w-px bg-line/60 self-stretch my-0.5" />

          {/* Sağ Bölüm: Özel Güvenlik Nitelikleri Çipleri ve Kaydet Butonu */}
          <div className="w-full md:w-[300px] shrink-0 flex flex-col justify-between space-y-2">
            <span className="text-[11px] font-black text-ink-700 dark:text-ink-200 uppercase tracking-wider block">
              Özel Nitelikler
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              {/* Kırılabilir */}
              <label className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 px-1 cursor-pointer transition-colors select-none ${
                form.aklisbreakable
                  ? "border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-200 font-black shadow-2xs"
                  : "border-line bg-elevated/40 text-ink-700 dark:text-ink-200 font-bold hover:bg-elevated"
              }`}>
                <input
                  type="checkbox"
                  checked={form.aklisbreakable}
                  onChange={(e) => setForm((prev: typeof initialForm) => ({ ...prev, aklisbreakable: e.target.checked }))}
                  className="sr-only"
                />
                <GlassWater className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] leading-tight">Kırılabilir</span>
              </label>

              {/* Toksik */}
              <label className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 px-1 cursor-pointer transition-colors select-none ${
                form.aklistoxic
                  ? "border-purple-500 bg-purple-500/20 text-purple-800 dark:text-purple-200 font-black shadow-2xs"
                  : "border-line bg-elevated/40 text-ink-700 dark:text-ink-200 font-bold hover:bg-elevated"
              }`}>
                <input
                  type="checkbox"
                  checked={form.aklistoxic}
                  onChange={(e) => setForm((prev: typeof initialForm) => ({ ...prev, aklistoxic: e.target.checked }))}
                  className="sr-only"
                />
                <Skull className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                <span className="text-[11px] leading-tight">Toksik</span>
              </label>

              {/* Yanıcı */}
              <label className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 px-1 cursor-pointer transition-colors select-none ${
                form.isexplos
                  ? "border-rose-500 bg-rose-500/20 text-rose-800 dark:text-rose-200 font-black shadow-2xs"
                  : "border-line bg-elevated/40 text-ink-700 dark:text-ink-200 font-bold hover:bg-elevated"
              }`}>
                <input
                  type="checkbox"
                  checked={form.isexplos}
                  onChange={(e) => setForm((prev: typeof initialForm) => ({ ...prev, isexplos: e.target.checked }))}
                  className="sr-only"
                />
                <Flame className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                <span className="text-[11px] leading-tight">Yanıcı</span>
              </label>

              {/* Bozulabilir */}
              <label className={`flex items-center justify-center gap-1 rounded-lg border py-1.5 px-1 cursor-pointer transition-colors select-none ${
                form.isspoil
                  ? "border-orange-500 bg-orange-500/20 text-orange-800 dark:text-orange-200 font-black shadow-2xs"
                  : "border-line bg-elevated/40 text-ink-700 dark:text-ink-200 font-bold hover:bg-elevated"
              }`}>
                <input
                  type="checkbox"
                  checked={form.isspoil}
                  onChange={(e) => setForm((prev: typeof initialForm) => ({ ...prev, isspoil: e.target.checked }))}
                  className="sr-only"
                />
                <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                <span className="text-[11px] leading-tight">Bozulur</span>
              </label>

              {/* Sıvı (2 kolon kaplar) */}
              <label className={`col-span-2 flex items-center justify-center gap-1 rounded-lg border py-1.5 px-1 cursor-pointer transition-colors select-none ${
                form.aklisliquid
                  ? "border-blue-500 bg-blue-500/20 text-blue-800 dark:text-blue-200 font-black shadow-2xs"
                  : "border-line bg-elevated/40 text-ink-700 dark:text-ink-200 font-bold hover:bg-elevated"
              }`}>
                <input
                  type="checkbox"
                  checked={form.aklisliquid}
                  onChange={(e) => setForm((prev: typeof initialForm) => ({ ...prev, aklisliquid: e.target.checked }))}
                  className="sr-only"
                />
                <Droplets className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="text-[11px] leading-tight">Sıvı</span>
              </label>
            </div>

            {/* Entegre Kaydet Butonu */}
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 h-8.5 sm:h-9 text-xs font-black text-white shadow-md active:scale-95 transition disabled:opacity-40 w-full cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Kaydet</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}
