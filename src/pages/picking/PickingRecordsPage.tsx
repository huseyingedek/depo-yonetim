import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, X, ArrowLeft } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { usePickingStore } from "../../store/pickingStore";
import { api } from "../../api/client";

/**
 * OKUTULANLAR — okutma kayıtlarının tam tablosu.
 *
 * Bu satırlar MZYSavePick'e IASWMSPOITEMREAD tablosu olarak gidecek; stok
 * bunlara göre düşecek. O yüzden gönderilecek TÜM alanlar burada görünür.
 *
 * Eksik alan varsa kırmızı işaretlenir — depocu ya da yönetici görsün diye.
 * Kayıt silinebilir; miktar burada da artırılamaz (artırmak yeni okutma).
 */
export default function PickingRecordsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const order = usePickingStore((s) => s.order);
  const removeRecord = usePickingStore((s) => s.removeRecord);

  useEffect(() => {
    if (!order) navigate("/picking", { replace: true });
  }, [order, navigate]);

  if (!order) return null;

  const satirlar = api.buildPickRows(order);
  const kayitlar = order.lines.flatMap((line) =>
    (line.records ?? []).map((r) => ({ line, r }))
  );

  /** Servise gitmeden önce dolu olması gereken alanlar */
  const ZORUNLU = [
    "COMPANY", "PLANT", "MATERIAL", "WAREHOUSE", "STOCKPLACE",
    "READQTY", "QUNIT", "ORDERTYPE", "ORDERNUM", "ITEMNO",
  ] as const;

  const eksikSayisi = satirlar.reduce(
    (t, row) => t + ZORUNLU.filter((k) => !String(row[k] ?? "").trim()).length,
    0
  );

  const KOLONLAR = [
    ["MATERIAL", "Malzeme"],
    ["WAREHOUSE", "Depo"],
    ["STOCKPLACE", "Stok yeri"],
    ["SPECIALSTOCK", "Özel stok"],
    ["BATCHNUM", "Parti"],
    ["READQTY", "Miktar"],
    ["QUNIT", "Birim"],
    ["ORDERTYPE", "Belge tipi"],
    ["ORDERNUM", "Belge no"],
    ["ITEMNO", "Kalem no"],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title="Okutulanlar"
        subtitle={`${order.id} · ${satirlar.length} satır`}
        backTo={`/picking/${id}?type=${order.orderType ?? ""}`}
        right={
          <button
            onClick={() => navigate(`/picking/${id}?type=${order.orderType ?? ""}`)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-muted transition hover:bg-elevated"
          >
            <ArrowLeft className="h-4 w-4" />
            Toplamaya dön
          </button>
        }
      />

      {eksikSayisi > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {eksikSayisi} alan boş. Bu satırlar CANIAS'a böyle giderse stok yanlış
            düşer — eksik alanı olan kaydı silip yeniden okutun.
          </span>
        </div>
      )}

      {!satirlar.length ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-subtle">
          Henüz okutma yok.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-line bg-elevated">
              <tr>
                <th className="px-3 py-2 font-semibold text-muted">Ürün</th>
                {KOLONLAR.map(([k, ad]) => (
                  <th key={k} className="whitespace-nowrap px-3 py-2 font-semibold text-muted">
                    {ad}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {satirlar.map((row, i) => {
                const kayit = kayitlar[i];
                return (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="max-w-[220px] truncate px-3 py-2 font-medium text-fg">
                      {kayit?.line.product.name ?? "—"}
                    </td>
                    {KOLONLAR.map(([k]) => {
                      const deger = String(row[k] ?? "").trim();
                      const eksik =
                        (ZORUNLU as readonly string[]).includes(k) && !deger;
                      return (
                        <td
                          key={k}
                          className={`whitespace-nowrap px-3 py-2 font-mono ${
                            eksik
                              ? "bg-rose-50 font-bold text-rose-600"
                              : "text-muted"
                          }`}
                        >
                          {deger || (eksik ? "EKSİK" : "—")}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      {kayit && (
                        <button
                          onClick={() => removeRecord(kayit.line.id, kayit.r.id)}
                          aria-label="kaydı sil"
                          className="flex h-7 w-7 items-center justify-center rounded text-subtle transition hover:bg-rose-100 hover:text-rose-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
