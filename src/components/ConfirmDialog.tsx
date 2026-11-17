import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
  requireTextReason?: {
    label: string;
    placeholder: string;
  };
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  variant = 'primary',
  requireTextReason,
  onConfirm,
  onCancel,
  busy = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const icon =
    variant === 'danger' ? (
      <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
    ) : variant === 'warning' ? (
      <Info className="h-6 w-6 text-amber-600 dark:text-amber-400" />
    ) : (
      <CheckCircle2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
    );

  const confirmBtnStyle =
    variant === 'danger'
      ? 'bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-[0_3px_0_0_#991b1b]'
      : variant === 'warning'
        ? 'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-[0_3px_0_0_#b45309]'
        : 'bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-[0_3px_0_0_#1e40af]';

  const handleConfirm = () => {
    if (requireTextReason && !reason.trim()) {
      setError('يرجى إدخال السبب قبل المتابعة.');
      return;
    }
    onConfirm(requireTextReason ? reason.trim() : undefined);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              {icon}
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {description}
        </div>

        {requireTextReason && (
          <div className="mt-4">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
              {requireTextReason.label} <span className="text-red-600">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder={requireTextReason.placeholder}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {error && (
              <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`btn-3d min-h-[44px] rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50 ${confirmBtnStyle}`}
          >
            {busy ? 'جارٍ التنفيذ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
