import {
  PackageCheck,
  Warehouse,
  ClipboardList,
  ArrowLeftRight,
  Calculator,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import type { OperationType } from "../types";

export interface OperationMeta {
  type: OperationType;
  icon: LucideIcon;
  route: string;
  /** Tailwind renk sınıfları */
  iconBg: string;
  iconFg: string;
  ready: boolean; // bu adımda hazır mı
}

export const OPERATIONS: OperationMeta[] = [
  { type: "picking", icon: ClipboardList, route: "/picking", iconBg: "bg-brand-100", iconFg: "text-brand-600", ready: true },
  { type: "receiving", icon: PackageCheck, route: "/receiving", iconBg: "bg-emerald-100", iconFg: "text-emerald-600", ready: true },
  { type: "putaway", icon: Warehouse, route: "/putaway", iconBg: "bg-violet-100", iconFg: "text-violet-600", ready: true },
  { type: "transfer", icon: ArrowLeftRight, route: "/transfer", iconBg: "bg-amber-100", iconFg: "text-amber-600", ready: true },
  { type: "count", icon: Calculator, route: "/count", iconBg: "bg-rose-100", iconFg: "text-rose-600", ready: true },
  { type: "inquiry", icon: ScanSearch, route: "/inquiry", iconBg: "bg-cyan-100", iconFg: "text-cyan-600", ready: true },
];
