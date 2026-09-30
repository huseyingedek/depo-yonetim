import { useState } from "react";
import { Calendar, Printer, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import PageHeader from "../../components/PageHeader";

// SKT (Son Kullanma Tarihi) Etiketi — Bora: bu ekranın amacı yalnızca üzerinde SKT
// bulunan barkodu basmak. Tablı ürün araması YOK. Sadece: tarih (seç/elle gir) + adet.
// Yazdır → MZYPrintBarcode (PSCOMPANY, PSPLANT, PSBARCODE, PIREPEAT, PSUSER, PITRACESTATUS).
export default function ExpiryLabelPage() {
  const [expiryDate, setExpiryDate] = useState("");
  const [repeatCount, setRepeatCount] = useState<number | string>(1);

  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];

  const handlePrint = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı en az 1 olmalıdır (1-99 arası).");
      return;
    }

    if (!expiryDate) {
      setErrorMsg("Lütfen Son Kullanma Tarihi (SKT) seçin veya girin.");
      return;
    }
    if (expiryDate < todayStr) {
      setErrorMsg("Son Kullanma Tarihi (SKT) geçmiş bir tarih olamaz. Lütfen bugün veya gelecek bir tarih seçin.");
      return;
    }
    const yearNum = parseInt(expiryDate.split("-")[0], 10);
    if (isNaN(yearNum) || yearNum > 2099) {
      setErrorMsg("Geçerli bir Son Kullanma Tarihi girin (Yıl en fazla 2099 olabilir).");
      return;
    }

    setPrinting(true);
    try {
      const res = await api.printBarcode({
        company: "01",
        plant: "100",
        barcode: expiryDate,
        repeat: count,
        traceStatus: 0,
      });

      if (res.ok) {
        setSuccessMsg(`SKT etiketi (${expiryDate} · ${count} kopya) yazdırma isteği CANIAS'a iletildi.`);
        setExpiryDate("");
        setRepeatCount(1);
      } else {
        setErrorMsg(res.message || "SKT etiketi yazdırılırken CANIAS servisinde hata oluştu.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "CANIAS servisi ile iletişim kurulurken hata oluştu.");
    } finally {
      setPrinting(false);
    }
  };

  const isPrintDisabled = printing || !expiryDate;

  const kopyaInput = (widthCls: string) => (
    <input
      type="number"
      min={1}
      max={99}
      value={repeatCount}
      onChange={(e) => {
        const val = e.target.value;
        if (val === "") {
          setRepeatCount("");
          return;
        }
        const v = parseInt(val, 10);
        if (!isNaN(v)) setRepeatCount(Math.min(99, Math.max(1, v)));
      }}
      onBlur={() => {
        if (repeatCount === "" || Number(repeatCount) < 1) setRepeatCount(1);
      }}
      className={`field-input ${widthCls} py-1.5 px-2 text-center text-xs font-bold`}
    />
  );

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8 space-y-6">
      <PageHeader
        title="SKT (Son Kullanma Tarihi) Etiketi Yazdırma"
        subtitle="SKT tarihini seçin veya elle girin, adedi belirleyip yazdırın"
        backTo="/label-printing"
        right={
          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrintDisabled}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {printing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Yazdırılıyor...</span>
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  <span>Yazdır</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Mobil: Yazdır */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={handlePrint}
          disabled={isPrintDisabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          <span>Yazdır</span>
        </button>
      </div>

      {/* Uyarılar */}
      {errorMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span>{successMsg}</span>
        </div>
      )}

      {/* SKT Tarihi + Adet */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-5">
        <div>
          <h3 className="text-base font-extrabold text-fg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span>SKT Tarihi</span>
          </h3>
          <p className="text-xs text-subtle mt-0.5">
            Tarihi takvimden seçebilir veya gg.aa.yyyy olarak elle girebilirsiniz. Etikette yalnızca bu tarih basılır.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Son Kullanma Tarihi (SKT) <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              min={todayStr}
              max="2099-12-31"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Basılacak Etiket Adedi <span className="text-red-500">*</span>
            </label>
            {kopyaInput("w-full")}
          </div>
        </div>
      </div>
    </div>
  );
}
