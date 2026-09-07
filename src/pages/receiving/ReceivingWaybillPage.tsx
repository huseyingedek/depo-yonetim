import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, Warehouse, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { api } from "../../api/client";
import type { SupplierOrder } from "./ReceivingSupplierSelectPage";

// İrsaliye No + Mal Kabul Deposu girişi — ayrı sayfa (eski popup modal yerine),
// uygulamanın genel stiliyle (PageHeader, card, field-input, brand buton).
export default function ReceivingWaybillPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const supplier = location.state?.supplier as SupplierOrder | undefined;

  const [waybillNo, setWaybillNo] = useState("");
  const [targetWarehouse, setTargetWarehouse] = useState("00$*");
  const [waybillError, setWaybillError] = useState("");
  const [targetError, setTargetError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  // Doğrudan (tedarikçi seçmeden) gelinirse listeye geri dön.
  useEffect(() => {
    if (!supplier) navigate("/receiving", { replace: true });
  }, [supplier, navigate]);

  const basla = async () => {
    if (!supplier) return;
    const trimmedWaybill = waybillNo.trim();
    const trimmedTarget = targetWarehouse.trim();

    let hasErr = false;
    if (!trimmedWaybill) {
      setWaybillError("Lütfen İrsaliye Numarasını giriniz.");
      hasErr = true;
    }
    if (!trimmedTarget) {
      setTargetError("Lütfen Mal Kabul Deposunu giriniz.");
      hasErr = true;
    }
    if (hasErr) return;

    setIsValidating(true);
    setTargetError("");
    try {
      let confirmedWh = trimmedTarget.includes("$") ? trimmedTarget.split("$")[0].trim() : trimmedTarget;
      let confirmedSp = trimmedTarget.includes("$") ? trimmedTarget.split("$")[1].trim() : "*";

      const isPatternOrWildcard =
        trimmedTarget.includes("*") ||
        trimmedTarget.includes("&") ||
        trimmedTarget.toUpperCase().startsWith("00");

      if (!isPatternOrWildcard) {
        const shelfRes = await api.readShelfBarcode(trimmedTarget);
        const isValid =
          (shelfRes.ok && (shelfRes.warehouse || shelfRes.stockPlace)) ||
          (shelfRes.warehouse && !shelfRes.message);
        if (!isValid && !shelfRes.ok) {
          setTargetError(
            shelfRes.message ||
              "Girilen mal kabul deposu CANIAS sisteminde bulunamadı. Lütfen geçerli bir depo giriniz."
          );
          return;
        }
        if (shelfRes.warehouse) confirmedWh = shelfRes.warehouse;
        if (shelfRes.stockPlace) confirmedSp = shelfRes.stockPlace;
      }

      navigate(
        `/receiving/${encodeURIComponent(supplier.poNumber)}?waybill=${encodeURIComponent(
          trimmedWaybill
        )}&targetWH=${encodeURIComponent(confirmedWh)}&targetSP=${encodeURIComponent(
          confirmedSp
        )}&vendor=${encodeURIComponent(supplier.id)}&vendorName=${encodeURIComponent(supplier.name)}`,
        {
          state: {
            waybillNo: trimmedWaybill,
            targetWarehouse: confirmedWh,
            targetStockPlace: confirmedSp,
            supplier,
          },
        }
      );
    } catch (err) {
      setTargetError(
        err instanceof Error ? err.message : "Depo doğrulanırken hata oluştu. Lütfen bağlantınızı kontrol ediniz."
      );
    } finally {
      setIsValidating(false);
    }
  };

  if (!supplier) return null;

  return (
    <div className="mx-auto max-w-xl p-4 lg:p-8">
      <PageHeader title="Mal Kabul — İrsaliye Bilgileri" backTo="/receiving" />

      <div className="card mt-2 p-5 sm:p-6">
        <div className="mb-5 rounded-2xl bg-elevated px-4 py-3">
          <p className="text-xs text-subtle">Tedarikçi</p>
          <p className="truncate text-base font-bold text-fg">
            {supplier.name}
            {supplier.poNumber ? <span className="ml-2 font-mono text-sm text-brand-600">({supplier.poNumber})</span> : null}
          </p>
        </div>

        {/* İrsaliye Numarası */}
        <label className="block">
          <span className="field-label flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> İrsaliye Numarası <span className="text-rose-500">*</span>
          </span>
          <input
            value={waybillNo}
            onChange={(e) => {
              setWaybillNo(e.target.value);
              if (waybillError) setWaybillError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && basla()}
            placeholder="İrsaliye numarasını giriniz"
            autoComplete="off"
            autoFocus
            className={`field-input ${waybillError ? "border-rose-500 focus:border-rose-500" : ""}`}
          />
          {waybillError && (
            <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-500">
              <AlertCircle className="h-3.5 w-3.5" /> {waybillError}
            </span>
          )}
        </label>

        {/* Mal Kabul Deposu */}
        <label className="mt-4 block">
          <span className="field-label flex items-center gap-1.5">
            <Warehouse className="h-4 w-4" /> Mal Kabul Deposu <span className="text-rose-500">*</span>
          </span>
          <input
            value={targetWarehouse}
            onChange={(e) => {
              setTargetWarehouse(e.target.value);
              if (targetError) setTargetError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && basla()}
            disabled={isValidating}
            list="canias-warehouse-options"
            placeholder="00$*"
            autoComplete="off"
            className={`field-input font-semibold ${targetError ? "border-rose-500 focus:border-rose-500" : ""}`}
          />
          <datalist id="canias-warehouse-options">
            <option value="00$*" label="Standart Depo Kodu" />
          </datalist>
          {targetError && (
            <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-500">
              <AlertCircle className="h-3.5 w-3.5" /> {targetError}
            </span>
          )}
        </label>

        <button type="button" onClick={basla} disabled={isValidating} className="btn-primary btn-lg btn-block mt-6">
          {isValidating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Depo doğrulanıyor…
            </>
          ) : (
            <>
              Mal Kabule Başla <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
