import {
  PackageCheck,
  Warehouse,
  ClipboardList,
  ArrowLeftRight,
  Calculator,
  BarChart3,
  Package,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { OperationType } from "../types";

export interface OperationMeta {
  type: OperationType;
  icon: LucideIcon;
  route: string;

  iconBg: string;
  iconFg: string;
  ready: boolean; // bu adımda hazır mı
  /** Menüde görünür ama tıklanamaz (gri/soluk). Rota açık kalır. */
  pasif?: boolean;
}

export const OPERATIONS: OperationMeta[] = [
  { type: "picking", icon: ClipboardList, route: "/picking", iconBg: "bg-brand-100", iconFg: "text-brand-600", ready: true },
  { type: "receiving", icon: PackageCheck, route: "/receiving", iconBg: "bg-emerald-100", iconFg: "text-emerald-600", ready: true },
  { type: "putaway", icon: Warehouse, route: "/putaway", iconBg: "bg-violet-100", iconFg: "text-violet-600", ready: true },
  { type: "transfer", icon: ArrowLeftRight, route: "/transfer", iconBg: "bg-amber-100", iconFg: "text-amber-600", ready: true },
  { type: "count", icon: Calculator, route: "/count", iconBg: "bg-rose-100", iconFg: "text-rose-600", ready: true },
  { type: "packaging", icon: Package, route: "/packaging", iconBg: "bg-orange-100", iconFg: "text-orange-600", ready: true },
  { type: "dagitim", icon: Truck, route: "/dagitim", iconBg: "bg-teal-100", iconFg: "text-teal-600", ready: true },
  // "inquiry" ana menüden çıkarıldı (Bora): artık yalnızca Yardımcı Uygulamalar menüsünde. Rota (/inquiry) korunuyor.
  // "label_printing" (Yardımcı İşlemler) da çıkarıldı (Bora: "teke düşsün"): ekranları artık
  // Yardımcı Uygulamalar altında (components/yardimciUygulamalar.ts). /label-printing rotaları korunuyor.
  { type: "reporting", icon: BarChart3, route: "/reporting", iconBg: "bg-sky-100", iconFg: "text-sky-600", ready: true },
];
