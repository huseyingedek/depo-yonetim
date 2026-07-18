import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Hammer } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { OPERATIONS } from "../components/operations";
import type { OperationType } from "../types";

export default function ComingSoonPage({ operation }: { operation: OperationType }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const meta = OPERATIONS.find((o) => o.type === operation)!;
  const Icon = meta.icon;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <PageHeader title={t(`home.operations.${operation}`)} backTo="/home" />

      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
        <div className={`mb-5 flex h-20 w-20 items-center justify-center rounded-3xl ${meta.iconBg}`}>
          <Icon className={`h-10 w-10 ${meta.iconFg}`} />
        </div>
        <div className="mb-2 flex items-center gap-2 text-subtle">
          <Hammer className="h-4 w-4" />
          <span className="text-sm font-semibold">{t("common.comingSoon")}</span>
        </div>
        <p className="max-w-md px-6 text-sm leading-relaxed text-subtle">{t("common.comingSoonDesc")}</p>
        <button onClick={() => navigate("/home")} className="btn-ghost btn-lg mt-8 px-8">
          {t("picking.backToMenu")}
        </button>
      </div>
    </div>
  );
}
