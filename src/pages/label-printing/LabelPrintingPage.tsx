import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Package,
  FileText,
  CalendarDays,
  Barcode,
  Warehouse,
  Search,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";

interface LabelCardItem {
  id: string;
  route: string;
  titleKey: string;
  defaultTitle: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  iconFg: string;
}

const LABEL_CARDS: LabelCardItem[] = [
  {
    id: "packaging",
    route: "/label-printing/packaging",
    titleKey: "labelPrinting.cards.packaging.title",
    defaultTitle: "Paketleme Etiketi Yazdırma",
    description: "Koli, palet ve paket etiketlerini yazdırın",
    icon: Package,
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconFg: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "waybill",
    route: "/label-printing/waybill",
    titleKey: "labelPrinting.cards.waybill.title",
    defaultTitle: "İrsaliye Etiketi Yazdırma",
    description: "Sevkiyat evrakları ve irsaliye detay etiketlerini yazdırın",
    icon: FileText,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
    iconFg: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "expiry",
    route: "/label-printing/expiry",
    titleKey: "labelPrinting.cards.expiry.title",
    defaultTitle: "SKT (Son Kullanma Tarihi) Etiketi Yazdırma",
    description: "Parti, lot ve son kullanma tarihli ürün etiketleri yazdırın",
    icon: CalendarDays,
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconFg: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "product_barcode",
    route: "/label-printing/product-barcode",
    titleKey: "labelPrinting.cards.product_barcode.title",
    defaultTitle: "Ürün Barkodu Yazdırma",
    description: "Ürün, malzeme ve EAN barkod etiketlerini yazdırın",
    icon: Barcode,
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    iconFg: "text-purple-600 dark:text-purple-400",
  },
  {
    id: "shelf_location",
    route: "/label-printing/shelf-location",
    titleKey: "labelPrinting.cards.shelf_location.title",
    defaultTitle: "Depo Raf Etiketi Yazdırma",
    description: "Depo lokasyon ve raf adres etiketlerini (örn: D3$C1) yazdırın",
    icon: Warehouse,
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
    iconFg: "text-rose-600 dark:text-rose-400",
  },
];

export default function LabelPrintingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const filteredCards = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return LABEL_CARDS;
    return LABEL_CARDS.filter((c) => {
      const title = t(c.titleKey, { defaultValue: c.defaultTitle }).toLowerCase();
      return title.includes(s) || c.description.toLowerCase().includes(s);
    });
  }, [q, t]);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={t("labelPrinting.title", { defaultValue: "Etiket Yazdırma" })}
        subtitle={t("labelPrinting.subtitle", {
          defaultValue: "Yazdırmak istediğiniz etiket tipini seçin",
        })}
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("labelPrinting.search", { defaultValue: "Etiket tipi ara..." })}
              className="field-input w-72 pl-11"
            />
          </div>
        }
      />

      {/* Mobil Arama Input'u */}
      <div className="relative mb-5 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("labelPrinting.search", { defaultValue: "Etiket tipi ara..." })}
          className="field-input pl-11"
        />
      </div>

      {/* Kartlar Izgarası */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        {filteredCards.map((c, i) => {
          const Icon = c.icon;
          const baslik = t(c.titleKey, { defaultValue: c.defaultTitle });

          return (
            <div
              key={c.id}
              onClick={() => navigate(c.route)}
              style={{ animationDelay: `${i * 55}ms` }}
              className="stagger relative flex cursor-pointer flex-col justify-between rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition-all hover:border-brand hover:shadow-lg active:scale-[0.99]"
            >
              <div>
                <div className="flex w-full items-start justify-between">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${c.iconBg}`}>
                    <Icon className={`h-7 w-7 ${c.iconFg}`} />
                  </div>
                  <span className="rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-semibold text-subtle">
                    Aç
                  </span>
                </div>

                <div className="mt-4 min-w-0">
                  <h3 className="text-lg font-bold text-fg">{baslik}</h3>
                  <p className="mt-1 text-xs text-subtle leading-relaxed">{c.description}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-1.5 text-xs font-bold text-brand">
                <span>İşleme Git</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

