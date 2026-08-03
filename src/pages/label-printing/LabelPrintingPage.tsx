import { useTranslation } from "react-i18next";
import { Printer, Hammer } from "lucide-react";
import PageHeader from "../../components/PageHeader";

export default function LabelPrintingPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <PageHeader title={t("home.operations.label_printing")} backTo="/home" />

      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center shadow-card">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-100 text-indigo-600">
          <Printer className="h-10 w-10" />
        </div>
        <div className="mb-2 flex items-center gap-2 text-subtle">
          <Hammer className="h-4 w-4" />
          <span className="text-sm font-semibold">{t("common.comingSoon")}</span>
        </div>
        <p className="max-w-md px-6 text-sm leading-relaxed text-subtle">
          {t("home.operationDesc.label_printing")}
        </p>
      </div>
    </div>
  );
}
