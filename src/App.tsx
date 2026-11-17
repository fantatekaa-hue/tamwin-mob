/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AppShell, type AppRoute } from './components/AppShell';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DashboardView } from './components/DashboardView';
import { HistoryView } from './components/HistoryView';
import { ProductsView } from './components/ProductsView';
import { SettingsView } from './components/SettingsView';
import { SplashScreen } from './components/SplashScreen';
import { WorkspaceView } from './components/WorkspaceView';
import {
  ensureInitialized,
  getAllInventorySessions,
  getAllProducts,
  getAllReplenishmentInvoices,
  getAllUnits,
  getInsuranceHistory,
  getPriceHistory,
  getSettings,
  updateTheme,
} from './db/repository';
import { INITIAL_SETTINGS } from './domain/seedData';
import type {
  InsuranceHistory,
  InventorySession,
  PriceHistory,
  Product,
  ReplenishmentInvoice,
  Settings,
  Unit,
} from './domain/types';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState('');

  const [route, setRoute] = useState<AppRoute>('workspace');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(
    null,
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );

  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [insuranceHistory, setInsuranceHistory] = useState<InsuranceHistory[]>(
    [],
  );
  const [inventorySessions, setInventorySessions] = useState<
    InventorySession[]
  >([]);
  const [invoices, setInvoices] = useState<ReplenishmentInvoice[]>([]);

  const [isFormDirty, setIsFormDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  const refreshAll = useCallback(async () => {
    await ensureInitialized();
    const [s, u, p, ph, ih, invs, facs] = await Promise.all([
      getSettings(),
      getAllUnits(),
      getAllProducts(),
      getPriceHistory(),
      getInsuranceHistory(),
      getAllInventorySessions(),
      getAllReplenishmentInvoices(),
    ]);
    setSettings(s);
    setUnits(u);
    setProducts(p);
    setPriceHistory(ph);
    setInsuranceHistory(ih);
    setInventorySessions(invs);
    setInvoices(facs);
  }, []);

  useEffect(() => {
    refreshAll()
      .then(() => setReady(true))
      .catch((err) => {
        setInitError(
          err instanceof Error
            ? err.message
            : 'تعذر تهيئة قاعدة البيانات المحلية (IndexedDB).',
        );
      });
  }, [refreshAll]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'dark',
      settings.theme === 'dark',
    );
  }, [settings.theme]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isFormDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isFormDirty]);

  const executeProtectedNav = useCallback(
    (action: () => void) => {
      if (isFormDirty) {
        setPendingNav(() => action);
      } else {
        action();
      }
    },
    [isFormDirty],
  );

  const handleNavigate = useCallback(
    (nextRoute: AppRoute) => {
      executeProtectedNav(() => {
        if (
          nextRoute === 'workspace' ||
          nextRoute === 'inventory' ||
          nextRoute === 'invoice'
        ) {
          setSelectedInventoryId(null);
          setSelectedInvoiceId(null);
          setRoute('workspace');
        } else {
          setRoute(nextRoute);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    },
    [executeProtectedNav],
  );

  const handleOpenInventory = useCallback(
    (sessionId: string) => {
      executeProtectedNav(() => {
        setSelectedInventoryId(sessionId);
        setSelectedInvoiceId(null);
        setRoute('workspace');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    },
    [executeProtectedNav],
  );

  const handleOpenInvoice = useCallback(
    (invoiceId: string) => {
      executeProtectedNav(() => {
        setSelectedInventoryId(null);
        setSelectedInvoiceId(invoiceId);
        setRoute('workspace');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    },
    [executeProtectedNav],
  );

  const handleToggleTheme = async () => {
    const next = settings.theme === 'dark' ? 'light' : 'dark';
    await updateTheme(next);
    await refreshAll();
  };

  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-md">
          <h1 className="text-lg font-extrabold text-red-700">
            تعذر تشغيل قاعدة البيانات المحلية
          </h1>
          <p className="mt-2 text-sm text-slate-700">{initError}</p>
        </div>
      </div>
    );
  }

  if (showSplash) {
    return <SplashScreen onContinue={() => setShowSplash(false)} />;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-6 text-sm font-bold text-slate-600 dark:bg-[#0B1324] dark:text-slate-300">
        جارٍ تحميل بيانات الجهاز المحلية...
      </div>
    );
  }

  const latestConfirmedInventory =
    inventorySessions.find((s) => s.status === 'confirmed') ?? null;
  const latestInvoice = invoices[0] ?? null;

  return (
    <AppShell
      currentRoute={route}
      onNavigate={handleNavigate}
      theme={settings.theme}
      onToggleTheme={() => void handleToggleTheme()}
    >
      {route === 'workspace' && (
        <WorkspaceView
          settings={settings}
          products={products}
          units={units}
          initialInventoryId={selectedInventoryId}
          initialInvoiceId={selectedInvoiceId}
          onDataChanged={refreshAll}
          onOpenWorkspaceIds={(invId, facId) => {
            setSelectedInventoryId(invId);
            setSelectedInvoiceId(facId);
            setRoute('workspace');
          }}
          onDirtyChange={setIsFormDirty}
        />
      )}

      {route === 'dashboard' && (
        <DashboardView
          settings={settings}
          latestConfirmedInventory={latestConfirmedInventory}
          latestInvoice={latestInvoice}
          inventoryCount={inventorySessions.length}
          invoiceCount={invoices.length}
          onNavigate={handleNavigate}
        />
      )}

      {(route === 'history-inventory' || route === 'history-invoices') && (
        <HistoryView
          initialTab={route === 'history-invoices' ? 'invoices' : 'inventory'}
          inventorySessions={inventorySessions}
          invoices={invoices}
          products={products}
          onOpenInventory={handleOpenInventory}
          onOpenInvoice={handleOpenInvoice}
          onDataChanged={refreshAll}
        />
      )}

      {route === 'products' && (
        <ProductsView
          products={products}
          units={units}
          priceHistory={priceHistory}
          onDataChanged={refreshAll}
        />
      )}

      {route === 'settings' && (
        <SettingsView
          settings={settings}
          units={units}
          insuranceHistory={insuranceHistory}
          onDataChanged={refreshAll}
        />
      )}

      <ConfirmDialog
        open={pendingNav !== null}
        title="تغييرات غير محفوظة"
        variant="warning"
        description="لديك بيانات مدخلة لم يتم حفظها بعد. هل تريد المغادرة دون حفظ؟ (يمكنك البقاء وحفظها كمسودة)."
        confirmLabel="مغادرة دون حفظ"
        cancelLabel="البقاء في الصفحة"
        onCancel={() => setPendingNav(null)}
        onConfirm={() => {
          const fn = pendingNav;
          setPendingNav(null);
          setIsFormDirty(false);
          fn?.();
        }}
      />
    </AppShell>
  );
}
