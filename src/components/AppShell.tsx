import React, { useState } from 'react';
import {
  ClipboardList,
  Download,
  HardDrive,
  History,
  LayoutDashboard,
  Moon,
  Package,
  Settings as SettingsIcon,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { APP_NAME, OWNER_NAME } from '../domain/seedData';
import type { ThemeMode } from '../domain/types';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export type AppRoute =
  | 'workspace'
  | 'dashboard'
  | 'inventory'
  | 'invoice'
  | 'history-inventory'
  | 'history-invoices'
  | 'products'
  | 'settings';

interface AppShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: AppRoute; label: string; icon: React.ReactNode }[] = [
  {
    id: 'workspace',
    label: 'الجرد والفاتورة',
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    id: 'dashboard',
    label: 'لوحة التحكم',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    id: 'history-inventory',
    label: 'السجلات',
    icon: <History className="h-5 w-5" />,
  },
  {
    id: 'products',
    label: 'الأصناف',
    icon: <Package className="h-5 w-5" />,
  },
  {
    id: 'settings',
    label: 'الإعدادات',
    icon: <SettingsIcon className="h-5 w-5" />,
  },
];

export const AppShell: React.FC<AppShellProps> = ({
  currentRoute,
  onNavigate,
  theme,
  onToggleTheme,
  children,
}) => {
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const isHistoryRoute =
    currentRoute === 'history-inventory' || currentRoute === 'history-invoices';
  const isWorkspaceRoute =
    currentRoute === 'workspace' ||
    currentRoute === 'inventory' ||
    currentRoute === 'invoice';

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#172033] dark:bg-[#0B1324] dark:text-slate-100">
      {/* Top Bar */}
      <header className="no-print sticky top-0 z-30 border-b border-blue-800/20 bg-gradient-to-l from-blue-700 via-blue-800 to-teal-700 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          {/* Zone 1: Brand + Owner */}
          <button
            type="button"
            onClick={() => onNavigate('workspace')}
            className="flex min-h-[44px] items-center gap-3 text-right focus:outline-none"
          >
            <img
              src={`${import.meta.env.BASE_URL}icon.svg`}
              alt={APP_NAME}
              className="h-9 w-9 shrink-0 rounded-lg shadow-sm"
            />
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold leading-tight text-white sm:text-lg">
                {APP_NAME}
              </div>
              <div className="truncate text-xs font-bold text-amber-300">
                {OWNER_NAME}
              </div>
            </div>
          </button>

          {/* Zone 2: Desktop Single-Line Nav Links */}
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="التنقل الرئيسي"
          >
            {NAV_ITEMS.map((item) => {
              const active =
                item.id === currentRoute ||
                (item.id === 'workspace' && isWorkspaceRoute) ||
                (item.id === 'history-inventory' && isHistoryRoute);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                    active
                      ? 'bg-white text-blue-800 shadow-sm'
                      : 'text-blue-50 hover:bg-white/15'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Contextual Utilities (Install / Theme) */}
          <div className="flex shrink-0 items-center gap-2">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="btn-3d flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-b from-amber-300 to-amber-400 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-[0_2px_0_0_#b45309] hover:from-amber-200 hover:to-amber-300"
              >
                <Download className="h-4 w-4" />
                <span>تثبيت التطبيق</span>
              </button>
            )}

            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
              >
                <Download className="h-4 w-4" />
                <span>تثبيت iOS</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
              aria-label={
                theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25"
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-amber-300" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Local / Offline Reality Strip (Unboxed clean metadata) */}
      <div className="no-print border-b border-slate-200 bg-white/80 px-4 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <HardDrive className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            )}
            <span>
              {isOnline
                ? 'محلي على هذا الجهاز · يعمل دون إنترنت بعد التحميل'
                : 'وضع عدم الاتصال نشط · جميع العمليات تعمل محلياً على هذا الجهاز'}
            </span>
          </div>
          <span className="hidden text-slate-500 sm:inline dark:text-slate-400">
            البيانات مستقلة على هذا الجهاز ولا تُرفع لأي خادم
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-[1440px] px-3 pb-24 pt-4 sm:px-5 lg:pb-10">
        {children}
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation (hidden on lg+) */}
      <nav
        className="no-print fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
        aria-label="التنقل السفلي"
      >
        <div className="grid h-16 grid-cols-5 items-center px-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.id === currentRoute ||
              (item.id === 'workspace' && isWorkspaceRoute) ||
              (item.id === 'history-inventory' && isHistoryRoute);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-bold transition-colors ${
                  active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* iOS Safari Install Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                تثبيت التطبيق على iPhone / iPad
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pr-5 text-sm text-slate-700 dark:text-slate-300">
              <li>اضغط على زر المشاركة (Share) في شريط متصفح Safari.</li>
              <li>اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
              <li>اضغط «إضافة» ليظهر البرنامج كتطبيق مستقل ويعمل دون إنترنت.</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 min-h-[44px] w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              فهمت
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
