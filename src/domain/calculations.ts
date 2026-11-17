import { MAX_SAFE_PIASTRES, calculateLineTotalInPiastres } from './money';
import type { InventoryLine, RecordStatus, ReplenishmentLine } from './types';

export const DEFAULT_INSURANCE_LIMIT_PIASTRES = 8_500_000; // 85,000.00 EGP
export const SUGAR_PRODUCT_ID = 'prod_sugar';
export const OIL_PRODUCT_ID = 'prod_oil';
export const SUGAR_TARGET_QTY = 1721; // كيلو
export const OIL_TARGET_QTY = 1571; // زجاجة

export function getProductPriorityRank(productId: string): number {
  if (productId === SUGAR_PRODUCT_ID) return 0;
  if (productId === OIL_PRODUCT_ID) return 1;
  return 2;
}

export function sortSugarOilFirst<T>(
  items: readonly T[],
  getId: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const rankA = getProductPriorityRank(getId(a));
    const rankB = getProductPriorityRank(getId(b));
    return rankA - rankB;
  });
}

export type InventoryStatusType =
  | 'below_insurance'
  | 'matched_insurance'
  | 'above_insurance';

export interface InventorySummary {
  totalInventoryValueInPiastres: number;
  insuranceLimitInPiastres: number;
  replenishmentRequiredInPiastres: number;
  surplusOverInsuranceInPiastres: number;
  status: InventoryStatusType;
}

export function calculateInventorySummary(
  lines: Pick<InventoryLine, 'lineTotalInPiastres'>[],
  insuranceLimitInPiastres: number,
): InventorySummary {
  if (!Number.isSafeInteger(insuranceLimitInPiastres) || insuranceLimitInPiastres < 0) {
    throw new Error('قيمة التأمين غير صالحة.');
  }

  let totalInventoryValueInPiastres = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.lineTotalInPiastres) || line.lineTotalInPiastres < 0) {
      throw new Error('قيمة أحد الأصناف غير صالحة.');
    }
    totalInventoryValueInPiastres += line.lineTotalInPiastres;
    if (totalInventoryValueInPiastres > MAX_SAFE_PIASTRES) {
      throw new Error('إجمالي قيمة المخزون يتجاوز الحد الآمن.');
    }
  }

  const replenishmentRequiredInPiastres = Math.max(
    0,
    insuranceLimitInPiastres - totalInventoryValueInPiastres,
  );
  const surplusOverInsuranceInPiastres = Math.max(
    0,
    totalInventoryValueInPiastres - insuranceLimitInPiastres,
  );

  let status: InventoryStatusType = 'matched_insurance';
  if (totalInventoryValueInPiastres < insuranceLimitInPiastres) {
    status = 'below_insurance';
  } else if (totalInventoryValueInPiastres > insuranceLimitInPiastres) {
    status = 'above_insurance';
  }

  return {
    totalInventoryValueInPiastres,
    insuranceLimitInPiastres,
    replenishmentRequiredInPiastres,
    surplusOverInsuranceInPiastres,
    status,
  };
}

export type TargetMatchStatus = 'shortfall' | 'matched' | 'surplus';

export interface TargetQuantityStatus {
  targetQty: number;
  actualQty: number;
  shortfallQty: number;
  surplusQty: number;
  status: TargetMatchStatus;
}

export function calculateTargetShortfall(
  actualQty: number,
  targetQty: number,
): TargetQuantityStatus {
  const safeActual = Number.isFinite(actualQty) && actualQty > 0 ? actualQty : 0;
  const shortfallQty = Math.max(0, targetQty - safeActual);
  const surplusQty = Math.max(0, safeActual - targetQty);

  let status: TargetMatchStatus = 'matched';
  if (safeActual < targetQty) status = 'shortfall';
  else if (safeActual > targetQty) status = 'surplus';

  return {
    targetQty,
    actualQty: safeActual,
    shortfallQty,
    surplusQty,
    status,
  };
}

export function extractSugarAndOilInventoryStatus(
  lines: Pick<InventoryLine, 'productId' | 'quantity'>[],
): {
  sugar: TargetQuantityStatus;
  oil: TargetQuantityStatus;
} {
  const sugarLine = lines.find((l) => l.productId === SUGAR_PRODUCT_ID);
  const oilLine = lines.find((l) => l.productId === OIL_PRODUCT_ID);
  return {
    sugar: calculateTargetShortfall(sugarLine?.quantity ?? 0, SUGAR_TARGET_QTY),
    oil: calculateTargetShortfall(oilLine?.quantity ?? 0, OIL_TARGET_QTY),
  };
}

export interface InvoiceMetrics {
  requiredAmountInPiastres: number;
  invoiceTotalInPiastres: number;
  remainingAmountInPiastres: number;
  overageAmountInPiastres: number;
  isOverLimit: boolean;
  isExactMatch: boolean;
  usagePercent: number;
  shortfallPercent: number;
  overagePercent: number;
}

export function calculateInvoiceMetrics(
  requiredAmountInPiastres: number,
  invoiceTotalInPiastres: number,
): InvoiceMetrics {
  if (!Number.isSafeInteger(requiredAmountInPiastres) || requiredAmountInPiastres < 0) {
    throw new Error('مبلغ الاستعاضة المطلوب غير صالح.');
  }
  if (!Number.isSafeInteger(invoiceTotalInPiastres) || invoiceTotalInPiastres < 0) {
    throw new Error('إجمالي الفاتورة غير صالح.');
  }

  const isOverLimit = invoiceTotalInPiastres > requiredAmountInPiastres;
  const isExactMatch = invoiceTotalInPiastres === requiredAmountInPiastres;
  const remainingAmountInPiastres = Math.max(
    0,
    requiredAmountInPiastres - invoiceTotalInPiastres,
  );
  const overageAmountInPiastres = Math.max(
    0,
    invoiceTotalInPiastres - requiredAmountInPiastres,
  );

  const usagePercent =
    requiredAmountInPiastres > 0
      ? (invoiceTotalInPiastres / requiredAmountInPiastres) * 100
      : 0;
  const shortfallPercent =
    requiredAmountInPiastres > 0
      ? (remainingAmountInPiastres / requiredAmountInPiastres) * 100
      : 0;
  const overagePercent =
    requiredAmountInPiastres > 0
      ? (overageAmountInPiastres / requiredAmountInPiastres) * 100
      : 0;

  return {
    requiredAmountInPiastres,
    invoiceTotalInPiastres,
    remainingAmountInPiastres,
    overageAmountInPiastres,
    isOverLimit,
    isExactMatch,
    usagePercent,
    shortfallPercent,
    overagePercent,
  };
}

export interface InvoiceSugarOilComparison {
  sugarShortfallTarget: number;
  sugarInvoicedQty: number;
  sugarDiff: number; // invoiced - target
  oilShortfallTarget: number;
  oilInvoicedQty: number;
  oilDiff: number; // invoiced - target
  hasMismatch: boolean;
}

export function compareInvoiceSugarOilWithShortfall(
  lines: Pick<ReplenishmentLine, 'productId' | 'quantity'>[],
  sugarShortfallTarget: number,
  oilShortfallTarget: number,
): InvoiceSugarOilComparison {
  const sugarInvoicedQty =
    lines.find((l) => l.productId === SUGAR_PRODUCT_ID)?.quantity ?? 0;
  const oilInvoicedQty =
    lines.find((l) => l.productId === OIL_PRODUCT_ID)?.quantity ?? 0;
  const sugarDiff = sugarInvoicedQty - sugarShortfallTarget;
  const oilDiff = oilInvoicedQty - oilShortfallTarget;
  return {
    sugarShortfallTarget,
    sugarInvoicedQty,
    sugarDiff,
    oilShortfallTarget,
    oilInvoicedQty,
    oilDiff,
    hasMismatch: sugarDiff !== 0 || oilDiff !== 0,
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateInventoryLinesForSave(
  mode: 'draft' | 'confirm',
  lines: Pick<InventoryLine, 'productId' | 'quantity' | 'unitPriceSnapshotInPiastres'>[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lines.length === 0) {
    errors.push('لا يمكن حفظ جرد بدون أصناف.');
    return { valid: false, errors, warnings };
  }

  let hasPositiveQuantity = false;
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      errors.push('توجد كمية سالبة أو غير صالحة في الجدول.');
      break;
    }
    if (line.quantity > 0) {
      hasPositiveQuantity = true;
    }
    try {
      calculateLineTotalInPiastres(line.quantity, line.unitPriceSnapshotInPiastres);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'خطأ في حساب أحد الأسطر.');
      break;
    }
  }

  if (mode === 'confirm' && !hasPositiveQuantity) {
    errors.push('لا يمكن اعتماد جرد فارغ بكميات كلها صفر. أدخل الكميات الفعلية أولاً.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export interface InvoiceSaveValidationInput {
  mode: 'draft' | 'confirm';
  linkedInventoryStatus: RecordStatus | null;
  linkedInventoryReplenishmentInPiastres: number;
  existingConfirmedInvoiceForInventory: boolean;
  requiredAmountSnapshotInPiastres: number;
  lines: Pick<
    ReplenishmentLine,
    'productId' | 'quantity' | 'unitPriceSnapshotInPiastres' | 'lineTotalInPiastres'
  >[];
  sugarShortfallSnapshot: number;
  oilShortfallSnapshot: number;
  requireSugarOilExactMatch: boolean;
}

export function validateInvoiceForSave(
  input: InvoiceSaveValidationInput,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.linkedInventoryStatus !== 'confirmed') {
    errors.push('لا يمكن حفظ أو اعتماد فاتورة استعاضة دون وجود جرد معتمد مرتبط بها.');
  }

  if (input.linkedInventoryReplenishmentInPiastres <= 0) {
    errors.push('مبلغ الاستعاضة المطلوب يساوي صفراً؛ لا يمكن إنشاء فاتورة استعاضة.');
  }

  if (input.mode === 'confirm' && input.existingConfirmedInvoiceForInventory) {
    errors.push(
      'يوجد بالفعل فاتورة معتمدة مرتبطة بهذا الجرد. يجب إلغاء الفاتورة السابقة أولاً قبل اعتماد فاتورة جديدة.',
    );
  }

  // Check duplicate products
  const seenProducts = new Set<string>();
  let computedTotal = 0;
  let hasPositiveLine = false;

  for (const line of input.lines) {
    if (seenProducts.has(line.productId)) {
      errors.push('يوجد صنف مكرر في أكثر من سطر بالفاتورة. اجمع الكمية في سطر واحد.');
      break;
    }
    seenProducts.add(line.productId);

    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      errors.push('لا يُسمح بكمية سالبة في أسطر الفاتورة.');
      break;
    }

    if (input.mode === 'confirm' && line.quantity === 0) {
      errors.push('توجد أصناف بكمية صفر في الفاتورة. أدخل كمية موجبة أو احذف السطر.');
      break;
    }

    if (line.quantity > 0) {
      hasPositiveLine = true;
    }

    const expectedLineTotal = calculateLineTotalInPiastres(
      line.quantity,
      line.unitPriceSnapshotInPiastres,
    );
    computedTotal += expectedLineTotal;
  }

  if (input.mode === 'confirm' && (!hasPositiveLine || input.lines.length === 0)) {
    errors.push('لا يمكن اعتماد فاتورة فارغة. أضف صنفاً واحداً على الأقل بكمية موجبة.');
  }

  if (input.mode === 'draft' && input.lines.length === 0) {
    errors.push('أضف صنفاً واحداً على الأقل لحفظ مسودة الفاتورة.');
  }

  const metrics = calculateInvoiceMetrics(
    input.requiredAmountSnapshotInPiastres,
    computedTotal,
  );

  // Critical financial overage check — blocks BOTH draft persistence and confirmation!
  if (metrics.isOverLimit) {
    errors.push(
      `ممنوع الحفظ أو الاعتماد: إجمالي الفاتورة يتجاوز مبلغ الاستعاضة المطلوب بمقدار ${(
        metrics.overageAmountInPiastres / 100
      ).toFixed(2)} جنيه.`,
    );
  }

  const sugarOil = compareInvoiceSugarOilWithShortfall(
    input.lines,
    input.sugarShortfallSnapshot,
    input.oilShortfallSnapshot,
  );

  if (sugarOil.hasMismatch) {
    const msg =
      'كمية السكر أو الزيت في الفاتورة تختلف عن الكمية الناقصة المحسوبة في الجرد المرتبط.';
    if (input.requireSugarOilExactMatch && input.mode === 'confirm') {
      errors.push(`${msg} (خيار إلزام المطابقة مفعّل في الإعدادات).`);
    } else {
      warnings.push(msg);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
