import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  cancelInventorySession,
  cancelReplenishmentInvoice,
  deleteInventoryDraft,
  deleteInvoiceDraft,
  getInventorySessionWithLines,
  saveInventorySession,
} from '../db/repository';
import {
  formatArabicDateTime,
  formatPercent,
  formatPiastres,
} from '../domain/money';
import type {
  InventorySession,
  Product,
  RecordStatus,
  ReplenishmentInvoice,
} from '../domain/types';
import { ConfirmDialog } from './ConfirmDialog';

interface HistoryViewProps {
  initialTab: 'inventory' | 'invoices';
  inventorySessions: InventorySession[];
  invoices: ReplenishmentInvoice[];
  products: Product[];
  onOpenInventory: (sessionId: string) => void;
  onOpenInvoice: (invoiceId: string) => void;
  onDataChanged: () => Promise<void>;
}

const STATUS_LABEL: Record<RecordStatus, string> = {
  confirmed: 'معتمد',
  draft: 'مسودة',
  cancelled: 'ملغى',
};

const STATUS_STYLE: Record<RecordStatus, string> = {
  confirmed: 'text-emerald-700 dark:text-emerald-400',
  draft: 'text-amber-700 dark:text-amber-400',
  cancelled: 'text-red-700 dark:text-red-400',
};

export const HistoryView: React.FC<HistoryViewProps> = ({
  initialTab,
  inventorySessions,
  invoices,
  products,
  onOpenInventory,
  onOpenInvoice,
  onDataChanged,
}) => {
  const [tab, setTab] = useState<'inventory' | 'invoices'>(initialTab);
  const [statusFilter, setStatusFilter] = useState<'all' | RecordStatus>('all');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [cancelTarget, setCancelTarget] = useState<{
    type: 'inventory' | 'invoice';
    id: string;
    serial: string;
  } | null>(null);
  const [deleteDraftTarget, setDeleteDraftTarget] = useState<{
    type: 'inventory' | 'invoice';
    id: string;
    serial: string;
  } | null>(null);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const filteredInventories = useMemo(() => {
    if (statusFilter === 'all') return inventorySessions;
    return inventorySessions.filter((s) => s.status === statusFilter);
  }, [inventorySessions, statusFilter]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'all') return invoices;
    return invoices.filter((i) => i.status === statusFilter);
  }, [invoices, statusFilter]);

  const handleCloneInventory = async (sessionId: string) => {
    setBusy(true);
    setErrorMsg('');
    try {
      const source = await getInventorySessionWithLines(sessionId);
      if (!source) throw new Error('تعذر قراءة الجرد المصدر.');
      const activeProducts = products.filter((p) => p.isActive);
      const items = activeProducts.map((p) => {
        const old = source.lines.find((l) => l.productId === p.id);
        return {
          productId: p.id,
          quantity: old ? old.quantity : 0,
        };
      });
      const created = await saveInventorySession({
        mode: 'draft',
        sessionDate: new Date().toISOString(),
        notes: `نسخة من ${source.session.serialNumber}`,
        items,
      });
      await onDataChanged();
      onOpenInventory(created.session.id);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'تعذر إنشاء نسخة من الجرد.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCancel = async (reason?: string) => {
    if (!cancelTarget || !reason) return;
    setBusy(true);
    setErrorMsg('');
    try {
      if (cancelTarget.type === 'inventory') {
        await cancelInventorySession(cancelTarget.id, reason);
      } else {
        await cancelReplenishmentInvoice(cancelTarget.id, reason);
      }
      await onDataChanged();
      setCancelTarget(null);
    } catch (err) {
      setCancelTarget(null);
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إلغاء السجل.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteDraft = async () => {
    if (!deleteDraftTarget) return;
    setBusy(true);
    setErrorMsg('');
    try {
      if (deleteDraftTarget.type === 'inventory') {
        await deleteInventoryDraft(deleteDraftTarget.id);
      } else {
        await deleteInvoiceDraft(deleteDraftTarget.id);
      }
      await onDataChanged();
      setDeleteDraftTarget(null);
    } catch (err) {
      setDeleteDraftTarget(null);
      setErrorMsg(err instanceof Error ? err.message : 'تعذر حذف المسودة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              سجل العمليات التاريخي
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              جميع السجلات مرتبة من الأحدث إلى الأقدم وتحفظ الأسعار والوحدات كما
              كانت وقت العملية.
            </p>
          </div>

          {/* Primary Tab Switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTab('inventory')}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-extrabold transition-colors ${
                tab === 'inventory'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              <span>سجل الجرد ({inventorySessions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('invoices')}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-extrabold transition-colors ${
                tab === 'invoices'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>سجل الفواتير ({invoices.length})</span>
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            تصفية بالحالة:
          </span>
          {(
            [
              { id: 'all', label: 'الكل' },
              { id: 'confirmed', label: 'معتمد' },
              { id: 'draft', label: 'مسودة' },
              { id: 'cancelled', label: 'ملغى' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === f.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200">
          {errorMsg}
        </div>
      )}

      {/* Inventory History Table */}
      {tab === 'inventory' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {filteredInventories.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              لا توجد عمليات جرد مطابقة حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr className="bg-gradient-to-l from-blue-700 to-blue-800 text-white">
                    <th className="px-4 py-3.5 font-extrabold">رقم الجرد</th>
                    <th className="px-4 py-3.5 font-bold">التاريخ والوقت</th>
                    <th className="px-4 py-3.5 font-bold">إجمالي المخزون</th>
                    <th className="px-4 py-3.5 font-bold">قيمة التأمين</th>
                    <th className="px-4 py-3.5 font-bold">الاستعاضة المحسوبة</th>
                    <th className="px-4 py-3.5 font-bold">الحالة</th>
                    <th className="px-4 py-3.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventories.map((session, idx) => (
                    <tr
                      key={session.id}
                      className={`border-b border-slate-200 dark:border-slate-800 ${
                        idx % 2 === 1
                          ? 'bg-sky-50/60 dark:bg-slate-800/40'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-white">
                        {session.serialNumber}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {formatArabicDateTime(session.sessionDate)}
                      </td>
                      <td className="font-num px-4 py-3 font-bold text-slate-900 dark:text-white">
                        {formatPiastres(
                          session.totalInventoryValueInPiastres,
                          true,
                        )}
                      </td>
                      <td className="font-num px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatPiastres(
                          session.insuranceLimitSnapshotInPiastres,
                          true,
                        )}
                      </td>
                      <td className="font-num px-4 py-3 font-extrabold text-emerald-700 dark:text-emerald-400">
                        {formatPiastres(
                          session.replenishmentRequiredInPiastres,
                          true,
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-xs font-extrabold ${
                          STATUS_STYLE[session.status]
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {session.status === 'confirmed' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : session.status === 'cancelled' ? (
                            <XCircle className="h-4 w-4" />
                          ) : null}
                          {STATUS_LABEL[session.status]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenInventory(session.id)}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300"
                          >
                            <Eye className="h-4 w-4" />
                            <span>
                              {session.status === 'draft'
                                ? 'استكمال'
                                : 'عرض التفاصيل'}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleCloneInventory(session.id)}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <Copy className="h-4 w-4" />
                            <span>جرد جديد كنسخة</span>
                          </button>

                          {session.status === 'confirmed' && (
                            <button
                              type="button"
                              onClick={() =>
                                setCancelTarget({
                                  type: 'inventory',
                                  id: session.id,
                                  serial: session.serialNumber,
                                })
                              }
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>إلغاء</span>
                            </button>
                          )}

                          {session.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteDraftTarget({
                                  type: 'inventory',
                                  id: session.id,
                                  serial: session.serialNumber,
                                })
                              }
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>حذف المسودة</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoices History Table */}
      {tab === 'invoices' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {filteredInvoices.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              لا توجد فواتير استعاضة مطابقة حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr className="bg-gradient-to-l from-teal-700 to-emerald-700 text-white">
                    <th className="px-4 py-3.5 font-extrabold">رقم الفاتورة</th>
                    <th className="px-4 py-3.5 font-bold">التاريخ والوقت</th>
                    <th className="px-4 py-3.5 font-bold">الجرد المرتبط</th>
                    <th className="px-4 py-3.5 font-bold">المطلوب</th>
                    <th className="px-4 py-3.5 font-bold">إجمالي الفاتورة</th>
                    <th className="px-4 py-3.5 font-bold">المتبقي</th>
                    <th className="px-4 py-3.5 font-bold">نسبة الاستخدام</th>
                    <th className="px-4 py-3.5 font-bold">الحالة</th>
                    <th className="px-4 py-3.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className={`border-b border-slate-200 dark:border-slate-800 ${
                        idx % 2 === 1
                          ? 'bg-sky-50/60 dark:bg-slate-800/40'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-white">
                        {inv.serialNumber}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {formatArabicDateTime(inv.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-700 dark:text-blue-400">
                        {inv.inventorySerialSnapshot}
                      </td>
                      <td className="font-num px-4 py-3 text-slate-700 dark:text-slate-200">
                        {formatPiastres(
                          inv.requiredAmountSnapshotInPiastres,
                          true,
                        )}
                      </td>
                      <td className="font-num px-4 py-3 font-extrabold text-emerald-700 dark:text-emerald-400">
                        {formatPiastres(inv.invoiceTotalInPiastres, true)}
                      </td>
                      <td className="font-num px-4 py-3 text-slate-700 dark:text-slate-200">
                        {formatPiastres(inv.remainingAmountInPiastres, true)}
                      </td>
                      <td className="font-num px-4 py-3 font-bold text-slate-800 dark:text-slate-200">
                        {formatPercent(inv.usagePercent)}
                      </td>
                      <td
                        className={`px-4 py-3 text-xs font-extrabold ${
                          STATUS_STYLE[inv.status]
                        }`}
                      >
                        {STATUS_LABEL[inv.status]}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(inv.id)}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300"
                          >
                            <Eye className="h-4 w-4" />
                            <span>
                              {inv.status === 'draft'
                                ? 'استكمال'
                                : 'عرض التفاصيل'}
                            </span>
                          </button>

                          {inv.status === 'confirmed' && (
                            <button
                              type="button"
                              onClick={() =>
                                setCancelTarget({
                                  type: 'invoice',
                                  id: inv.id,
                                  serial: inv.serialNumber,
                                })
                              }
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>إلغاء</span>
                            </button>
                          )}

                          {inv.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteDraftTarget({
                                  type: 'invoice',
                                  id: inv.id,
                                  serial: inv.serialNumber,
                                })
                              }
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>حذف المسودة</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cancel Confirmed Record Dialog */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={`إلغاء ${cancelTarget?.serial ?? ''}`}
        variant="danger"
        busy={busy}
        description="سيبقى السجل محفوظاً في التاريخ بحالة ملغى مع سبب الإلغاء، ولن يتم حذفه نهائياً."
        requireTextReason={{
          label: 'سبب الإلغاء',
          placeholder: 'أدخل سبب إلغاء العملية...',
        }}
        confirmLabel="تأكيد الإلغاء"
        cancelLabel="تراجع"
        onCancel={() => setCancelTarget(null)}
        onConfirm={(reason) => void handleConfirmCancel(reason)}
      />

      {/* Delete Draft Dialog */}
      <ConfirmDialog
        open={Boolean(deleteDraftTarget)}
        title={`حذف المسودة ${deleteDraftTarget?.serial ?? ''}`}
        variant="danger"
        busy={busy}
        description="هل تريد حذف هذه المسودة نهائياً؟"
        confirmLabel="حذف المسودة"
        cancelLabel="تراجع"
        onCancel={() => setDeleteDraftTarget(null)}
        onConfirm={() => void handleConfirmDeleteDraft()}
      />
    </div>
  );
};
