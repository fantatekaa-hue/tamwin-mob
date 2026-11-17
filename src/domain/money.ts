export const MAX_SAFE_PIASTRES = 9_999_999_999_99; // ~100 billion piastres (1 billion EGP)
export const MAX_QUANTITY = 1_000_000;

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '٫': '.',
  '،': '',
  ',': '',
};

export function normalizeNumericInput(raw: string): string {
  return raw
    .trim()
    .replace(/[٠-٩٫،,]/g, (ch) => ARABIC_INDIC_DIGITS[ch] ?? ch);
}

export type ParsePriceResult =
  | { ok: true; piastres: number }
  | { ok: false; error: string };

export function parseEgpToPiastres(raw: string | number): ParsePriceResult {
  const str = typeof raw === 'number' ? String(raw) : normalizeNumericInput(raw);
  if (!str) {
    return { ok: false, error: 'السعر مطلوب ولا يمكن تركه فارغاً.' };
  }
  if (str.startsWith('-')) {
    return { ok: false, error: 'لا يُسمح بسعر سالب.' };
  }
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { ok: false, error: 'أدخل سعراً صحيحاً بالأرقام فقط (مثال: 12.35).' };
  }

  const [intPart, decPart = ''] = str.split('.');
  if (decPart.length > 2) {
    return { ok: false, error: 'السعر يقبل منزلتين عشريتين بحد أقصى (قروش).' };
  }

  const pounds = Number(intPart);
  const piastresPart = Number(decPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(pounds) || pounds > Math.floor(MAX_SAFE_PIASTRES / 100)) {
    return { ok: false, error: 'قيمة السعر كبيرة جداً وتتجاوز الحد الآمن.' };
  }

  const totalPiastres = pounds * 100 + piastresPart;
  if (!Number.isSafeInteger(totalPiastres) || totalPiastres > MAX_SAFE_PIASTRES) {
    return { ok: false, error: 'قيمة السعر كبيرة جداً وتتجاوز الحد الآمن.' };
  }

  return { ok: true, piastres: totalPiastres };
}

export type ParseQuantityResult =
  | { ok: true; quantity: number }
  | { ok: false; error: string };

export function parseQuantity(
  raw: string,
  allowFractional: boolean,
): ParseQuantityResult {
  const str = normalizeNumericInput(raw);
  if (!str) {
    return { ok: false, error: 'يرجى إدخال الكمية.' };
  }
  if (str.startsWith('-')) {
    return { ok: false, error: 'لا يُسمح بكمية سالبة.' };
  }
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { ok: false, error: 'الكمية يجب أن تحتوي على أرقام صالحة فقط.' };
  }

  const [, decPart = ''] = str.split('.');
  if (!allowFractional && decPart.length > 0 && Number(decPart) !== 0) {
    return { ok: false, error: 'هذا الصنف يقبل أعداداً صحيحة فقط دون كسور.' };
  }
  if (!allowFractional && str.includes('.')) {
    return { ok: false, error: 'هذا الصنف يقبل أعداداً صحيحة فقط دون كسور.' };
  }
  if (allowFractional && decPart.length > 3) {
    return { ok: false, error: 'الكمية تقبل 3 خانات عشرية بحد أقصى.' };
  }

  const qty = Number(str);
  if (!Number.isFinite(qty) || qty < 0 || qty > MAX_QUANTITY) {
    return { ok: false, error: `الكمية يجب أن تكون بين 0 و ${MAX_QUANTITY.toLocaleString('en-US')}.` };
  }

  return { ok: true, quantity: qty };
}

export function calculateLineTotalInPiastres(
  quantity: number,
  unitPriceInPiastres: number,
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('لا يُسمح بكمية سالبة أو غير صالحة.');
  }
  if (!Number.isSafeInteger(unitPriceInPiastres) || unitPriceInPiastres < 0) {
    throw new Error('سعر الوحدة بالقروش يجب أن يكون عدداً صحيحاً غير سالب.');
  }

  let total: number;
  if (Number.isInteger(quantity)) {
    total = quantity * unitPriceInPiastres;
  } else {
    const milliQty = Math.round(quantity * 1000);
    total = Math.round((milliQty * unitPriceInPiastres) / 1000);
  }

  if (!Number.isSafeInteger(total) || total > MAX_SAFE_PIASTRES) {
    throw new Error('إجمالي السطر يتجاوز الحد الآمن للحسابات.');
  }

  return total;
}

export function formatPiastres(piastres: number, withCurrency = false): string {
  const safe = Number.isFinite(piastres) ? Math.round(piastres) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const pounds = Math.floor(abs / 100);
  const cents = abs % 100;
  const poundsFormatted = pounds.toLocaleString('en-US');
  const centsFormatted = String(cents).padStart(2, '0');
  const formatted = `${sign}${poundsFormatted}.${centsFormatted}`;
  return withCurrency ? `${formatted} ج.م` : formatted;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) {
    return value.toLocaleString('en-US');
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0.00%';
  if (percent < 0.01) {
    return `${percent.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}%`;
  }
  return `${percent.toFixed(2)}%`;
}

export function formatArabicDateTime(isoString: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatArabicDateOnly(isoString: string): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}
