import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { OPERATIONS } from "../components/operations";
import { api } from "../api/client";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const [openCount, setOpenCount] = useState<number | null>(null);

  useEffect(() => {
    api.getPickOrders().then((o) => setOpenCount(o.length));
  }, []);

  const today = new Date().toLocaleDateString(t("app.name") === "Warehouse Mgmt" ? "en-GB" : "tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <div className="mb-8">
        <p className="text-sm text-ink-400">{today}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink-900 lg:text-3xl">
          {t("home.greeting")}, {user?.displayName} 👋
        </h1>
        <p className="mt-1 text-ink-500">{t("home.selectOperation")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {OPERATIONS.map((op) => {
          const Icon = op.icon;
          const badge = op.type === "picking" ? openCount : null;
          return (
            <button
              key={op.type}
              onClick={() => navigate(op.route)}
              className="group relative flex flex-col items-start gap-4 rounded-2xl border border-ink-100 bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${op.iconBg}`}>
                <Icon className={`h-7 w-7 ${op.iconFg}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-ink-900">{t(`home.operations.${op.type}`)}</p>
                <p className="mt-0.5 text-sm leading-snug text-ink-400">{t(`home.operationDesc.${op.type}`)}</p>
              </div>
              <div className="mt-1 flex w-full items-center justify-between">
                {badge ? (
                  <span className="chip bg-brand-100 text-brand-700">
                    {badge} {t("home.openTasks")}
                  </span>
                ) : !op.ready ? (
                  <span className="chip bg-ink-100 text-ink-400">yakında</span>
                ) : (
                  <span />
                )}
                <ArrowRight className="h-5 w-5 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
