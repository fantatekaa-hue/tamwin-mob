import React from 'react';
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  FilePlus2,
  FileText,
  FolderClock,
  HardDrive,
  Package,
  Settings as SettingsIcon,
  ShieldCheck,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { formatArabicDateOnly, formatPiastres } from '../domain/money';
import { OWNER_NAME } from '../domain/seedData';
import type { InventorySession, ReplenishmentInvoice, Settings } from '../domain/types';
import type { AppRoute } from './AppShell';

interface DashboardViewProps {
  settings: Settings;
  latestConfirmedInventory: InventorySession | null;
  latestInvoice: ReplenishmentInvoice | null;
  inventoryCount: number;
  invoiceCount: number;
  onNavigate: (route: AppRoute) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  latestConfirmedInventory,
  latestInvoice,
  inventoryCount,
  invoiceCount,
  onNavigate,
}) => {
  const actionCards: {
    route: AppRoute;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    gradient: string;
    shadow: string;
  }[] = [
    {
      route: 'inventory',
      title: 'جرد جديد',
      subtitle: 'إدخال الكميات الفعلية وحساب الاستعاضة ونقص السكر والزيت',
      icon: <ClipboardList className="h-7 w-7 text-white" />,
      gradient: 'from-blue-500 to-blue-700',
      shadow: 'shadow-[0_4px_0_0_#1e40af]',
    },
    {
      route: 'invoice',
      title: 'فاتورة استعاضة جديدة',
      subtitle: 'إدخال فاتورة الاستعاضة يدوياً مع منع التجاوز المالي نهائياً',
      icon: <FilePlus2 className="h-7 w-7 text-white" />,
      gradient: 'from-emerald-500 to-teal-700',
      shadow: 'shadow-[0_4px_0_0_#0f766e]',
    },
    {
      route: 'history-inventory',
      title: 'سجل الجرد',
      subtitle: `${inventoryCount > 0 ? `${inventoryCount} عملية مسجلة` : 'عرض كافة عمليات الجرد السابقة'}`,
      icon: <FolderClock className="h-7 w-7 text-white" />,
      gradient: 'from-sky-500 to-indigo-600',
      shadow: 'shadow-[0_4px_0_0_#3730a3]',
    },
    {
      route: 'history-invoices',
      title: 'سجل فواتير الاستعاضة',
      subtitle: `${invoiceCount > 0 ? `${invoiceCount} فاتورة مسجلة` : 'عرض الفواتير المعتمدة والمسودات والملغاة'}`,
      icon: <FileText className="h-7 w-7 text-white" />,
      gradient: 'from-teal-500 to-cyan-700',
      shadow: 'shadow-[0_4px_0_0_#155e75]',
    },
    {
      route: 'products',
      title: 'الأصناف والأسعار',
      subtitle: 'إدارة أصناف الجرد والاستعاضة وسجل تغييرات الأسعار',
      icon: <Package className="h-7 w-7 text-white" />,
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-[0_4px_0_0_#c2410c]',
    },
    {
      route: 'settings',
      title: 'الإعدادات والنسخ الاحتياطي',
      subtitle: 'حد التأمين، الوحدات، تصدير واستيراد النسخة الاحتياطية',
      icon: <SettingsIcon className="h-7 w-7 text-white" />,
      gradient: 'from-slate-600 to-slate-800',
      shadow: 'shadow-[0_4px_0_0_#1e293b]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Identity Banner */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl">
              لوحة التحكم الرئيسية
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              <span>بإدارة: </span>
              <strong className="font-bold text-blue-700 dark:text-blue-400">
                {OWNER_NAME}
              </strong>
              <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
              <span className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400">
                <HardDrive className="h-4 w-4" />
                البيانات محفوظة على هذا الجهاز
              </span>
            </p>
          </div>
          {latestInvoice && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              آخر فاتورة: <span className="font-bold text-slate-800 dark:text-slate-200">{latestInvoice.serialNumber}</span>
              <span className="mx-1.5">·</span>
              <span className="font-num font-bold">
                {formatPiastres(latestInvoice.invoiceTotalInPiastres, true)}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Real KPI Cards (Zero fake numbers) */}
      <section aria-label="ملخص المؤشرات الحالية" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-100">قيمة التأمين الحالية</span>
            <ShieldCheck className="h-5 w-5 text-amber-300" />
          </div>
          <div className="font-num mt-3 text-2xl font-extrabold tracking-tight">
            {formatPiastres(settings.insuranceLimitInPiastres, true)}
          </div>
          <div className="mt-1 text-xs text-blue-100/90">
            المرجع المالي لحساب الاستعاضة
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-700 p-5 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-teal-100">آخر قيمة مخزون محفوظة</span>
            <Wallet className="h-5 w-5 text-teal-100" />
          </div>
          <div className="font-num mt-3 text-2xl font-extrabold tracking-tight">
            {latestConfirmedInventory
              ? formatPiastres(
                  latestConfirmedInventory.totalInventoryValueInPiastres,
                  true,
                )
              : 'لا توجد عملية بعد'}
          </div>
          <div className="mt-1 text-xs text-teal-100/90">
            {latestConfirmedInventory
              ? `رقم الجرد: ${latestConfirmedInventory.serialNumber}`
              : 'قم بإجراء جرد مخزون أولاً'}
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-800 p-5 text-white shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-100">آخر مبلغ استعاضة محسوب</span>
            <TrendingDown className="h-5 w-5 text-amber-300" />
          </div>
          <div className="font-num mt-3 text-2xl font-extrabold tracking-tight">
            {latestConfirmedInventory
              ? formatPiastres(
                  latestConfirmedInventory.replenishmentRequiredInPiastres,
                  true,
                )
              : 'لا توجد عملية بعد'}
          </div>
          <div className="mt-1 text-xs text-indigo-100/90">
            {latestConfirmedInventory
              ? latestConfirmedInventory.surplusOverInsuranceInPiastres > 0
                ? `زيادة عن التأمين: ${formatPiastres(
                    latestConfirmedInventory.surplusOverInsuranceInPiastres,
                    true,
                  )}`
                : 'مبلغ الاستحقاق من آخر جرد معتمد'
              : 'يحسب تلقائياً بعد اعتماد الجرد'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              تاريخ آخر جرد معتمد
            </span>
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 text-lg font-extrabold text-slate-900 dark:text-white">
            {latestConfirmedInventory
              ? formatArabicDateOnly(latestConfirmedInventory.sessionDate)
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {latestConfirmedInventory
              ? `العمليات المسجلة: ${inventoryCount} جرد · ${invoiceCount} فاتورة`
              : 'لا توجد سجلات معتمدة بعد'}
          </div>
        </div>
      </section>

      {/* 6 Primary Action Cards */}
      <section aria-label="العمليات والشاشات الرئيسية">
        <h2 className="mb-3 text-base font-extrabold text-slate-800 dark:text-slate-100">
          العمليات الأساسية
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actionCards.map((card) => (
            <button
              key={card.route}
              type="button"
              onClick={() => onNavigate(card.route)}
              className="group flex min-h-[120px] items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md active:translate-y-0 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b ${card.gradient} ${card.shadow}`}
                >
                  {card.icon}
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-400">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {card.subtitle}
                  </p>
                </div>
              </div>
              <ArrowLeft className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:-translate-x-1 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
