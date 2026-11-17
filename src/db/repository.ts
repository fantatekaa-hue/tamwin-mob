import {
  calculateInventorySummary,
  calculateInvoiceMetrics,
  extractSugarAndOilInventoryStatus,
  validateInventoryLinesForSave,
  validateInvoiceForSave,
} from '../domain/calculations';
import { calculateLineTotalInPiastres } from '../domain/money';
import {
  APP_NAME,
  INITIAL_PRODUCTS,
  INITIAL_SETTINGS,
  INITIAL_UNITS,
  OWNER_NAME,
} from '../domain/seedData';
import {
  parseAndValidateBackupFile,
  type BackupSummaryCounts,
  type ParseBackupResult,
} from '../domain/backup';
import type {
  BackupPayload,
  InsuranceHistory,
  InventoryLine,
  InventorySession,
  PriceHistory,
  Product,
  ReplenishmentInvoice,
  ReplenishmentLine,
  Settings,
  ThemeMode,
  Unit,
} from '../domain/types';
import { db } from './database';

export {
  parseAndValidateBackupFile,
  type BackupSummaryCounts,
  type ParseBackupResult,
};

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nextSerial(prefix: string, existingSerials: string[]): string {
  let maxNum = 0;
  for (const s of existingSerials) {
    const match = s.match(/(\d+)$/);
    if (match) {
      const num = Number(match[1]);
      if (Number.isFinite(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

let initPromise: Promise<void> | null = null;

export async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await db.transaction(
        'rw',
        db.units,
        db.products,
        db.settings,
        async () => {
          const unitCount = await db.units.count();
          if (unitCount === 0) {
            await db.units.bulkAdd(INITIAL_UNITS);
          }
          const productCount = await db.products.count();
          if (productCount === 0) {
            await db.products.bulkAdd(INITIAL_PRODUCTS);
          } else {
            const cheese125 = await db.products.get('prod_cheese_125');
            if (
              cheese125 &&
              cheese125.inventoryPriceInPiastres === 1375 &&
              cheese125.updatedAt === '2026-01-01T00:00:00.000Z'
            ) {
              await db.products.update('prod_cheese_125', {
                inventoryPriceInPiastres: 675,
              });
            }
          }
          const settings = await db.settings.get('main');
          if (!settings) {
            await db.settings.put(INITIAL_SETTINGS);
          }
        },
      );
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function getSettings(): Promise<Settings> {
  await ensureInitialized();
  const s = await db.settings.get('main');
  return s ?? INITIAL_SETTINGS;
}

export async function updateTheme(theme: ThemeMode): Promise<Settings> {
  await ensureInitialized();
  const now = new Date().toISOString();
  await db.settings.update('main', { theme, updatedAt: now });
  return getSettings();
}

export async function updateSugarOilRule(requireExact: boolean): Promise<Settings> {
  await ensureInitialized();
  const now = new Date().toISOString();
  await db.settings.update('main', {
    requireSugarOilExactMatch: requireExact,
    updatedAt: now,
  });
  return getSettings();
}

export async function updateInsuranceLimit(
  newLimitInPiastres: number,
): Promise<Settings> {
  await ensureInitialized();
  if (!Number.isSafeInteger(newLimitInPiastres) || newLimitInPiastres <= 0) {
    throw new Error('قيمة التأمين يجب أن تكون أكبر من صفر.');
  }
  const now = new Date().toISOString();
  await db.transaction('rw', db.settings, db.insuranceHistory, async () => {
    const current = (await db.settings.get('main')) ?? INITIAL_SETTINGS;
    if (current.insuranceLimitInPiastres === newLimitInPiastres) {
      return;
    }
    const historyEntry: InsuranceHistory = {
      id: generateId('ins'),
      oldLimitInPiastres: current.insuranceLimitInPiastres,
      newLimitInPiastres,
      changedAt: now,
    };
    await db.insuranceHistory.add(historyEntry);
    await db.settings.update('main', {
      insuranceLimitInPiastres: newLimitInPiastres,
      updatedAt: now,
    });
  });
  return getSettings();
}

export async function getInsuranceHistory(): Promise<InsuranceHistory[]> {
  await ensureInitialized();
  return db.insuranceHistory.orderBy('changedAt').reverse().toArray();
}

export async function getAllUnits(): Promise<Unit[]> {
  await ensureInitialized();
  return db.units.toArray();
}

export async function addUnit(name: string): Promise<Unit> {
  await ensureInitialized();
  const clean = name.trim();
  if (!clean) throw new Error('اسم الوحدة لا يمكن أن يكون فارغاً.');
  const existing = await db.units.toArray();
  if (existing.some((u) => u.name.trim() === clean)) {
    throw new Error(`الوحدة "${clean}" موجودة بالفعل.`);
  }
  const unit: Unit = {
    id: generateId('unit'),
    name: clean,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  await db.units.add(unit);
  return unit;
}

export async function toggleUnitActive(unitId: string, isActive: boolean): Promise<void> {
  await ensureInitialized();
  if (!isActive) {
    const activeProductsUsing = await db.products
      .filter(
        (p) =>
          p.isActive &&
          (p.inventoryUnitId === unitId || p.purchaseUnitId === unitId),
      )
      .count();
    if (activeProductsUsing > 0) {
      throw new Error(
        'هذه الوحدة مستخدمة حالياً في أصناف نشطة. عدّل وحدات الأصناف أولاً قبل تعطيل الوحدة.',
      );
    }
  }
  await db.units.update(unitId, { isActive });
}

export async function getAllProducts(): Promise<Product[]> {
  await ensureInitialized();
  return db.products.toArray();
}

export async function isProductUsedInHistory(productId: string): Promise<boolean> {
  await ensureInitialized();
  const invCount = await db.inventoryLines.where('productId').equals(productId).count();
  if (invCount > 0) return true;
  const repCount = await db.replenishmentLines
    .where('productId')
    .equals(productId)
    .count();
  return repCount > 0;
}

export interface SaveProductInput {
  id?: string;
  name: string;
  inventoryUnitId: string;
  inventoryPriceInPiastres: number;
  purchaseUnitId: string;
  purchasePriceInPiastres: number;
  allowFractionalQuantity: boolean;
  isActive?: boolean;
}

export async function saveProduct(input: SaveProductInput): Promise<Product> {
  await ensureInitialized();
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error('اسم الصنف مطلوب ولا يمكن أن يكون فارغاً.');
  if (
    !Number.isSafeInteger(input.inventoryPriceInPiastres) ||
    input.inventoryPriceInPiastres < 0 ||
    !Number.isSafeInteger(input.purchasePriceInPiastres) ||
    input.purchasePriceInPiastres < 0
  ) {
    throw new Error('الأسعار يجب أن تكون قيماً صحيحة غير سالبة.');
  }

  const now = new Date().toISOString();

  return db.transaction(
    'rw',
    db.products,
    db.units,
    db.priceHistory,
    async () => {
      const invUnit = await db.units.get(input.inventoryUnitId);
      const purUnit = await db.units.get(input.purchaseUnitId);
      if (!invUnit || !purUnit) {
        throw new Error('يرجى اختيار وحدات صالحة للجرد والاستعاضة.');
      }

      if (!input.id) {
        const product: Product = {
          id: generateId('prod'),
          name: cleanName,
          isActive: input.isActive ?? true,
          inventoryUnitId: input.inventoryUnitId,
          inventoryPriceInPiastres: input.inventoryPriceInPiastres,
          purchaseUnitId: input.purchaseUnitId,
          purchasePriceInPiastres: input.purchasePriceInPiastres,
          allowFractionalQuantity: input.allowFractionalQuantity,
          createdAt: now,
          updatedAt: now,
        };
        await db.products.add(product);
        return product;
      }

      const existing = await db.products.get(input.id);
      if (!existing) {
        throw new Error('الصنف المطلوب تعديله غير موجود.');
      }

      const historyRows: PriceHistory[] = [];
      if (existing.inventoryPriceInPiastres !== input.inventoryPriceInPiastres) {
        historyRows.push({
          id: generateId('ph'),
          productId: existing.id,
          productNameSnapshot: cleanName,
          operationType: 'inventory',
          oldPriceInPiastres: existing.inventoryPriceInPiastres,
          newPriceInPiastres: input.inventoryPriceInPiastres,
          unitId: input.inventoryUnitId,
          unitNameSnapshot: invUnit.name,
          changedAt: now,
        });
      }
      if (existing.purchasePriceInPiastres !== input.purchasePriceInPiastres) {
        historyRows.push({
          id: generateId('ph'),
          productId: existing.id,
          productNameSnapshot: cleanName,
          operationType: 'purchase',
          oldPriceInPiastres: existing.purchasePriceInPiastres,
          newPriceInPiastres: input.purchasePriceInPiastres,
          unitId: input.purchaseUnitId,
          unitNameSnapshot: purUnit.name,
          changedAt: now,
        });
      }

      if (historyRows.length > 0) {
        await db.priceHistory.bulkAdd(historyRows);
      }

      const updated: Product = {
        ...existing,
        name: cleanName,
        inventoryUnitId: input.inventoryUnitId,
        inventoryPriceInPiastres: input.inventoryPriceInPiastres,
        purchaseUnitId: input.purchaseUnitId,
        purchasePriceInPiastres: input.purchasePriceInPiastres,
        allowFractionalQuantity: input.allowFractionalQuantity,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: now,
      };
      await db.products.put(updated);
      return updated;
    },
  );
}

export async function toggleProductActive(
  productId: string,
  isActive: boolean,
): Promise<void> {
  await ensureInitialized();
  await db.products.update(productId, {
    isActive,
    updatedAt: new Date().toISOString(),
  });
}

export async function getPriceHistory(): Promise<PriceHistory[]> {
  await ensureInitialized();
  return db.priceHistory.orderBy('changedAt').reverse().toArray();
}

export interface SaveInventorySessionInput {
  sessionId?: string;
  mode: 'draft' | 'confirm';
  sessionDate: string;
  notes: string;
  items: { productId: string; quantity: number }[];
}

export interface InventorySessionWithLines {
  session: InventorySession;
  lines: InventoryLine[];
}

export async function saveInventorySession(
  input: SaveInventorySessionInput,
): Promise<InventorySessionWithLines> {
  await ensureInitialized();
  const now = new Date().toISOString();

  return db.transaction(
    'rw',
    db.inventorySessions,
    db.inventoryLines,
    db.products,
    db.units,
    db.settings,
    async () => {
      const settings = (await db.settings.get('main')) ?? INITIAL_SETTINGS;
      const allProducts = await db.products.toArray();
      const allUnits = await db.units.toArray();
      const productMap = new Map(allProducts.map((p) => [p.id, p]));
      const unitMap = new Map(allUnits.map((u) => [u.id, u]));

      let existingSession: InventorySession | undefined;
      if (input.sessionId) {
        existingSession = await db.inventorySessions.get(input.sessionId);
        if (!existingSession) {
          throw new Error('سجل الجرد غير موجود.');
        }
        if (existingSession.status !== 'draft') {
          throw new Error(
            'لا يمكن تعديل جرد معتمد أو ملغي بشكل مباشر. يمكنك إنشاء جرد جديد كنسخة منه.',
          );
        }
      }

      const sessionId = existingSession?.id ?? generateId('inv');
      const allSessions = await db.inventorySessions.toArray();
      const serialNumber =
        existingSession?.serialNumber ??
        nextSerial(
          'جرد',
          allSessions.map((s) => s.serialNumber),
        );

      const builtLines: InventoryLine[] = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error('أحد الأصناف المختارة غير موجود في قاعدة البيانات.');
        }
        if (!product.allowFractionalQuantity && !Number.isInteger(item.quantity)) {
          throw new Error(`الصنف "${product.name}" لا يقبل كميات عشرية.`);
        }
        const unit = unitMap.get(product.inventoryUnitId);
        const lineTotalInPiastres = calculateLineTotalInPiastres(
          item.quantity,
          product.inventoryPriceInPiastres,
        );
        return {
          id: generateId('invl'),
          inventorySessionId: sessionId,
          productId: product.id,
          productNameSnapshot: product.name,
          unitNameSnapshot: unit?.name ?? 'وحدة',
          unitPriceSnapshotInPiastres: product.inventoryPriceInPiastres,
          quantity: item.quantity,
          lineTotalInPiastres,
        };
      });

      const validation = validateInventoryLinesForSave(input.mode, builtLines);
      if (!validation.valid) {
        throw new Error(validation.errors[0]);
      }

      const summary = calculateInventorySummary(
        builtLines,
        settings.insuranceLimitInPiastres,
      );

      const session: InventorySession = {
        id: sessionId,
        serialNumber,
        createdAt: existingSession?.createdAt ?? now,
        updatedAt: now,
        sessionDate: input.sessionDate || now,
        status: input.mode === 'confirm' ? 'confirmed' : 'draft',
        insuranceLimitSnapshotInPiastres: settings.insuranceLimitInPiastres,
        totalInventoryValueInPiastres: summary.totalInventoryValueInPiastres,
        replenishmentRequiredInPiastres: summary.replenishmentRequiredInPiastres,
        surplusOverInsuranceInPiastres: summary.surplusOverInsuranceInPiastres,
        notes: input.notes.trim(),
      };

      await db.inventorySessions.put(session);
      await db.inventoryLines
        .where('inventorySessionId')
        .equals(sessionId)
        .delete();
      await db.inventoryLines.bulkAdd(builtLines);

      return { session, lines: builtLines };
    },
  );
}

export async function getAllInventorySessions(): Promise<InventorySession[]> {
  await ensureInitialized();
  const list = await db.inventorySessions.toArray();
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInventorySessionWithLines(
  sessionId: string,
): Promise<InventorySessionWithLines | null> {
  await ensureInitialized();
  const session = await db.inventorySessions.get(sessionId);
  if (!session) return null;
  const lines = await db.inventoryLines
    .where('inventorySessionId')
    .equals(sessionId)
    .toArray();
  return { session, lines };
}

export async function getLatestConfirmedInventorySession(): Promise<InventorySessionWithLines | null> {
  await ensureInitialized();
  const confirmed = await db.inventorySessions
    .where('status')
    .equals('confirmed')
    .toArray();
  if (confirmed.length === 0) return null;
  confirmed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = confirmed[0];
  const lines = await db.inventoryLines
    .where('inventorySessionId')
    .equals(latest.id)
    .toArray();
  return { session: latest, lines };
}

export async function deleteInventoryDraft(sessionId: string): Promise<void> {
  await ensureInitialized();
  await db.transaction('rw', db.inventorySessions, db.inventoryLines, async () => {
    const existing = await db.inventorySessions.get(sessionId);
    if (!existing) return;
    if (existing.status !== 'draft') {
      throw new Error('لا يمكن حذف جرد معتمد أو ملغي؛ السجلات التاريخية محفوظة.');
    }
    await db.inventoryLines.where('inventorySessionId').equals(sessionId).delete();
    await db.inventorySessions.delete(sessionId);
  });
}

export async function cancelInventorySession(
  sessionId: string,
  reason: string,
): Promise<void> {
  await ensureInitialized();
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('يرجى إدخال سبب إلغاء الجرد.');
  }
  await db.transaction(
    'rw',
    db.inventorySessions,
    db.replenishmentInvoices,
    async () => {
      const existing = await db.inventorySessions.get(sessionId);
      if (!existing) throw new Error('سجل الجرد غير موجود.');
      if (existing.status === 'cancelled') return;
      const linkedConfirmed = await db.replenishmentInvoices
        .where('inventorySessionId')
        .equals(sessionId)
        .filter((inv) => inv.status === 'confirmed')
        .count();
      if (linkedConfirmed > 0) {
        throw new Error(
          'لا يمكن إلغاء جرد مرتبط بفاتورة استعاضة معتمدة. قم بإلغاء الفاتورة المرتبطة أولاً.',
        );
      }
      await db.inventorySessions.update(sessionId, {
        status: 'cancelled',
        cancellationReason: cleanReason,
        updatedAt: new Date().toISOString(),
      });
    },
  );
}

export interface SaveInvoiceInput {
  invoiceId?: string;
  inventorySessionId: string;
  mode: 'draft' | 'confirm';
  notes: string;
  items: { productId: string; quantity: number }[];
}

export interface InvoiceWithLines {
  invoice: ReplenishmentInvoice;
  lines: ReplenishmentLine[];
}

export async function saveReplenishmentInvoice(
  input: SaveInvoiceInput,
): Promise<InvoiceWithLines> {
  await ensureInitialized();
  const now = new Date().toISOString();

  return db.transaction(
    'rw',
    [
      db.replenishmentInvoices,
      db.replenishmentLines,
      db.inventorySessions,
      db.inventoryLines,
      db.products,
      db.units,
      db.settings,
    ],
    async () => {
      const settings = (await db.settings.get('main')) ?? INITIAL_SETTINGS;
      const inventory = await db.inventorySessions.get(input.inventorySessionId);
      if (!inventory) {
        throw new Error('الجرد المرتبط بالفاتورة غير موجود.');
      }

      const invLines = await db.inventoryLines
        .where('inventorySessionId')
        .equals(inventory.id)
        .toArray();
      const sugarOil = extractSugarAndOilInventoryStatus(invLines);

      let existingInvoice: ReplenishmentInvoice | undefined;
      if (input.invoiceId) {
        existingInvoice = await db.replenishmentInvoices.get(input.invoiceId);
        if (!existingInvoice) {
          throw new Error('الفاتورة المطلوب تعديلها غير موجودة.');
        }
        if (existingInvoice.status !== 'draft') {
          throw new Error(
            'لا يمكن تعديل فاتورة معتمدة أو ملغاة بشكل مباشر. يمكنك إنشاء نسخة جديدة أو إلغاؤها.',
          );
        }
      }

      const otherConfirmedCount = await db.replenishmentInvoices
        .where('inventorySessionId')
        .equals(inventory.id)
        .filter(
          (inv) =>
            inv.status === 'confirmed' && inv.id !== (existingInvoice?.id ?? ''),
        )
        .count();

      const allProducts = await db.products.toArray();
      const allUnits = await db.units.toArray();
      const productMap = new Map(allProducts.map((p) => [p.id, p]));
      const unitMap = new Map(allUnits.map((u) => [u.id, u]));

      const invoiceId = existingInvoice?.id ?? generateId('fac');
      const allInvoices = await db.replenishmentInvoices.toArray();
      const serialNumber =
        existingInvoice?.serialNumber ??
        nextSerial(
          'فاتورة',
          allInvoices.map((i) => i.serialNumber),
        );

      const builtLines: ReplenishmentLine[] = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error('أحد الأصناف غير موجود في قاعدة البيانات.');
        }
        if (!product.allowFractionalQuantity && !Number.isInteger(item.quantity)) {
          throw new Error(`الصنف "${product.name}" لا يقبل كميات عشرية.`);
        }
        const unit = unitMap.get(product.purchaseUnitId);
        const lineTotalInPiastres = calculateLineTotalInPiastres(
          item.quantity,
          product.purchasePriceInPiastres,
        );
        return {
          id: generateId('facl'),
          invoiceId,
          productId: product.id,
          productNameSnapshot: product.name,
          unitNameSnapshot: unit?.name ?? 'وحدة',
          unitPriceSnapshotInPiastres: product.purchasePriceInPiastres,
          quantity: item.quantity,
          lineTotalInPiastres,
        };
      });

      const requiredAmountSnapshotInPiastres =
        existingInvoice?.requiredAmountSnapshotInPiastres ??
        inventory.replenishmentRequiredInPiastres;

      const validation = validateInvoiceForSave({
        mode: input.mode,
        linkedInventoryStatus: inventory.status,
        linkedInventoryReplenishmentInPiastres:
          inventory.replenishmentRequiredInPiastres,
        existingConfirmedInvoiceForInventory: otherConfirmedCount > 0,
        requiredAmountSnapshotInPiastres,
        lines: builtLines,
        sugarShortfallSnapshot: sugarOil.sugar.shortfallQty,
        oilShortfallSnapshot: sugarOil.oil.shortfallQty,
        requireSugarOilExactMatch: settings.requireSugarOilExactMatch,
      });

      if (!validation.valid) {
        throw new Error(validation.errors[0]);
      }

      const invoiceTotalInPiastres = builtLines.reduce(
        (acc, l) => acc + l.lineTotalInPiastres,
        0,
      );
      const metrics = calculateInvoiceMetrics(
        requiredAmountSnapshotInPiastres,
        invoiceTotalInPiastres,
      );

      const invoice: ReplenishmentInvoice = {
        id: invoiceId,
        serialNumber,
        inventorySessionId: inventory.id,
        inventorySerialSnapshot: inventory.serialNumber,
        inventoryDateSnapshot: inventory.sessionDate,
        createdAt: existingInvoice?.createdAt ?? now,
        updatedAt: now,
        status: input.mode === 'confirm' ? 'confirmed' : 'draft',
        requiredAmountSnapshotInPiastres,
        invoiceTotalInPiastres,
        remainingAmountInPiastres: metrics.remainingAmountInPiastres,
        overageAmountInPiastres: metrics.overageAmountInPiastres,
        usagePercent: metrics.usagePercent,
        shortfallPercent: metrics.shortfallPercent,
        sugarShortfallSnapshot: sugarOil.sugar.shortfallQty,
        oilShortfallSnapshot: sugarOil.oil.shortfallQty,
        notes: input.notes.trim(),
      };

      await db.replenishmentInvoices.put(invoice);
      await db.replenishmentLines.where('invoiceId').equals(invoiceId).delete();
      await db.replenishmentLines.bulkAdd(builtLines);

      return { invoice, lines: builtLines };
    },
  );
}

export async function getAllReplenishmentInvoices(): Promise<
  ReplenishmentInvoice[]
> {
  await ensureInitialized();
  const list = await db.replenishmentInvoices.toArray();
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInvoiceWithLines(
  invoiceId: string,
): Promise<InvoiceWithLines | null> {
  await ensureInitialized();
  const invoice = await db.replenishmentInvoices.get(invoiceId);
  if (!invoice) return null;
  const lines = await db.replenishmentLines
    .where('invoiceId')
    .equals(invoiceId)
    .toArray();
  return { invoice, lines };
}

export async function getConfirmedInvoiceForInventory(
  inventorySessionId: string,
): Promise<ReplenishmentInvoice | null> {
  await ensureInitialized();
  const found = await db.replenishmentInvoices
    .where('inventorySessionId')
    .equals(inventorySessionId)
    .filter((inv) => inv.status === 'confirmed')
    .first();
  return found ?? null;
}

export async function cancelReplenishmentInvoice(
  invoiceId: string,
  reason: string,
): Promise<void> {
  await ensureInitialized();
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('يرجى كتابة سبب إلغاء الفاتورة.');
  }
  await db.transaction('rw', db.replenishmentInvoices, async () => {
    const existing = await db.replenishmentInvoices.get(invoiceId);
    if (!existing) throw new Error('الفاتورة غير موجودة.');
    if (existing.status === 'draft') {
      throw new Error('هذه الفاتورة مسودة، يمكنك حذفها أو تعديلها مباشرة.');
    }
    if (existing.status === 'cancelled') return;
    await db.replenishmentInvoices.update(invoiceId, {
      status: 'cancelled',
      cancellationReason: cleanReason,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function deleteInvoiceDraft(invoiceId: string): Promise<void> {
  await ensureInitialized();
  await db.transaction(
    'rw',
    db.replenishmentInvoices,
    db.replenishmentLines,
    async () => {
      const existing = await db.replenishmentInvoices.get(invoiceId);
      if (!existing) return;
      if (existing.status !== 'draft') {
        throw new Error('لا يمكن حذف فاتورة معتمدة أو ملغاة؛ السجلات محفوظة.');
      }
      await db.replenishmentLines.where('invoiceId').equals(invoiceId).delete();
      await db.replenishmentInvoices.delete(invoiceId);
    },
  );
}

export async function exportBackupPayload(): Promise<BackupPayload> {
  await ensureInitialized();
  const now = new Date().toISOString();

  await db.settings.update('main', { lastBackupAt: now, updatedAt: now });

  const [
    units,
    products,
    priceHistory,
    insuranceHistory,
    settings,
    inventorySessions,
    inventoryLines,
    replenishmentInvoices,
    replenishmentLines,
  ] = await Promise.all([
    db.units.toArray(),
    db.products.toArray(),
    db.priceHistory.toArray(),
    db.insuranceHistory.toArray(),
    db.settings.toArray(),
    db.inventorySessions.toArray(),
    db.inventoryLines.toArray(),
    db.replenishmentInvoices.toArray(),
    db.replenishmentLines.toArray(),
  ]);

  const deviceLabel =
    typeof navigator !== 'undefined' ? navigator.userAgent : 'جهاز محلي';

  return {
    schemaVersion: 1,
    appName: APP_NAME,
    ownerName: OWNER_NAME,
    exportedAt: now,
    deviceLabel,
    data: {
      units,
      products,
      priceHistory,
      insuranceHistory,
      settings,
      inventorySessions,
      inventoryLines,
      replenishmentInvoices,
      replenishmentLines,
    },
  };
}

export async function getCurrentDatabaseCounts(): Promise<BackupSummaryCounts> {
  await ensureInitialized();
  const [
    units,
    products,
    priceHistory,
    insuranceHistory,
    inventorySessions,
    replenishmentInvoices,
  ] = await Promise.all([
    db.units.count(),
    db.products.count(),
    db.priceHistory.count(),
    db.insuranceHistory.count(),
    db.inventorySessions.count(),
    db.replenishmentInvoices.count(),
  ]);
  return {
    units,
    products,
    priceHistory,
    insuranceHistory,
    inventorySessions,
    replenishmentInvoices,
  };
}

export async function restoreBackupPayload(payload: BackupPayload): Promise<void> {
  await ensureInitialized();

  // Take a full pre-restore safety snapshot before modifying anything
  const safetySnapshot = await exportBackupPayload();

  try {
    await db.transaction(
      'rw',
      [
        db.units,
        db.products,
        db.priceHistory,
        db.insuranceHistory,
        db.settings,
        db.inventorySessions,
        db.inventoryLines,
        db.replenishmentInvoices,
        db.replenishmentLines,
      ],
      async () => {
        await Promise.all([
          db.units.clear(),
          db.products.clear(),
          db.priceHistory.clear(),
          db.insuranceHistory.clear(),
          db.settings.clear(),
          db.inventorySessions.clear(),
          db.inventoryLines.clear(),
          db.replenishmentInvoices.clear(),
          db.replenishmentLines.clear(),
        ]);

        const d = payload.data;
        if (d.units.length) await db.units.bulkPut(d.units);
        if (d.products.length) await db.products.bulkPut(d.products);
        if (d.priceHistory.length) await db.priceHistory.bulkPut(d.priceHistory);
        if (d.insuranceHistory.length)
          await db.insuranceHistory.bulkPut(d.insuranceHistory);
        if (d.settings.length) {
          await db.settings.bulkPut(d.settings);
        } else {
          await db.settings.put(INITIAL_SETTINGS);
        }
        if (d.inventorySessions.length)
          await db.inventorySessions.bulkPut(d.inventorySessions);
        if (d.inventoryLines.length)
          await db.inventoryLines.bulkPut(d.inventoryLines);
        if (d.replenishmentInvoices.length)
          await db.replenishmentInvoices.bulkPut(d.replenishmentInvoices);
        if (d.replenishmentLines.length)
          await db.replenishmentLines.bulkPut(d.replenishmentLines);
      },
    );
  } catch (err) {
    // Attempt explicit rollback from safetySnapshot if transaction left partial state
    try {
      await db.transaction(
        'rw',
        [
          db.units,
          db.products,
          db.priceHistory,
          db.insuranceHistory,
          db.settings,
          db.inventorySessions,
          db.inventoryLines,
          db.replenishmentInvoices,
          db.replenishmentLines,
        ],
        async () => {
          const s = safetySnapshot.data;
          await Promise.all([
            db.units.clear(),
            db.products.clear(),
            db.priceHistory.clear(),
            db.insuranceHistory.clear(),
            db.settings.clear(),
            db.inventorySessions.clear(),
            db.inventoryLines.clear(),
            db.replenishmentInvoices.clear(),
            db.replenishmentLines.clear(),
          ]);
          if (s.units.length) await db.units.bulkPut(s.units);
          if (s.products.length) await db.products.bulkPut(s.products);
          if (s.priceHistory.length) await db.priceHistory.bulkPut(s.priceHistory);
          if (s.insuranceHistory.length)
            await db.insuranceHistory.bulkPut(s.insuranceHistory);
          if (s.settings.length) await db.settings.bulkPut(s.settings);
          if (s.inventorySessions.length)
            await db.inventorySessions.bulkPut(s.inventorySessions);
          if (s.inventoryLines.length)
            await db.inventoryLines.bulkPut(s.inventoryLines);
          if (s.replenishmentInvoices.length)
            await db.replenishmentInvoices.bulkPut(s.replenishmentInvoices);
          if (s.replenishmentLines.length)
            await db.replenishmentLines.bulkPut(s.replenishmentLines);
        },
      );
    } catch {
      // Ignore nested rollback error; original error will be thrown
    }
    throw new Error(
      err instanceof Error
        ? `فشل استيراد النسخة الاحتياطية وتم الحفاظ على البيانات السابقة: ${err.message}`
        : 'فشل استيراد النسخة الاحتياطية وتم استرجاع البيانات السابقة.',
    );
  }
}
