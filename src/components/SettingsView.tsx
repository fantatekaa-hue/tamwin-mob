import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  Info,
  Moon,
  Plus,
  Power,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import {
  addUnit,
  exportBackupPayload,
  getCurrentDatabaseCounts,
  parseAndValidateBackupFile,
  restoreBackupPayload,
  toggleUnitActive,
  updateInsuranceLimit,
  updateSugarOilRule,
  updateTheme,
  type BackupSummaryCounts,
} from '../db/repository';
import {
  formatArabicDateTime,
  formatPiastres,
  parseEgpToPiastres,
} from '../domain/money';
import { APP_NAME, APP_VERSION, OWNER_NAME } from '../domain/seedData';
import type {
  BackupPayload,
  InsuranceHistory,
  Settings,
  ThemeMode,
  Unit,
} from '../domain/types';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsViewProps {
  settings: Settings;
  units: Unit[];
  insuranceHistory: InsuranceHistory[];
  onDataChanged: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  units,
  insuranceHistory,
  onDataChanged,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const [insuranceInput, setInsuranceInput] = useState(
    (settings.insuranceLimitInPiastres / 100).toFixed(2),
  );
  const [insuranceError, setInsuranceError] = useState('');
  const [pendingInsurancePiastres, setPendingInsurancePiastres] = useState<
    number | null
  >(null);

  const [newUnitName, setNewUnitName] = useState('');
  const [unitError, setUnitError] = useState('');

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Backup/Restore states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingBackup, setPendingBackup] = useState<{
    payload: BackupPayload;
    backupCounts: BackupSummaryCounts;
    currentCounts: BackupSummaryCounts;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRequestInsuranceUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setInsuranceError('');
    const parsed = parseEgpToPiastres(insuranceInput);
    if (!parsed.ok) {
      setInsuranceError(parsed.error);
      return;
    }
    if (parsed.piastres <= 0) {
      setInsuranceError('قيمة التأمين يجب أن تكون أكبر من صفر.');
      return;
    }
    if (parsed.piastres === settings.insuranceLimitInPiastres) {
      setInsuranceError('القيمة المدخلة مطابقة لقيمة التأمين الحالية.');
      return;
    }
    setPendingInsurancePiastres(parsed.piastres);
  };

  const handleConfirmInsuranceUpdate = async () => {
    if (pendingInsurancePiastres === null) return;
    setBusy(true);
    try {
      await updateInsuranceLimit(pendingInsurancePiastres);
      await onDataChanged();
      setPendingInsurancePiastres(null);
      setStatusMessage({
        type: 'success',
        text: `تم تحديث قيمة التأمين إلى ${formatPiastres(
          pendingInsurancePiastres,
          true,
        )} وتسجيل التعديل في السجل.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر تحديث قيمة التأمين.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnitError('');
    try {
      await addUnit(newUnitName);
      setNewUnitName('');
      await onDataChanged();
      setStatusMessage({
        type: 'success',
        text: 'تمت إضافة الوحدة الجديدة بنجاح.',
      });
    } catch (err) {
      setUnitError(
        err instanceof Error ? err.message : 'تعذر إضافة الوحدة.',
      );
    }
  };

  const handleToggleUnit = async (unit: Unit) => {
    setUnitError('');
    try {
      await toggleUnitActive(unit.id, !unit.isActive);
      await onDataChanged();
    } catch (err) {
      setUnitError(
        err instanceof Error ? err.message : 'تعذر تحديث حالة الوحدة.',
      );
    }
  };

  const handleToggleSugarOilRule = async () => {
    await updateSugarOilRule(!settings.requireSugarOilExactMatch);
    await onDataChanged();
  };

  const handleSelectTheme = async (theme: ThemeMode) => {
    await updateTheme(theme);
    await onDataChanged();
  };

  const handleExportBackup = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const payload = await exportBackupPayload();
      const json = JSON.stringify(payload, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `tamween-backup-${stamp}.tamweenbackup`;

      const cap = (
        window as unknown as {
          Capacitor?: {
            isNativePlatform?: () => boolean;
            Plugins?: {
              Filesystem?: {
                writeFile: (opts: {
                  path: string;
                  data: string;
                  directory: string;
                  encoding: string;
                }) => Promise<{ uri: string }>;
              };
              Share?: {
                share: (opts: {
                  title?: string;
                  url?: string;
                  dialogTitle?: string;
                }) => Promise<void>;
              };
            };
          };
        }
      ).Capacitor;

      if (cap?.isNativePlatform?.() && cap.Plugins?.Filesystem) {
        const res = await cap.Plugins.Filesystem.writeFile({
          path: fileName,
          data: json,
          directory: 'CACHE',
          encoding: 'utf8',
        });
        if (cap.Plugins.Share) {
          await cap.Plugins.Share.share({
            title: 'نسخة احتياطية — مساعد استعاضة التموين',
            url: res.uri,
            dialogTitle: 'حفظ أو مشاركة النسخة الاحتياطية',
          });
        }
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      await onDataChanged();
      setStatusMessage({
        type: 'success',
        text: 'تم تصدير النسخة الاحتياطية الكاملة بنجاح وحفظها على جهازك.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'تعذر تصدير النسخة الاحتياطية.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSelectBackupFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setStatusMessage(null);
    try {
      const text = await file.text();
      const parsed = parseAndValidateBackupFile(text);
      if (!parsed.ok) {
        setStatusMessage({ type: 'error', text: parsed.error });
        return;
      }
      const currentCounts = await getCurrentDatabaseCounts();
      setPendingBackup({
        payload: parsed.payload,
        backupCounts: parsed.counts,
        currentCounts,
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'تعذر قراءة الملف المختار. تأكد من صلاحية الملف.',
      });
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingBackup) return;
    setBusy(true);
    try {
      await restoreBackupPayload(pendingBackup.payload);
      await onDataChanged();
      setPendingBackup(null);
      setStatusMessage({
        type: 'success',
        text: 'تم استيراد النسخة الاحتياطية واستعادة كافة البيانات بنجاح.',
      });
    } catch (err) {
      setPendingBackup(null);
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'فشل الاستيراد وتم الحفاظ على البيانات الحالية.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
          الإعدادات والنسخ الاحتياطي
        </h1>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          إدارة حد التأمين، الوحدات، قواعد المطابقة، المظهر، ونقل البيانات بين
          الأجهزة عبر النسخ الاحتياطي المحلي.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-bold ${
            statusMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Insurance Limit */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              قيمة التأمين
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            القيمة الافتراضية 85,000.00 جنيه. تعديلها يطبق على عمليات الجرد
            الجديدة فقط مع حفظ القيمة السابقة في السجل.
          </p>

          <form
            onSubmit={handleRequestInsuranceUpdate}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                قيمة التأمين (ج.م)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={insuranceInput}
                onChange={(e) => {
                  setInsuranceInput(e.target.value);
                  setInsuranceError('');
                }}
                className="font-num mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-base font-extrabold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="btn-3d min-h-[44px] rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_3px_0_0_#1e40af] hover:bg-blue-700"
            >
              تعديل قيمة التأمين
            </button>
          </form>
          {insuranceError && (
            <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">
              {insuranceError}
            </p>
          )}

          {insuranceHistory.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
              <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                سجل تعديلات التأمين
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {insuranceHistory.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      من{' '}
                      <strong className="font-num">
                        {formatPiastres(h.oldLimitInPiastres)}
                      </strong>{' '}
                      إلى{' '}
                      <strong className="font-num text-blue-700 dark:text-blue-400">
                        {formatPiastres(h.newLimitInPiastres, true)}
                      </strong>
                    </span>
                    <span className="text-slate-400">
                      {formatArabicDateTime(h.changedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Backup & Restore */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              النسخ الاحتياطي ونقل البيانات
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            كل جهاز مستقل ببياناته. لنقل البيانات بين Windows وAndroid صدّر ملف
            نسخة احتياطية واستورده في الجهاز الآخر.
          </p>

          <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            تاريخ آخر نسخة احتياطية:{' '}
            <strong>
              {settings.lastBackupAt
                ? formatArabicDateTime(settings.lastBackupAt)
                : 'لم يتم التصدير بعد'}
            </strong>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleExportBackup()}
              className="btn-3d inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-teal-500 to-teal-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_3px_0_0_#115e59] hover:from-teal-600 hover:to-teal-800"
            >
              <Download className="h-5 w-5" />
              <span>تصدير نسخة احتياطية</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="btn-3d inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
            >
              <Upload className="h-5 w-5" />
              <span>استيراد نسخة احتياطية</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tamweenbackup,.json,application/json"
              onChange={(e) => void handleSelectBackupFile(e)}
              className="hidden"
            />
          </div>
        </section>

        {/* Units Management */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            إدارة الوحدات
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            يمكن إضافة وحدات جديدة أو تعطيل الوحدات غير المستخدمة دون حذف
            السجلات التاريخية.
          </p>

          <form onSubmit={(e) => void handleAddUnit(e)} className="mt-3 flex gap-2">
            <input
              type="text"
              value={newUnitName}
              onChange={(e) => {
                setNewUnitName(e.target.value);
                setUnitError('');
              }}
              placeholder="اسم وحدة جديدة (مثال: جركن)"
              className="min-h-[42px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="submit"
              className="btn-3d inline-flex min-h-[42px] items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white shadow-[0_2px_0_0_#1e40af]"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة</span>
            </button>
          </form>
          {unitError && (
            <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">
              {unitError}
            </p>
          )}

          <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {units.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between px-3.5 py-2.5 text-sm"
              >
                <span
                  className={`font-bold ${
                    u.isActive
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-400 line-through'
                  }`}
                >
                  {u.name}
                </span>
                <button
                  type="button"
                  onClick={() => void handleToggleUnit(u)}
                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold ${
                    u.isActive
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>{u.isActive ? 'تعطيل' : 'تفعيل'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Preferences & About */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              قواعد الاعتماد والمظهر
            </h2>

            <div className="mt-4 space-y-4">
              <label className="flex min-h-[52px] cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={settings.requireSugarOilExactMatch}
                  onChange={() => void handleToggleSugarOilRule()}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600"
                />
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    إلزام مطابقة كميات السكر والزيت عند اعتماد الفاتورة
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    الافتراضي: تنبيه فقط بالفرق مع السماح بالاعتماد طالما لم
                    يتجاوز الحد المالي.
                  </p>
                </div>
              </label>

              <div>
                <div className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  مظهر الواجهة
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSelectTheme('light')}
                    className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-bold ${
                      settings.theme === 'light'
                        ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200'
                        : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    <span>الوضع الفاتح</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSelectTheme('dark')}
                    className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-bold ${
                      settings.theme === 'dark'
                        ? 'border-blue-500 bg-slate-800 text-white'
                        : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    <span>الوضع الداكن</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* About Program */}
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-700 to-teal-700 p-5 text-white shadow-md">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-amber-300" />
              <h2 className="text-lg font-extrabold">حول البرنامج</h2>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="text-base font-extrabold">{APP_NAME}</div>
              <div className="font-bold text-amber-300">
                إعداد وتنفيذ لصالح: {OWNER_NAME}
              </div>
              <div className="text-xs text-blue-100">
                الإصدار: {APP_VERSION} · يعمل محلياً دون إنترنت (IndexedDB + PWA)
              </div>
            </div>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="btn-3d mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-400 px-5 py-2 text-xs font-extrabold text-slate-950 shadow-[0_3px_0_0_#b45309]"
              >
                <Download className="h-4 w-4" />
                <span>تثبيت التطبيق على هذا الجهاز</span>
              </button>
            )}
            {isInstalled && (
              <div className="mt-3 text-xs font-bold text-emerald-200">
                ✓ التطبيق مثبت ويعمل كبرنامج مستقل على هذا الجهاز.
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Confirm Insurance Change */}
      <ConfirmDialog
        open={pendingInsurancePiastres !== null}
        title="تأكيد تعديل قيمة التأمين"
        variant="warning"
        busy={busy}
        description={
          pendingInsurancePiastres !== null && (
            <p>
              سيتم تغيير قيمة التأمين من{' '}
              <strong className="font-num">
                {formatPiastres(settings.insuranceLimitInPiastres, true)}
              </strong>{' '}
              إلى{' '}
              <strong className="font-num text-blue-700 dark:text-blue-400">
                {formatPiastres(pendingInsurancePiastres, true)}
              </strong>
              . لن تتأثر عمليات الجرد السابقة وسيُسجّل التعديل بالتاريخ.
            </p>
          )
        }
        confirmLabel="تأكيد التعديل"
        cancelLabel="إلغاء"
        onCancel={() => setPendingInsurancePiastres(null)}
        onConfirm={() => void handleConfirmInsuranceUpdate()}
      />

      {/* Confirm Restore Backup */}
      <ConfirmDialog
        open={pendingBackup !== null}
        title="تأكيد استيراد نسخة احتياطية"
        variant="danger"
        busy={busy}
        description={
          pendingBackup && (
            <div className="space-y-3 text-xs">
              <p className="font-bold text-red-700 dark:text-red-400">
                تحذير: سيؤدي الاستيراد إلى استبدال جميع البيانات الموجودة حالياً
                على هذا الجهاز ببيانات النسخة الاحتياطية!
              </p>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div>
                  <div className="font-extrabold text-slate-800 dark:text-white">
                    البيانات الحالية على الجهاز
                  </div>
                  <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300">
                    <li>الأصناف: {pendingBackup.currentCounts.products}</li>
                    <li>
                      سجلات الجرد: {pendingBackup.currentCounts.inventorySessions}
                    </li>
                    <li>
                      الفواتير: {pendingBackup.currentCounts.replenishmentInvoices}
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="font-extrabold text-blue-700 dark:text-blue-400">
                    بيانات النسخة المستوردة
                  </div>
                  <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300">
                    <li>الأصناف: {pendingBackup.backupCounts.products}</li>
                    <li>
                      سجلات الجرد: {pendingBackup.backupCounts.inventorySessions}
                    </li>
                    <li>
                      الفواتير: {pendingBackup.backupCounts.replenishmentInvoices}
                    </li>
                  </ul>
                </div>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                تاريخ تصدير الملف:{' '}
                {formatArabicDateTime(pendingBackup.payload.exportedAt)}
              </p>
            </div>
          )
        }
        confirmLabel="استبدال قاعدة البيانات بالكامل"
        cancelLabel="إلغاء العملية"
        onCancel={() => setPendingBackup(null)}
        onConfirm={() => void handleConfirmRestore()}
      />
    </div>
  );
};
