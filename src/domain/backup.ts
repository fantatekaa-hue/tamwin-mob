import type { BackupDataTables, BackupPayload } from './types';

export interface BackupSummaryCounts {
  units: number;
  products: number;
  priceHistory: number;
  insuranceHistory: number;
  inventorySessions: number;
  replenishmentInvoices: number;
}

export type ParseBackupResult =
  | { ok: true; payload: BackupPayload; counts: BackupSummaryCounts }
  | { ok: false; error: string };

export function parseAndValidateBackupFile(rawText: string): ParseBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: 'ملف النسخة الاحتياطية غير صالح أو تالف (تنسيق JSON غير صحيح).',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'بنية ملف النسخة الاحتياطية غير صالحة.' };
  }

  const obj = parsed as Partial<BackupPayload>;
  if (obj.schemaVersion !== 1) {
    return {
      ok: false,
      error: `إصدار النسخة الاحتياطية غير مدعوم (${String(obj.schemaVersion)}).`,
    };
  }

  if (!obj.data || typeof obj.data !== 'object') {
    return { ok: false, error: 'بيانات الجداول مفقودة من ملف النسخة الاحتياطية.' };
  }

  const requiredArrays: (keyof BackupDataTables)[] = [
    'units',
    'products',
    'priceHistory',
    'insuranceHistory',
    'settings',
    'inventorySessions',
    'inventoryLines',
    'replenishmentInvoices',
    'replenishmentLines',
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(obj.data[key])) {
      return {
        ok: false,
        error: `جدول "${key}" مفقود أو غير صالح داخل النسخة الاحتياطية.`,
      };
    }
  }

  if (obj.data.units.length === 0 || obj.data.products.length === 0) {
    return {
      ok: false,
      error: 'النسخة الاحتياطية لا تحتوي على بيانات الأصناف أو الوحدات الأساسية.',
    };
  }

  const payload = obj as BackupPayload;
  return {
    ok: true,
    payload,
    counts: {
      units: payload.data.units.length,
      products: payload.data.products.length,
      priceHistory: payload.data.priceHistory.length,
      insuranceHistory: payload.data.insuranceHistory.length,
      inventorySessions: payload.data.inventorySessions.length,
      replenishmentInvoices: payload.data.replenishmentInvoices.length,
    },
  };
}
