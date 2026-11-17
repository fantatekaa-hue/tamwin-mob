import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_INSURANCE_LIMIT_PIASTRES,
  OIL_TARGET_QTY,
  SUGAR_TARGET_QTY,
  calculateInventorySummary,
  calculateInvoiceMetrics,
  calculateTargetShortfall,
  compareInvoiceSugarOilWithShortfall,
  validateInvoiceForSave,
} from '../src/domain/calculations.ts';
import {
  calculateLineTotalInPiastres,
  formatPercent,
  formatPiastres,
  parseEgpToPiastres,
  parseQuantity,
} from '../src/domain/money.ts';
import { INITIAL_PRODUCTS, INITIAL_UNITS } from '../src/domain/seedData.ts';

test('Section 11.1 — Inventory Summary & Replenishment Math', () => {
  // 50,000.00 inventory -> 35,000.00 replenishment
  const case1 = calculateInventorySummary(
    [{ lineTotalInPiastres: 5_000_000 }],
    DEFAULT_INSURANCE_LIMIT_PIASTRES,
  );
  assert.equal(case1.totalInventoryValueInPiastres, 5_000_000);
  assert.equal(case1.replenishmentRequiredInPiastres, 3_500_000);
  assert.equal(case1.surplusOverInsuranceInPiastres, 0);
  assert.equal(case1.status, 'below_insurance');

  // 85,000.00 inventory -> 0.00 replenishment
  const case2 = calculateInventorySummary(
    [{ lineTotalInPiastres: 8_500_000 }],
    DEFAULT_INSURANCE_LIMIT_PIASTRES,
  );
  assert.equal(case2.replenishmentRequiredInPiastres, 0);
  assert.equal(case2.surplusOverInsuranceInPiastres, 0);
  assert.equal(case2.status, 'matched_insurance');

  // 90,000.00 inventory -> 0.00 replenishment, 5,000.00 surplus over insurance
  const case3 = calculateInventorySummary(
    [{ lineTotalInPiastres: 9_000_000 }],
    DEFAULT_INSURANCE_LIMIT_PIASTRES,
  );
  assert.equal(case3.replenishmentRequiredInPiastres, 0);
  assert.equal(case3.surplusOverInsuranceInPiastres, 500_000);
  assert.equal(case3.status, 'above_insurance');
});

test('Section 11.2 — Sugar and Oil Targets & Shortfalls', () => {
  const sugarShort = calculateTargetShortfall(1500, SUGAR_TARGET_QTY);
  assert.equal(sugarShort.shortfallQty, 221);
  assert.equal(sugarShort.surplusQty, 0);
  assert.equal(sugarShort.status, 'shortfall');

  const oilShort = calculateTargetShortfall(1400, OIL_TARGET_QTY);
  assert.equal(oilShort.shortfallQty, 171);
  assert.equal(oilShort.surplusQty, 0);
  assert.equal(oilShort.status, 'shortfall');

  const sugarSurplus = calculateTargetShortfall(1800, SUGAR_TARGET_QTY);
  assert.equal(sugarSurplus.shortfallQty, 0);
  assert.equal(sugarSurplus.surplusQty, 79);
  assert.equal(sugarSurplus.status, 'surplus');

  const oilMatched = calculateTargetShortfall(1571, OIL_TARGET_QTY);
  assert.equal(oilMatched.shortfallQty, 0);
  assert.equal(oilMatched.surplusQty, 0);
  assert.equal(oilMatched.status, 'matched');
});

test('Section 11.3 — Literal Product Prices & Units Verification', () => {
  const unitName = (id: string) => INITIAL_UNITS.find((u) => u.id === id)?.name;
  const byId = (id: string) => INITIAL_PRODUCTS.find((p) => p.id === id)!;

  assert.equal(byId('prod_sugar').inventoryPriceInPiastres, 1235);
  assert.equal(unitName(byId('prod_sugar').inventoryUnitId), 'كيلو');
  assert.equal(byId('prod_sugar').purchasePriceInPiastres, 1235);
  assert.equal(unitName(byId('prod_sugar').purchaseUnitId), 'كيلو');

  assert.equal(byId('prod_oil').inventoryPriceInPiastres, 2975);
  assert.equal(unitName(byId('prod_oil').inventoryUnitId), 'زجاجة');
  assert.equal(byId('prod_oil').purchasePriceInPiastres, 2975);
  assert.equal(unitName(byId('prod_oil').purchaseUnitId), 'زجاجة');

  assert.equal(byId('prod_pasta').inventoryPriceInPiastres, 885);
  assert.equal(unitName(byId('prod_pasta').inventoryUnitId), 'كيس');
  assert.equal(byId('prod_pasta').purchasePriceInPiastres, 17700);
  assert.equal(unitName(byId('prod_pasta').purchaseUnitId), 'طرد');

  assert.equal(byId('prod_tea').inventoryPriceInPiastres, 490);
  assert.equal(unitName(byId('prod_tea').inventoryUnitId), 'باكو');
  assert.equal(byId('prod_tea').purchasePriceInPiastres, 11760);
  assert.equal(unitName(byId('prod_tea').purchaseUnitId), 'كيلو');

  assert.equal(byId('prod_cheese_250').inventoryPriceInPiastres, 1375);
  assert.equal(unitName(byId('prod_cheese_250').inventoryUnitId), 'قطعة');
  assert.equal(byId('prod_cheese_250').purchasePriceInPiastres, 37125);
  assert.equal(unitName(byId('prod_cheese_250').purchaseUnitId), 'كرتونة');

  assert.equal(byId('prod_cheese_125').inventoryPriceInPiastres, 675);
  assert.equal(unitName(byId('prod_cheese_125').inventoryUnitId), 'قطعة');
  assert.equal(byId('prod_cheese_125').purchasePriceInPiastres, 27000);
  assert.equal(unitName(byId('prod_cheese_125').purchaseUnitId), 'كرتونة');

  assert.equal(byId('prod_soap').inventoryPriceInPiastres, 725);
  assert.equal(unitName(byId('prod_soap').inventoryUnitId), 'قطعة');
  assert.equal(byId('prod_soap').purchasePriceInPiastres, 34800);
  assert.equal(unitName(byId('prod_soap').purchaseUnitId), 'كرتونة');

  assert.equal(byId('prod_pril').inventoryPriceInPiastres, 280);
  assert.equal(unitName(byId('prod_pril').inventoryUnitId), 'كيس');
  assert.equal(byId('prod_pril').purchasePriceInPiastres, 11200);
  assert.equal(unitName(byId('prod_pril').purchaseUnitId), 'كرتونة');
});

test('Section 11.4 — Invoice Cap & Precision Boundary Cases (35,000.00 EGP)', () => {
  const required = 3_500_000; // 35,000.00 EGP

  // Case A: 34,999.99 -> allowed, remaining = 0.01
  const caseA = calculateInvoiceMetrics(required, 3_499_999);
  assert.equal(caseA.isOverLimit, false);
  assert.equal(caseA.remainingAmountInPiastres, 1);
  assert.equal(formatPiastres(caseA.remainingAmountInPiastres), '0.01');
  assert.ok(Math.abs(caseA.shortfallPercent - (1 / 3_500_000) * 100) < 1e-12);
  assert.notEqual(formatPercent(caseA.shortfallPercent), '0.00%');

  // Case B: 35,000.00 -> allowed, remaining = 0, usage = 100%
  const caseB = calculateInvoiceMetrics(required, 3_500_000);
  assert.equal(caseB.isOverLimit, false);
  assert.equal(caseB.isExactMatch, true);
  assert.equal(caseB.remainingAmountInPiastres, 0);
  assert.equal(caseB.usagePercent, 100);

  // Case C: 35,000.01 -> BLOCKED! overage = 0.01
  const caseC = calculateInvoiceMetrics(required, 3_500_001);
  assert.equal(caseC.isOverLimit, true);
  assert.equal(caseC.overageAmountInPiastres, 1);
  assert.ok(Math.abs(caseC.overagePercent - (1 / 3_500_000) * 100) < 1e-12);

  const blockedConfirm = validateInvoiceForSave({
    mode: 'confirm',
    linkedInventoryStatus: 'confirmed',
    linkedInventoryReplenishmentInPiastres: required,
    existingConfirmedInvoiceForInventory: false,
    requiredAmountSnapshotInPiastres: required,
    lines: [
      {
        productId: 'prod_custom',
        quantity: 1,
        unitPriceSnapshotInPiastres: 3_500_001,
        lineTotalInPiastres: 3_500_001,
      },
    ],
    sugarShortfallSnapshot: 0,
    oilShortfallSnapshot: 0,
    requireSugarOilExactMatch: false,
  });
  assert.equal(blockedConfirm.valid, false);

  const blockedDraft = validateInvoiceForSave({
    mode: 'draft',
    linkedInventoryStatus: 'confirmed',
    linkedInventoryReplenishmentInPiastres: required,
    existingConfirmedInvoiceForInventory: false,
    requiredAmountSnapshotInPiastres: required,
    lines: [
      {
        productId: 'prod_custom',
        quantity: 1,
        unitPriceSnapshotInPiastres: 3_500_001,
        lineTotalInPiastres: 3_500_001,
      },
    ],
    sugarShortfallSnapshot: 0,
    oilShortfallSnapshot: 0,
    requireSugarOilExactMatch: false,
  });
  assert.equal(blockedDraft.valid, false);

  // Case D: 28,500.00 -> allowed, remaining = 6,500.00
  const caseD = calculateInvoiceMetrics(required, 2_850_000);
  assert.equal(caseD.isOverLimit, false);
  assert.equal(caseD.remainingAmountInPiastres, 650_000);
  assert.equal(formatPiastres(caseD.remainingAmountInPiastres), '6,500.00');
  assert.ok(Math.abs(caseD.shortfallPercent - (650_000 / 3_500_000) * 100) < 1e-12);
});

test('Piastre Input Parsing & Exact Multiplication', () => {
  assert.deepEqual(parseEgpToPiastres('12.35'), { ok: true, piastres: 1235 });
  assert.deepEqual(parseEgpToPiastres('١٧٧'), { ok: true, piastres: 17700 });
  assert.equal(parseEgpToPiastres('-5').ok, false);
  assert.equal(parseEgpToPiastres('12.345').ok, false);
  assert.equal(parseEgpToPiastres('abc').ok, false);

  assert.equal(parseQuantity('10', false).ok, true);
  assert.equal(parseQuantity('10.5', false).ok, false);
  assert.equal(parseQuantity('10.5', true).ok, true);
  assert.equal(parseQuantity('-1', true).ok, false);

  assert.equal(calculateLineTotalInPiastres(1721, 1235), 2_125_435);
  assert.equal(formatPiastres(2_125_435), '21,254.35');
});

test('Sugar & Oil Invoice Match Setting Validation', () => {
  const comp = compareInvoiceSugarOilWithShortfall(
    [{ productId: 'prod_sugar', quantity: 100 }],
    221,
    171,
  );
  assert.equal(comp.hasMismatch, true);
  assert.equal(comp.sugarDiff, -121);
  assert.equal(comp.oilDiff, -171);

  // Default: warning only, valid = true
  const resDefault = validateInvoiceForSave({
    mode: 'confirm',
    linkedInventoryStatus: 'confirmed',
    linkedInventoryReplenishmentInPiastres: 3_500_000,
    existingConfirmedInvoiceForInventory: false,
    requiredAmountSnapshotInPiastres: 3_500_000,
    lines: [
      {
        productId: 'prod_sugar',
        quantity: 100,
        unitPriceSnapshotInPiastres: 1235,
        lineTotalInPiastres: 123_500,
      },
    ],
    sugarShortfallSnapshot: 221,
    oilShortfallSnapshot: 171,
    requireSugarOilExactMatch: false,
  });
  assert.equal(resDefault.valid, true);
  assert.equal(resDefault.warnings.length, 1);

  // Strict setting ON: valid = false
  const resStrict = validateInvoiceForSave({
    mode: 'confirm',
    linkedInventoryStatus: 'confirmed',
    linkedInventoryReplenishmentInPiastres: 3_500_000,
    existingConfirmedInvoiceForInventory: false,
    requiredAmountSnapshotInPiastres: 3_500_000,
    lines: [
      {
        productId: 'prod_sugar',
        quantity: 100,
        unitPriceSnapshotInPiastres: 1235,
        lineTotalInPiastres: 123_500,
      },
    ],
    sugarShortfallSnapshot: 221,
    oilShortfallSnapshot: 171,
    requireSugarOilExactMatch: true,
  });
  assert.equal(resStrict.valid, false);
});

test('Section 7 — Backup Schema Validation & Rejection of Invalid Files', async () => {
  const { parseAndValidateBackupFile } = await import('../src/domain/backup.ts');
  const { INITIAL_SETTINGS } = await import('../src/domain/seedData.ts');

  assert.equal(parseAndValidateBackupFile('{bad-json').ok, false);
  assert.equal(
    parseAndValidateBackupFile(JSON.stringify({ schemaVersion: 99, data: {} }))
      .ok,
    false,
  );
  assert.equal(
    parseAndValidateBackupFile(
      JSON.stringify({
        schemaVersion: 1,
        data: { units: [], products: [] },
      }),
    ).ok,
    false,
  );

  const valid = parseAndValidateBackupFile(
    JSON.stringify({
      schemaVersion: 1,
      appName: 'مساعد استعاضة التموين',
      ownerName: 'أحمد حسب الله',
      exportedAt: '2026-11-16T00:00:00.000Z',
      deviceLabel: 'test',
      data: {
        units: INITIAL_UNITS,
        products: INITIAL_PRODUCTS,
        priceHistory: [],
        insuranceHistory: [],
        settings: [INITIAL_SETTINGS],
        inventorySessions: [],
        inventoryLines: [],
        replenishmentInvoices: [],
        replenishmentLines: [],
      },
    }),
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.counts.units, 9);
    assert.equal(valid.counts.products, 8);
  }
});

test('Sugar and Oil always appear first in sorting', async () => {
  const { sortSugarOilFirst } = await import('../src/domain/calculations.ts');
  const shuffled = [
    { id: 'prod_pril', name: 'سائل بريل' },
    { id: 'prod_oil', name: 'زيت' },
    { id: 'prod_pasta', name: 'مكرونة' },
    { id: 'prod_sugar', name: 'سكر' },
  ];
  const sorted = sortSugarOilFirst(shuffled, (x) => x.id);
  assert.equal(sorted[0].id, 'prod_sugar');
  assert.equal(sorted[1].id, 'prod_oil');
  assert.equal(sorted[2].id, 'prod_pril');
  assert.equal(sorted[3].id, 'prod_pasta');
});


