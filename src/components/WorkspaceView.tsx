import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  cancelReplenishmentInvoice,
  deleteInventoryDraft,
  deleteInvoiceDraft,
  getConfirmedInvoiceForInventory,
  getInventorySessionWithLines,
  getInvoiceWithLines,
  getLatestConfirmedInventorySession,
  saveInventorySession,
  saveReplenishmentInvoice,
} from '../db/repository';
import {
  OIL_PRODUCT_ID,
  OIL_TARGET_QTY,
  SUGAR_PRODUCT_ID,
  SUGAR_TARGET_QTY,
  calculateInventorySummary,
  calculateInvoiceMetrics,
  calculateTargetShortfall,
  compareInvoiceSugarOilWithShortfall,
  sortSugarOilFirst,
  validateInvoiceForSave,
} from '../domain/calculations';
import {
  calculateLineTotalInPiastres,
  formatArabicDateTime,
  formatNumber,
  formatPercent,
  formatPiastres,
  parseQuantity,
} from '../domain/money';
import { APP_NAME, OWNER_NAME } from '../domain/seedData';
import type {
  InventoryLine,
  InventorySession,
  Product,
  ReplenishmentInvoice,
  Settings,
  Unit,
} from '../domain/types';
import { ConfirmDialog } from './ConfirmDialog';

interface WorkspaceViewProps {
  settings: Settings;
  products: Product[];
  units: Unit[];
  initialInventoryId?: string | null;
  initialInvoiceId?: string | null;
  onDataChanged: () => Promise<void>;
  onOpenWorkspaceIds: (invId: string | null, facId: string | null) => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface EditableInvoiceRow {
  productId: string;
  productName: string;
  unitName: string;
  unitPriceInPiastres: number;
  allowFractional: boolean;
  rawQty: string;
  quantity: number;
  error: string;
  isAutoSyncedSugarOil?: boolean;
}

function toLocalDateTimeInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  settings,
  products,
  units,
  initialInventoryId,
  initialInvoiceId,
  onDataChanged,
  onOpenWorkspaceIds,
  onDirtyChange,
}) => {
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const activeProducts = useMemo(
    () => sortSugarOilFirst(products.filter((p) => p.isActive), (p) => p.id),
    [products],
  );

  // ---------------- Inventory State ----------------
  const [loadedSession, setLoadedSession] = useState<InventorySession | null>(
    null,
  );
  const [loadedInvLines, setLoadedInvLines] = useState<InventoryLine[]>([]);
  const [sessionDateInput, setSessionDateInput] = useState(() =>
    toLocalDateTimeInputValue(),
  );
  const [invNotes, setInvNotes] = useState('');
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [invInputErrors, setInvInputErrors] = useState<Record<string, string>>(
    {},
  );
  const [invDirty, setInvDirty] = useState(false);

  // ---------------- Invoice State ----------------
  const [loadedInvoice, setLoadedInvoice] =
    useState<ReplenishmentInvoice | null>(null);
  const [existingConfirmedForInv, setExistingConfirmedForInv] =
    useState<ReplenishmentInvoice | null>(null);
  const [invoiceRows, setInvoiceRows] = useState<EditableInvoiceRow[]>([]);
  const [manualOverrideSugarOil, setManualOverrideSugarOil] = useState<{
    sugar: boolean;
    oil: boolean;
  }>({ sugar: false, oil: false });
  const [invNotesFac, setInvNotesFac] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addQtyInput, setAddQtyInput] = useState('');
  const [addError, setAddError] = useState('');
  const [mergeNotice, setMergeNotice] = useState('');
  const [facDirty, setFacDirty] = useState(false);

  // ---------------- Shared UI State ----------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mobileFocus, setMobileFocus] = useState<'both' | 'inventory' | 'invoice'>(
    'both',
  );
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Dialogs
  const [pendingInvSaveMode, setPendingInvSaveMode] = useState<
    'draft' | 'confirm' | null
  >(null);
  const [showBlankZeroPrompt, setShowBlankZeroPrompt] = useState(false);
  const [showInvConfirmReview, setShowInvConfirmReview] = useState(false);
  const [showInvClearConfirm, setShowInvClearConfirm] = useState(false);

  const [showFacConfirmModal, setShowFacConfirmModal] = useState(false);
  const [showFacCancelModal, setShowFacCancelModal] = useState(false);
  const [showFacDiscardModal, setShowFacDiscardModal] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isInvReadOnly =
    loadedSession !== null && loadedSession.status !== 'draft';
  const isFacReadOnly =
    loadedInvoice !== null && loadedInvoice.status !== 'draft';

  useEffect(() => {
    onDirtyChange((invDirty && !isInvReadOnly) || (facDirty && !isFacReadOnly));
    return () => onDirtyChange(false);
  }, [invDirty, facDirty, isInvReadOnly, isFacReadOnly, onDirtyChange]);

  // Helper to reset fresh empty inventory inputs
  const initBlankQtyMap = (prods: Product[]) => {
    const map: Record<string, string> = {};
    for (const p of prods) map[p.id] = '';
    return map;
  };

  // Load requested or fresh workspace
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setStatusMessage(null);
      setInvInputErrors({});
      setAddError('');
      setMergeNotice('');

      try {
        if (initialInvoiceId) {
          const facData = await getInvoiceWithLines(initialInvoiceId);
          if (!active) return;
          if (!facData) {
            setStatusMessage({
              type: 'error',
              text: 'تعذر العثور على الفاتورة المطلوبة.',
            });
            setLoading(false);
            return;
          }
          const invData = await getInventorySessionWithLines(
            facData.invoice.inventorySessionId,
          );
          if (!active) return;
          const confForInv = await getConfirmedInvoiceForInventory(
            facData.invoice.inventorySessionId,
          );
          if (!active) return;

          if (invData) {
            setLoadedSession(invData.session);
            setLoadedInvLines(invData.lines);
            setSessionDateInput(
              toLocalDateTimeInputValue(invData.session.sessionDate),
            );
            setInvNotes(invData.session.notes);
            const map = initBlankQtyMap(activeProducts);
            for (const line of invData.lines) {
              map[line.productId] = String(line.quantity);
            }
            setQtyInputs(map);
          }

          setLoadedInvoice(facData.invoice);
          setExistingConfirmedForInv(
            confForInv && confForInv.id !== facData.invoice.id
              ? confForInv
              : null,
          );
          setInvNotesFac(facData.invoice.notes);
          const sortedLines = sortSugarOilFirst(
            facData.lines,
            (l) => l.productId,
          );
          setInvoiceRows(
            sortedLines.map((l) => {
              const p = productMap.get(l.productId);
              const isDraft = facData.invoice.status === 'draft';
              return {
                productId: l.productId,
                productName: isDraft && p ? p.name : l.productNameSnapshot,
                unitName:
                  isDraft && p
                    ? unitMap.get(p.purchaseUnitId)?.name ?? l.unitNameSnapshot
                    : l.unitNameSnapshot,
                unitPriceInPiastres:
                  isDraft && p
                    ? p.purchasePriceInPiastres
                    : l.unitPriceSnapshotInPiastres,
                allowFractional: p?.allowFractionalQuantity ?? false,
                rawQty: String(l.quantity),
                quantity: l.quantity,
                error: '',
              };
            }),
          );
          setManualOverrideSugarOil({ sugar: true, oil: true });
          setInvDirty(false);
          setFacDirty(false);
        } else if (initialInventoryId) {
          const invData = await getInventorySessionWithLines(initialInventoryId);
          if (!active) return;
          if (!invData) {
            setStatusMessage({
              type: 'error',
              text: 'تعذر العثور على الجرد المطلوب.',
            });
            setLoading(false);
            return;
          }
          const confForInv = await getConfirmedInvoiceForInventory(
            invData.session.id,
          );
          if (!active) return;

          setLoadedSession(invData.session);
          setLoadedInvLines(invData.lines);
          setSessionDateInput(
            toLocalDateTimeInputValue(invData.session.sessionDate),
          );
          setInvNotes(invData.session.notes);
          const map = initBlankQtyMap(activeProducts);
          for (const line of invData.lines) {
            map[line.productId] = String(line.quantity);
          }
          setQtyInputs(map);

          setExistingConfirmedForInv(confForInv);
          if (confForInv) {
            const facData = await getInvoiceWithLines(confForInv.id);
            if (!active) return;
            if (facData) {
              setLoadedInvoice(facData.invoice);
              setInvNotesFac(facData.invoice.notes);
              setInvoiceRows(
                sortSugarOilFirst(facData.lines, (l) => l.productId).map(
                  (l) => ({
                    productId: l.productId,
                    productName: l.productNameSnapshot,
                    unitName: l.unitNameSnapshot,
                    unitPriceInPiastres: l.unitPriceSnapshotInPiastres,
                    allowFractional: false,
                    rawQty: String(l.quantity),
                    quantity: l.quantity,
                    error: '',
                  }),
                ),
              );
              setManualOverrideSugarOil({ sugar: true, oil: true });
            }
          } else {
            setLoadedInvoice(null);
            setInvNotesFac('');
            setInvoiceRows([]);
            setManualOverrideSugarOil({ sugar: false, oil: false });
          }
          setInvDirty(false);
          setFacDirty(false);
        } else {
          // Default live workspace: fresh inventory + live auto-synced invoice!
          // (Also check if there's a latest confirmed inventory just to inform if needed,
          //  but start ready for immediate side-by-side work!)
          setLoadedSession(null);
          setLoadedInvLines([]);
          setSessionDateInput(toLocalDateTimeInputValue());
          setInvNotes('');
          setQtyInputs(initBlankQtyMap(activeProducts));
          setLoadedInvoice(null);
          setExistingConfirmedForInv(null);
          setInvoiceRows([]);
          setInvNotesFac('');
          setManualOverrideSugarOil({ sugar: false, oil: false });
          setInvDirty(false);
          setFacDirty(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [initialInventoryId, initialInvoiceId, activeProducts, productMap, unitMap]);

  // ---------------- Live Inventory Calculations ----------------
  const invRows = useMemo(() => {
    if (isInvReadOnly) {
      return sortSugarOilFirst(loadedInvLines, (l) => l.productId).map(
        (line) => ({
          productId: line.productId,
          name: line.productNameSnapshot,
          unitName: line.unitNameSnapshot,
          priceInPiastres: line.unitPriceSnapshotInPiastres,
          allowFractional: false,
          rawQty: String(line.quantity),
          quantity: line.quantity,
          lineTotalInPiastres: line.lineTotalInPiastres,
          error: '',
        }),
      );
    }

    return activeProducts.map((p) => {
      const unitName = unitMap.get(p.inventoryUnitId)?.name ?? 'وحدة';
      const rawQty = qtyInputs[p.id] ?? '';
      let quantity = 0;
      let error = invInputErrors[p.id] ?? '';
      if (rawQty.trim() !== '') {
        const parsed = parseQuantity(rawQty, p.allowFractionalQuantity);
        if (parsed.ok) {
          quantity = parsed.quantity;
        } else {
          error = parsed.error;
        }
      }
      let lineTotalInPiastres = 0;
      if (!error) {
        try {
          lineTotalInPiastres = calculateLineTotalInPiastres(
            quantity,
            p.inventoryPriceInPiastres,
          );
        } catch (err) {
          error = err instanceof Error ? err.message : 'قيمة غير صالحة';
        }
      }
      return {
        productId: p.id,
        name: p.name,
        unitName,
        priceInPiastres: p.inventoryPriceInPiastres,
        allowFractional: p.allowFractionalQuantity,
        rawQty,
        quantity,
        lineTotalInPiastres,
        error,
      };
    });
  }, [isInvReadOnly, loadedInvLines, activeProducts, unitMap, qtyInputs, invInputErrors]);

  const insuranceLimit = isInvReadOnly
    ? loadedSession!.insuranceLimitSnapshotInPiastres
    : settings.insuranceLimitInPiastres;

  const invSummary = useMemo(() => {
    try {
      return calculateInventorySummary(invRows, insuranceLimit);
    } catch {
      return calculateInventorySummary([], insuranceLimit);
    }
  }, [invRows, insuranceLimit]);

  const sugarInvRow = invRows.find((r) => r.productId === SUGAR_PRODUCT_ID);
  const oilInvRow = invRows.find((r) => r.productId === OIL_PRODUCT_ID);
  const hasTypedSugar = (sugarInvRow?.rawQty.trim() ?? '') !== '';
  const hasTypedOil = (oilInvRow?.rawQty.trim() ?? '') !== '';

  const sugarStatus = calculateTargetShortfall(
    sugarInvRow?.quantity ?? 0,
    SUGAR_TARGET_QTY,
  );
  const oilStatus = calculateTargetShortfall(
    oilInvRow?.quantity ?? 0,
    OIL_TARGET_QTY,
  );

  const hasInvValidationErrors = invRows.some((r) => r.error !== '');
  const blankInvCount = invRows.filter((r) => r.rawQty.trim() === '').length;
  const anyInvQuantityEntered = invRows.some((r) => r.rawQty.trim() !== '');

  // ---------------- Live Auto-Sync Sugar & Oil into Invoice ----------------
  useEffect(() => {
    if (isFacReadOnly || loading) return;

    const sugarProduct = productMap.get(SUGAR_PRODUCT_ID);
    const oilProduct = productMap.get(OIL_PRODUCT_ID);

    // Only auto-populate Sugar/Oil shortfall once user has entered at least a value in Inventory (or loaded an inventory)
    const shouldSyncSugar =
      !manualOverrideSugarOil.sugar &&
      sugarProduct &&
      sugarProduct.isActive &&
      (hasTypedSugar || loadedSession !== null);

    const shouldSyncOil =
      !manualOverrideSugarOil.oil &&
      oilProduct &&
      oilProduct.isActive &&
      (hasTypedOil || loadedSession !== null);

    setInvoiceRows((prev) => {
      let next = [...prev];
      let changed = false;

      const syncTarget = (
        prod: Product,
        shortfall: number,
        shouldSync: boolean,
      ) => {
        if (!shouldSync) return;
        const idx = next.findIndex((r) => r.productId === prod.id);
        const unitName = unitMap.get(prod.purchaseUnitId)?.name ?? 'وحدة';

        if (shortfall > 0) {
          if (idx >= 0) {
            if (
              next[idx].quantity !== shortfall ||
              next[idx].rawQty !== String(shortfall)
            ) {
              next[idx] = {
                ...next[idx],
                quantity: shortfall,
                rawQty: String(shortfall),
                error: '',
                isAutoSyncedSugarOil: true,
              };
              changed = true;
            }
          } else {
            next.push({
              productId: prod.id,
              productName: prod.name,
              unitName,
              unitPriceInPiastres: prod.purchasePriceInPiastres,
              allowFractional: prod.allowFractionalQuantity,
              rawQty: String(shortfall),
              quantity: shortfall,
              error: '',
              isAutoSyncedSugarOil: true,
            });
            changed = true;
          }
        } else if (idx >= 0 && next[idx].isAutoSyncedSugarOil) {
          next.splice(idx, 1);
          changed = true;
        }
      };

      if (sugarProduct) {
        syncTarget(
          sugarProduct,
          sugarStatus.shortfallQty,
          Boolean(shouldSyncSugar),
        );
      }
      if (oilProduct) {
        syncTarget(oilProduct, oilStatus.shortfallQty, Boolean(shouldSyncOil));
      }

      if (!changed) return prev;
      return sortSugarOilFirst(next, (r) => r.productId);
    });
  }, [
    isFacReadOnly,
    loading,
    manualOverrideSugarOil,
    hasTypedSugar,
    hasTypedOil,
    loadedSession,
    sugarStatus.shortfallQty,
    oilStatus.shortfallQty,
    productMap,
    unitMap,
  ]);

  // ---------------- Live Invoice Calculations ----------------
  const requiredAmount = loadedInvoice
    ? loadedInvoice.requiredAmountSnapshotInPiastres
    : invSummary.replenishmentRequiredInPiastres;

  const computedFacRows = useMemo(() => {
    const sorted = sortSugarOilFirst(invoiceRows, (r) => r.productId);
    return sorted.map((r) => {
      let lineTotalInPiastres = 0;
      if (!r.error) {
        try {
          lineTotalInPiastres = calculateLineTotalInPiastres(
            r.quantity,
            r.unitPriceInPiastres,
          );
        } catch {
          lineTotalInPiastres = 0;
        }
      }
      return { ...r, lineTotalInPiastres };
    });
  }, [invoiceRows]);

  const invoiceTotalInPiastres = useMemo(() => {
    if (isFacReadOnly && loadedInvoice) {
      return loadedInvoice.invoiceTotalInPiastres;
    }
    return computedFacRows.reduce((acc, r) => acc + r.lineTotalInPiastres, 0);
  }, [isFacReadOnly, loadedInvoice, computedFacRows]);

  const facMetrics = useMemo(() => {
    return calculateInvoiceMetrics(requiredAmount, invoiceTotalInPiastres);
  }, [requiredAmount, invoiceTotalInPiastres]);

  const sugarOilComparison = useMemo(() => {
    return compareInvoiceSugarOilWithShortfall(
      computedFacRows.map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
      })),
      sugarStatus.shortfallQty,
      oilStatus.shortfallQty,
    );
  }, [computedFacRows, sugarStatus.shortfallQty, oilStatus.shortfallQty]);

  const hasFacRowErrors = computedFacRows.some((r) => r.error !== '');
  const selectedProduct = selectedProductId
    ? productMap.get(selectedProductId) ?? null
    : null;

  const facConfirmValidation = useMemo(() => {
    // When live inventory isn't confirmed yet, simulate as 'confirmed' to evaluate line & overage rules;
    // actual confirmation will confirm inventory first if needed!
    const effectiveInvStatus =
      loadedSession?.status === 'cancelled' ? 'cancelled' : 'confirmed';
    return validateInvoiceForSave({
      mode: 'confirm',
      linkedInventoryStatus: effectiveInvStatus,
      linkedInventoryReplenishmentInPiastres: requiredAmount,
      existingConfirmedInvoiceForInventory: Boolean(existingConfirmedForInv),
      requiredAmountSnapshotInPiastres: requiredAmount,
      lines: computedFacRows.map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
        unitPriceSnapshotInPiastres: r.unitPriceInPiastres,
        lineTotalInPiastres: r.lineTotalInPiastres,
      })),
      sugarShortfallSnapshot: sugarStatus.shortfallQty,
      oilShortfallSnapshot: oilStatus.shortfallQty,
      requireSugarOilExactMatch: settings.requireSugarOilExactMatch,
    });
  }, [
    loadedSession,
    requiredAmount,
    existingConfirmedForInv,
    computedFacRows,
    sugarStatus.shortfallQty,
    oilStatus.shortfallQty,
    settings.requireSugarOilExactMatch,
  ]);

  // ---------------- Inventory Handlers ----------------
  const handleInvQtyChange = (product: Product, value: string) => {
    setInvDirty(true);
    setStatusMessage(null);
    setQtyInputs((prev) => ({ ...prev, [product.id]: value }));

    if (value.trim() === '') {
      setInvInputErrors((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      return;
    }

    const parsed = parseQuantity(value, product.allowFractionalQuantity);
    setInvInputErrors((prev) => {
      const next = { ...prev };
      if (parsed.ok) delete next[product.id];
      else next[product.id] = parsed.error;
      return next;
    });
  };

  const handleInvKeyNavigation = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
      inputRefs.current[idx + 1]?.select();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
      inputRefs.current[idx - 1]?.select();
    }
  };

  const initiateInvSave = (mode: 'draft' | 'confirm') => {
    setStatusMessage(null);
    if (hasInvValidationErrors) {
      setStatusMessage({
        type: 'error',
        text: 'يرجى تصحيح الأخطاء في خانات كميات الجرد قبل الحفظ.',
      });
      return;
    }
    const allZero = invRows.every((r) => r.quantity === 0);
    if (mode === 'confirm' && allZero) {
      setStatusMessage({
        type: 'error',
        text: 'لا يمكن اعتماد جرد فارغ بكميات كلها صفر. أدخل الكميات الفعلية أولاً.',
      });
      return;
    }
    setPendingInvSaveMode(mode);
    if (blankInvCount > 0) {
      setShowBlankZeroPrompt(true);
    } else if (mode === 'confirm') {
      setShowInvConfirmReview(true);
    } else {
      void executeInvSave('draft');
    }
  };

  const executeInvSave = async (
    mode: 'draft' | 'confirm',
  ): Promise<InventorySession | null> => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const isoDate = sessionDateInput
        ? new Date(sessionDateInput).toISOString()
        : new Date().toISOString();
      const result = await saveInventorySession({
        sessionId:
          loadedSession?.status === 'draft' ? loadedSession.id : undefined,
        mode,
        sessionDate: isoDate,
        notes: invNotes,
        items: invRows.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
        })),
      });

      const updatedMap: Record<string, string> = {};
      for (const r of invRows) updatedMap[r.productId] = String(r.quantity);
      setQtyInputs(updatedMap);
      setLoadedSession(result.session);
      setLoadedInvLines(result.lines);
      setInvDirty(false);
      await onDataChanged();

      setStatusMessage({
        type: 'success',
        text:
          mode === 'confirm'
            ? `تم حفظ واعتماد الجرد (${result.session.serialNumber}) بنجاح، وأصبح مبلغ الاستعاضة جاهزاً في الفاتورة.`
            : `تم حفظ مسودة الجرد (${result.session.serialNumber}) بنجاح.`,
      });
      return result.session;
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الجرد.',
      });
      return null;
    } finally {
      setSaving(false);
      setShowBlankZeroPrompt(false);
      setShowInvConfirmReview(false);
      setPendingInvSaveMode(null);
    }
  };

  const handleInvClone = async () => {
    if (!loadedSession) return;
    setSaving(true);
    try {
      const activeIds = new Set(activeProducts.map((p) => p.id));
      const items = activeProducts.map((p) => {
        const old = loadedInvLines.find((l) => l.productId === p.id);
        return {
          productId: p.id,
          quantity: old && activeIds.has(p.id) ? old.quantity : 0,
        };
      });
      const created = await saveInventorySession({
        mode: 'draft',
        sessionDate: new Date().toISOString(),
        notes: `نسخة أولية من ${loadedSession.serialNumber}`,
        items,
      });
      await onDataChanged();
      onOpenWorkspaceIds(created.session.id, null);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر إنشاء نسخة من الجرد.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInvClear = async () => {
    setShowInvClearConfirm(false);
    if (loadedSession?.status === 'draft') {
      await deleteInventoryDraft(loadedSession.id);
      await onDataChanged();
    }
    setLoadedSession(null);
    setLoadedInvLines([]);
    setSessionDateInput(toLocalDateTimeInputValue());
    setInvNotes('');
    setQtyInputs(initBlankQtyMap(activeProducts));
    setInvInputErrors({});
    setInvDirty(false);
    // Also reset auto-synced invoice if it hasn't been saved
    if (!loadedInvoice) {
      setInvoiceRows([]);
      setManualOverrideSugarOil({ sugar: false, oil: false });
      setFacDirty(false);
    }
    setStatusMessage(null);
  };

  // ---------------- Invoice Handlers ----------------
  const handleAddFacLine = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setMergeNotice('');
    setStatusMessage(null);

    if (!selectedProduct) {
      setAddError('اختر صنفاً من القائمة أولاً.');
      return;
    }

    const parsed = parseQuantity(
      addQtyInput,
      selectedProduct.allowFractionalQuantity,
    );
    if (!parsed.ok) {
      setAddError(parsed.error);
      return;
    }
    if (parsed.quantity <= 0) {
      setAddError('يجب أن تكون الكمية أكبر من صفر.');
      return;
    }

    if (selectedProduct.id === SUGAR_PRODUCT_ID) {
      setManualOverrideSugarOil((prev) => ({ ...prev, sugar: true }));
    } else if (selectedProduct.id === OIL_PRODUCT_ID) {
      setManualOverrideSugarOil((prev) => ({ ...prev, oil: true }));
    }

    const unitName =
      unitMap.get(selectedProduct.purchaseUnitId)?.name ?? 'وحدة';

    setInvoiceRows((prev) => {
      const existingIdx = prev.findIndex(
        (r) => r.productId === selectedProduct.id,
      );
      let next: EditableInvoiceRow[];
      if (existingIdx >= 0) {
        next = [...prev];
        const combined = next[existingIdx].quantity + parsed.quantity;
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: combined,
          rawQty: String(combined),
          error: '',
          isAutoSyncedSugarOil: false,
        };
        setMergeNotice(
          `تم جمع الكمية مع السطر الموجود لصنف "${selectedProduct.name}" ليصبح ${formatNumber(
            combined,
          )} ${unitName}.`,
        );
      } else {
        next = [
          ...prev,
          {
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            unitName,
            unitPriceInPiastres: selectedProduct.purchasePriceInPiastres,
            allowFractional: selectedProduct.allowFractionalQuantity,
            rawQty: String(parsed.quantity),
            quantity: parsed.quantity,
            error: '',
            isAutoSyncedSugarOil: false,
          },
        ];
      }
      return sortSugarOilFirst(next, (r) => r.productId);
    });

    setAddQtyInput('');
    setFacDirty(true);
  };

  const handleFacRowQtyChange = (productId: string, rawVal: string) => {
    setFacDirty(true);
    setStatusMessage(null);
    setMergeNotice('');

    if (productId === SUGAR_PRODUCT_ID) {
      setManualOverrideSugarOil((prev) => ({ ...prev, sugar: true }));
    } else if (productId === OIL_PRODUCT_ID) {
      setManualOverrideSugarOil((prev) => ({ ...prev, oil: true }));
    }

    setInvoiceRows((prev) =>
      prev.map((row) => {
        if (row.productId !== productId) return row;
        if (rawVal.trim() === '') {
          return {
            ...row,
            rawQty: rawVal,
            quantity: 0,
            error: 'أدخل كمية صالحة أو احذف السطر.',
            isAutoSyncedSugarOil: false,
          };
        }
        const parsed = parseQuantity(rawVal, row.allowFractional);
        if (!parsed.ok) {
          return {
            ...row,
            rawQty: rawVal,
            quantity: 0,
            error: parsed.error,
            isAutoSyncedSugarOil: false,
          };
        }
        if (parsed.quantity === 0) {
          return {
            ...row,
            rawQty: rawVal,
            quantity: 0,
            error: 'الكمية لا يمكن أن تكون صفراً.',
            isAutoSyncedSugarOil: false,
          };
        }
        return {
          ...row,
          rawQty: rawVal,
          quantity: parsed.quantity,
          error: '',
          isAutoSyncedSugarOil: false,
        };
      }),
    );
  };

  const handleRemoveFacRow = (productId: string) => {
    if (productId === SUGAR_PRODUCT_ID) {
      setManualOverrideSugarOil((prev) => ({ ...prev, sugar: true }));
    } else if (productId === OIL_PRODUCT_ID) {
      setManualOverrideSugarOil((prev) => ({ ...prev, oil: true }));
    }
    setInvoiceRows((prev) => prev.filter((r) => r.productId !== productId));
    setFacDirty(true);
  };

  const handleResyncSugarOil = () => {
    setManualOverrideSugarOil({ sugar: false, oil: false });
    setFacDirty(true);
  };

  const handleSaveInvoice = async (mode: 'draft' | 'confirm') => {
    setSaving(true);
    setStatusMessage(null);
    try {
      let targetInventoryId = loadedSession?.id ?? null;

      // Ensure linked inventory is saved & confirmed first!
      if (!loadedSession || loadedSession.status !== 'confirmed') {
        if (hasInvValidationErrors) {
          throw new Error('يرجى تصحيح أخطاء كميات الجرد أولاً.');
        }
        const allZero = invRows.every((r) => r.quantity === 0);
        if (allZero) {
          throw new Error(
            'أدخل كميات الجرد أولاً ليتم حساب مبلغ الاستعاضة وربط الفاتورة به.',
          );
        }
        const savedInv = await executeInvSave('confirm');
        if (!savedInv) {
          setShowFacConfirmModal(false);
          setSaving(false);
          return;
        }
        targetInventoryId = savedInv.id;
      }

      if (!targetInventoryId) {
        throw new Error('تعذر ربط الفاتورة بجرد معتمد.');
      }

      const savedFac = await saveReplenishmentInvoice({
        invoiceId:
          loadedInvoice?.status === 'draft' ? loadedInvoice.id : undefined,
        inventorySessionId: targetInventoryId,
        mode,
        notes: invNotesFac,
        items: computedFacRows.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
        })),
      });

      setLoadedInvoice(savedFac.invoice);
      setFacDirty(false);
      setShowFacConfirmModal(false);
      await onDataChanged();
      setStatusMessage({
        type: 'success',
        text:
          mode === 'confirm'
            ? `تم اعتماد الجرد والفاتورة (${savedFac.invoice.serialNumber}) بنجاح.`
            : `تم حفظ مسودة الفاتورة (${savedFac.invoice.serialNumber}) بنجاح.`,
      });
    } catch (err) {
      setShowFacConfirmModal(false);
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'تعذر حفظ الفاتورة. تحقق من الحد المالي.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelConfirmedInvoice = async (reason?: string) => {
    if (!loadedInvoice || !reason) return;
    setSaving(true);
    try {
      await cancelReplenishmentInvoice(loadedInvoice.id, reason);
      const refreshed = await getInvoiceWithLines(loadedInvoice.id);
      if (refreshed) setLoadedInvoice(refreshed.invoice);
      setExistingConfirmedForInv(null);
      await onDataChanged();
      setShowFacCancelModal(false);
      setStatusMessage({
        type: 'success',
        text: 'تم إلغاء الفاتورة وحفظ السبب في السجل. يمكنك الآن إنشاء فاتورة جديدة لهذا الجرد.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر إلغاء الفاتورة.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadLatestConfirmedForInvoice = async () => {
    const latest = await getLatestConfirmedInventorySession();
    if (!latest) {
      setStatusMessage({
        type: 'error',
        text: 'لا يوجد جرد معتمد سابق حتى الآن. أدخل الجرد في اللوحة اليمنى أولاً.',
      });
      return;
    }
    onOpenWorkspaceIds(latest.session.id, null);
  };

  const handleDiscardFac = async () => {
    setShowFacDiscardModal(false);
    if (loadedInvoice?.status === 'draft') {
      await deleteInvoiceDraft(loadedInvoice.id);
      await onDataChanged();
    }
    setLoadedInvoice(null);
    setInvoiceRows([]);
    setInvNotesFac('');
    setManualOverrideSugarOil({ sugar: false, oil: false });
    setFacDirty(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        جارٍ تجهيز مساحة العمل...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Quick Controls & Mobile Panel Switcher */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <span>التأمين المعتمد:</span>
          <strong className="font-num text-sm text-blue-700 dark:text-blue-400">
            {formatPiastres(insuranceLimit, true)}
          </strong>
          {loadedSession && (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span>الجرد: {loadedSession.serialNumber}</span>
            </>
          )}
          {loadedInvoice && (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span>الفاتورة: {loadedInvoice.serialNumber}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 md:hidden dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMobileFocus('both')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                mobileFocus === 'both'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              معاً
            </button>
            <button
              type="button"
              onClick={() => setMobileFocus('inventory')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                mobileFocus === 'inventory'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              الجرد
            </button>
            <button
              type="button"
              onClick={() => setMobileFocus('invoice')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                mobileFocus === 'invoice'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              الفاتورة
            </button>
          </div>

          {!loadedSession && (
            <button
              type="button"
              onClick={() => void handleLoadLatestConfirmedForInvoice()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>فتح آخر جرد معتمد</span>
            </button>
          )}

          {(loadedSession || loadedInvoice) && (
            <button
              type="button"
              onClick={() => onOpenWorkspaceIds(null, null)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>عملية جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {statusMessage && (
        <div
          role="status"
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

      {/* SIDE-BY-SIDE DUAL WORKSPACE (RTL: Right = Inventory, Left = Invoice) */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-12">
        {/* ================= RIGHT PANEL: جرد المخزون ================= */}
        <section
          aria-label="جرد المخزون"
          className={`print-surface overflow-hidden rounded-3xl border-2 border-blue-500/50 bg-white shadow-lg dark:border-blue-700/60 dark:bg-slate-900 md:col-span-6 ${
            mobileFocus === 'invoice' ? 'hidden md:block' : 'block'
          }`}
        >
          {/* Blue Panel Header */}
          <div className="bg-gradient-to-l from-blue-700 via-blue-800 to-indigo-800 p-4 text-white sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/20 ring-1 ring-amber-300/40">
                  <Boxes className="h-6 w-6 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold">جرد المخزون</h2>
                  <p className="text-xs text-blue-100">
                    {loadedSession
                      ? `${loadedSession.serialNumber} · ${
                          loadedSession.status === 'confirmed'
                            ? 'معتمد'
                            : loadedSession.status === 'cancelled'
                              ? 'ملغى'
                              : 'مسودة'
                        }`
                      : 'أدخل الكميات الفعلية لحساب الاستعاضة فوراً'}
                  </p>
                </div>
              </div>

              <label className="flex flex-col text-[11px] font-bold text-blue-100">
                <span className="mb-1">تاريخ الجرد</span>
                <input
                  type="datetime-local"
                  value={sessionDateInput}
                  disabled={isInvReadOnly}
                  onChange={(e) => {
                    setSessionDateInput(e.target.value);
                    setInvDirty(true);
                  }}
                  className="font-num min-h-[38px] rounded-xl border border-white/25 bg-white px-2.5 py-1 text-xs font-bold text-slate-900 disabled:bg-slate-100"
                />
              </label>
            </div>

            {/* 2 Vibrant KPI Cards inside Inventory Header */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-gradient-to-b from-sky-400/25 to-blue-900/40 p-3.5 ring-1 ring-white/20">
                <div className="text-xs font-bold text-blue-100">
                  إجمالي قيمة المخزون
                </div>
                <div className="font-num mt-1 text-2xl font-extrabold text-white">
                  {formatPiastres(invSummary.totalInventoryValueInPiastres, true)}
                </div>
              </div>

              <div
                className={`rounded-2xl p-3.5 ring-1 ring-white/25 ${
                  invSummary.status === 'above_insurance'
                    ? 'bg-gradient-to-b from-amber-500 to-orange-700'
                    : 'bg-gradient-to-b from-emerald-500 to-green-700'
                }`}
              >
                <div className="text-xs font-bold text-white/95">
                  المبلغ المطلوب للاستعاضة
                </div>
                <div className="font-num mt-1 text-2xl font-extrabold text-white">
                  {formatPiastres(
                    invSummary.replenishmentRequiredInPiastres,
                    true,
                  )}
                </div>
              </div>
            </div>

            {invSummary.status === 'above_insurance' && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/25 px-3 py-2 text-xs font-bold text-amber-100 ring-1 ring-amber-300/40">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  زيادة عن حد التأمين بمقدار{' '}
                  <strong className="font-num">
                    {formatPiastres(
                      invSummary.surplusOverInsuranceInPiastres,
                      true,
                    )}
                  </strong>{' '}
                  — الاستعاضة 0.00 ج.م
                </span>
              </div>
            )}
          </div>

          {/* Sugar & Oil Target Strip */}
          <div className="grid grid-cols-1 gap-2 border-b border-slate-200 bg-sky-50/70 p-3 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-800/50">
            {[
              { label: 'السكر', unit: 'كيلو', data: sugarStatus },
              { label: 'الزيت', unit: 'زجاجة', data: oilStatus },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <div>
                  <strong className="text-slate-900 dark:text-white">
                    {item.label}
                  </strong>
                  <span className="mr-1.5 text-slate-500 dark:text-slate-400">
                    (مستهدف {formatNumber(item.data.targetQty)})
                  </span>
                </div>
                {item.data.status === 'shortfall' ? (
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    ناقص:{' '}
                    <strong className="font-num text-sm">
                      {formatNumber(item.data.shortfallQty)}
                    </strong>{' '}
                    {item.unit}
                  </span>
                ) : item.data.status === 'surplus' ? (
                  <span className="font-bold text-blue-700 dark:text-blue-400">
                    زيادة:{' '}
                    <strong className="font-num">
                      {formatNumber(item.data.surplusQty)}
                    </strong>
                  </span>
                ) : (
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    مطابق (0)
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Read-Only Banner for Historical Inventory */}
          {isInvReadOnly && loadedSession && (
            <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
              <span>سجل تاريخي محفوظ (للقراءة فقط)</span>
              <button
                type="button"
                onClick={() => void handleInvClone()}
                disabled={saving}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>إنشاء جرد جديد كنسخة</span>
              </button>
            </div>
          )}

          {/* Inventory Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="bg-blue-900 text-white">
                  <th className="px-2.5 py-3 text-center font-bold">م</th>
                  <th className="sticky right-0 z-10 bg-blue-900 px-3 py-3 font-extrabold">
                    الصنف
                  </th>
                  <th className="px-2.5 py-3 font-bold">الوحدة</th>
                  <th className="px-2.5 py-3 font-bold">سعر الوحدة</th>
                  <th className="px-2.5 py-3 font-bold">الكمية الموجودة</th>
                  <th className="px-3 py-3 font-extrabold">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {invRows.map((row, idx) => (
                  <tr
                    key={row.productId}
                    className={`border-b border-slate-200 dark:border-slate-800 ${
                      idx % 2 === 1
                        ? 'bg-sky-50/80 dark:bg-slate-800/40'
                        : 'bg-white dark:bg-slate-900'
                    }`}
                  >
                    <td className="font-num px-2.5 py-2.5 text-center text-xs font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td
                      className={`sticky right-0 z-10 px-3 py-2.5 font-extrabold text-slate-900 dark:text-white ${
                        idx % 2 === 1
                          ? 'bg-sky-50 dark:bg-slate-800'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      {row.name}
                    </td>
                    <td className="px-2.5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {row.unitName}
                    </td>
                    <td className="font-num px-2.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      {formatPiastres(row.priceInPiastres)}
                    </td>
                    <td className="px-2.5 py-2">
                      {isInvReadOnly ? (
                        <span className="font-num font-bold text-slate-900 dark:text-white">
                          {formatNumber(row.quantity)}
                        </span>
                      ) : (
                        <div>
                          <input
                            ref={(el) => {
                              inputRefs.current[idx] = el;
                            }}
                            type="text"
                            inputMode={
                              row.allowFractional ? 'decimal' : 'numeric'
                            }
                            value={row.rawQty}
                            placeholder="0"
                            onChange={(e) => {
                              const prod = activeProducts.find(
                                (p) => p.id === row.productId,
                              );
                              if (prod) handleInvQtyChange(prod, e.target.value);
                            }}
                            onKeyDown={(e) => handleInvKeyNavigation(e, idx)}
                            aria-label={`كمية ${row.name}`}
                            className={`font-num min-h-[40px] w-24 rounded-xl border px-2 py-1 text-center text-sm font-extrabold focus:outline-none focus:ring-2 ${
                              row.error
                                ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-500/25 dark:bg-red-950/60 dark:text-red-300'
                                : 'border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                            }`}
                          />
                          {row.error && (
                            <p className="mt-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                              {row.error}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="font-num px-3 py-2.5 text-sm font-extrabold text-blue-800 dark:text-blue-300">
                      {formatPiastres(row.lineTotalInPiastres)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-extrabold text-slate-900 dark:bg-slate-800 dark:text-white">
                  <td colSpan={5} className="px-3 py-3 text-sm">
                    إجمالي قيمة المخزون
                  </td>
                  <td className="font-num px-3 py-3 text-sm text-blue-700 dark:text-blue-300">
                    {formatPiastres(
                      invSummary.totalInventoryValueInPiastres,
                      true,
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Inventory Notes & Actions */}
          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <input
              type="text"
              value={invNotes}
              disabled={isInvReadOnly}
              onChange={(e) => {
                setInvNotes(e.target.value);
                setInvDirty(true);
              }}
              placeholder="ملاحظات الجرد (اختياري)..."
              className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {!isInvReadOnly && (
              <div className="no-print mt-3 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={saving || hasInvValidationErrors}
                  onClick={() => initiateInvSave('confirm')}
                  className="btn-3d inline-flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-[0_3px_0_0_#1e3a8a] hover:from-blue-600 hover:to-blue-800 disabled:opacity-50 sm:text-sm"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>حفظ واعتماد الجرد</span>
                </button>
                <button
                  type="button"
                  disabled={saving || hasInvValidationErrors}
                  onClick={() => initiateInvSave('draft')}
                  className="btn-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-teal-500 to-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-[0_3px_0_0_#115e59] hover:from-teal-600 hover:to-teal-800 disabled:opacity-50 sm:text-sm"
                >
                  <Save className="h-4 w-4" />
                  <span>مسودة</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowInvClearConfirm(true)}
                  className="btn-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-[0_3px_0_0_#991b1b] hover:from-red-600 hover:to-red-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>مسح البيانات</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ================= LEFT PANEL: فاتورة الاستعاضة ================= */}
        <section
          aria-label="فاتورة الاستعاضة"
          className={`print-surface overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-white shadow-lg dark:border-emerald-700/60 dark:bg-slate-900 md:col-span-6 ${
            mobileFocus === 'inventory' ? 'hidden md:block' : 'block'
          }`}
        >
          {/* Green/Teal Panel Header */}
          <div className="bg-gradient-to-l from-emerald-700 via-teal-700 to-teal-800 p-4 text-white sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold">فاتورة الاستعاضة</h2>
                  <p className="text-xs text-emerald-100">
                    {loadedInvoice
                      ? `${loadedInvoice.serialNumber} · ${
                          loadedInvoice.status === 'confirmed'
                            ? 'معتمدة'
                            : loadedInvoice.status === 'cancelled'
                              ? 'ملغاة'
                              : 'مسودة'
                        }`
                      : anyInvQuantityEntered || loadedSession
                        ? 'مرتبطة مباشرة بمبلغ الجرد الظاهر'
                        : 'في انتظار إدخال كميات الجرد'}
                  </p>
                </div>
              </div>

              {(manualOverrideSugarOil.sugar || manualOverrideSugarOil.oil) &&
                !isFacReadOnly && (
                  <button
                    type="button"
                    onClick={handleResyncSugarOil}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>مزامنة السكر والزيت مع الجرد</span>
                  </button>
                )}
            </div>

            {/* Required Replenishment Banner Bar (just like mockup!) */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-950/35 px-4 py-2.5 ring-1 ring-white/20">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-100">
                <ShoppingCart className="h-4 w-4 text-amber-300" />
                <span>مبلغ الاستعاضة المطلوب:</span>
              </div>
              <strong className="font-num text-xl font-extrabold text-amber-300">
                {formatPiastres(facMetrics.requiredAmountInPiastres, true)}
              </strong>
            </div>

            {/* 2 Vibrant KPI Cards inside Invoice Header */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                className={`rounded-2xl p-3.5 ring-1 ring-white/20 ${
                  facMetrics.isOverLimit
                    ? 'bg-gradient-to-b from-red-500 to-red-700'
                    : 'bg-gradient-to-b from-blue-500/70 to-blue-800/80'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-white/95">
                  <span>إجمالي الفاتورة</span>
                  <span className="font-num">
                    {formatPercent(facMetrics.usagePercent)}
                  </span>
                </div>
                <div className="font-num mt-1 text-2xl font-extrabold text-white">
                  {formatPiastres(facMetrics.invoiceTotalInPiastres, true)}
                </div>
              </div>

              <div
                className={`rounded-2xl p-3.5 ring-1 ring-white/25 ${
                  facMetrics.isOverLimit
                    ? 'bg-gradient-to-b from-red-600 to-rose-800'
                    : 'bg-gradient-to-b from-emerald-500 to-green-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-white/95">
                  <span>
                    {facMetrics.isOverLimit
                      ? 'قيمة التجاوز الممنوع'
                      : 'المتبقي (النقص المسموح)'}
                  </span>
                  <span className="font-num">
                    {facMetrics.isOverLimit
                      ? formatPercent(facMetrics.overagePercent)
                      : formatPercent(facMetrics.shortfallPercent)}
                  </span>
                </div>
                <div className="font-num mt-1 text-2xl font-extrabold text-white">
                  {facMetrics.isOverLimit
                    ? formatPiastres(facMetrics.overageAmountInPiastres, true)
                    : formatPiastres(
                        facMetrics.remainingAmountInPiastres,
                        true,
                      )}
                </div>
              </div>
            </div>
          </div>

          {/* Cancelled or Existing Confirmed Guard */}
          {loadedInvoice?.status === 'cancelled' &&
            loadedInvoice.cancellationReason && (
              <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
                سبب الإلغاء: {loadedInvoice.cancellationReason}
              </div>
            )}

          {!loadedInvoice && existingConfirmedForInv && (
            <div className="border-b border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
              توجد فاتورة معتمدة بالفعل لهذا الجرد (
              {existingConfirmedForInv.serialNumber}). يمكنك عرضها أو إلغاؤها من
              السجل قبل اعتماد فاتورة أخرى.
            </div>
          )}

          {/* Add Manual Item Bar */}
          {!isFacReadOnly && (
            <form
              onSubmit={handleAddFacLine}
              className="no-print border-b border-slate-200 bg-emerald-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    إضافة صنف آخر للفاتورة يدوياً
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setAddError('');
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">— اختر صنف الاستعاضة —</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatPiastres(p.purchasePriceInPiastres)} ج /{' '}
                        {unitMap.get(p.purchaseUnitId)?.name ?? 'وحدة'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-24">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    الكمية
                  </label>
                  <input
                    type="text"
                    inputMode={
                      selectedProduct?.allowFractionalQuantity
                        ? 'decimal'
                        : 'numeric'
                    }
                    value={addQtyInput}
                    onChange={(e) => {
                      setAddQtyInput(e.target.value);
                      setAddError('');
                    }}
                    placeholder="0"
                    className="font-num mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-extrabold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="btn-3d inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-gradient-to-b from-emerald-500 to-teal-700 px-4 py-2 text-xs font-extrabold text-white shadow-[0_2px_0_0_#115e59] hover:from-emerald-600 hover:to-teal-800"
                >
                  <Plus className="h-4 w-4" />
                  <span>إضافة</span>
                </button>
              </div>
              {addError && (
                <p className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400">
                  {addError}
                </p>
              )}
              {mergeNotice && (
                <p className="mt-1.5 text-xs font-bold text-blue-700 dark:text-blue-400">
                  {mergeNotice}
                </p>
              )}
            </form>
          )}

          {/* Invoice Table */}
          <div className="overflow-x-auto">
            {computedFacRows.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                أدخل كميات السكر والزيت في الجرد لتظهر الكميات الناقصة تلقائياً
                كأول صنفين، أو أضف أي صنف يدوياً من القائمة أعلاه.
              </div>
            ) : (
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr className="bg-teal-900 text-white">
                    <th className="px-2.5 py-3 text-center font-bold">م</th>
                    <th className="px-3 py-3 font-extrabold">الصنف</th>
                    <th className="px-2.5 py-3 font-bold">الوحدة</th>
                    <th className="px-2.5 py-3 font-bold">سعر الوحدة</th>
                    <th className="px-2.5 py-3 font-bold">الكمية</th>
                    <th className="px-3 py-3 font-extrabold">الإجمالي</th>
                    {!isFacReadOnly && (
                      <th className="no-print px-2 py-3 text-center font-bold">
                        حذف
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {computedFacRows.map((row, idx) => (
                    <tr
                      key={row.productId}
                      className={`border-b border-slate-200 dark:border-slate-800 ${
                        idx % 2 === 1
                          ? 'bg-emerald-50/60 dark:bg-slate-800/40'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <td className="font-num px-2.5 py-2.5 text-center text-xs font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-extrabold text-slate-900 dark:text-white">
                        <div>{row.productName}</div>
                        {row.isAutoSyncedSugarOil && (
                          <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400">
                            نقص محسوب من الجرد
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {row.unitName}
                      </td>
                      <td className="font-num px-2.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                        {formatPiastres(row.unitPriceInPiastres)}
                      </td>
                      <td className="px-2.5 py-2">
                        {isFacReadOnly ? (
                          <span className="font-num font-bold text-slate-900 dark:text-white">
                            {formatNumber(row.quantity)}
                          </span>
                        ) : (
                          <div>
                            <input
                              type="text"
                              inputMode={
                                row.allowFractional ? 'decimal' : 'numeric'
                              }
                              value={row.rawQty}
                              onChange={(e) =>
                                handleFacRowQtyChange(
                                  row.productId,
                                  e.target.value,
                                )
                              }
                              aria-label={`كمية فاتورة ${row.productName}`}
                              className={`font-num min-h-[40px] w-20 rounded-xl border px-2 py-1 text-center text-sm font-extrabold focus:outline-none focus:ring-2 ${
                                row.error || facMetrics.isOverLimit
                                  ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-500/30 dark:bg-red-950/70 dark:text-red-300'
                                  : 'border-slate-300 bg-white text-slate-900 focus:border-teal-600 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                              }`}
                            />
                            {row.error && (
                              <p className="mt-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                                {row.error}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td
                        className={`font-num px-3 py-2.5 text-sm font-extrabold ${
                          facMetrics.isOverLimit
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {formatPiastres(row.lineTotalInPiastres)}
                      </td>
                      {!isFacReadOnly && (
                        <td className="no-print px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFacRow(row.productId)}
                            aria-label={`حذف ${row.productName}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-extrabold text-slate-900 dark:bg-slate-800 dark:text-white">
                    <td colSpan={5} className="px-3 py-3 text-sm">
                      إجمالي الفاتورة
                    </td>
                    <td
                      colSpan={isFacReadOnly ? 1 : 2}
                      className={`font-num px-3 py-3 text-sm ${
                        facMetrics.isOverLimit
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {formatPiastres(facMetrics.invoiceTotalInPiastres, true)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Live Status Bar (just like mockup!) */}
          <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-800">
            {facMetrics.isOverLimit ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-2xl border-2 border-red-500 bg-red-600 px-4 py-3 text-xs font-extrabold text-white shadow-sm"
              >
                <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div>
                    تجاوز مالي بمقدار{' '}
                    <span className="font-num">
                      {formatPiastres(facMetrics.overageAmountInPiastres, true)}
                    </span>{' '}
                    ({formatPercent(facMetrics.overagePercent)}) — ممنوع الحفظ أو
                    الاعتماد!
                  </div>
                </div>
              </div>
            ) : requiredAmount <= 0 ? (
              <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <ClipboardList className="h-4 w-4 shrink-0" />
                <span>مبلغ الاستعاضة المطلوب حالياً 0.00 ج.م</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-600 to-green-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>
                  {facMetrics.isExactMatch
                    ? 'الفاتورة مطابقة للمبلغ المطلوب بالضبط (100%)'
                    : 'الفاتورة سليمة (داخل الحد المسموح)'}
                </span>
              </div>
            )}

            {!facMetrics.isOverLimit && sugarOilComparison.hasMismatch && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  كمية السكر أو الزيت بالفاتورة تختلف عن نقص الجرد (
                  {settings.requireSugarOilExactMatch
                    ? 'إلزام المطابقة مفعّل في الإعدادات'
                    : 'تنبيه فقط'}
                  ).
                </span>
              </div>
            )}

            <input
              type="text"
              value={invNotesFac}
              disabled={isFacReadOnly}
              onChange={(e) => {
                setInvNotesFac(e.target.value);
                setFacDirty(true);
              }}
              placeholder="ملاحظات الفاتورة (اختياري)..."
              className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            {!isFacReadOnly ? (
              <div className="no-print flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={
                    saving ||
                    hasFacRowErrors ||
                    facMetrics.isOverLimit ||
                    !facConfirmValidation.valid
                  }
                  onClick={() => setShowFacConfirmModal(true)}
                  className="btn-3d inline-flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-[0_3px_0_0_#1e3a8a] hover:from-blue-600 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>حفظ الفاتورة واعتمادها</span>
                </button>
                <button
                  type="button"
                  disabled={
                    saving ||
                    hasFacRowErrors ||
                    facMetrics.isOverLimit ||
                    computedFacRows.length === 0 ||
                    requiredAmount <= 0
                  }
                  onClick={() => void handleSaveInvoice('draft')}
                  className="btn-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-teal-500 to-teal-700 px-3.5 py-2.5 text-xs font-bold text-white shadow-[0_3px_0_0_#115e59] disabled:opacity-45"
                >
                  <Save className="h-4 w-4" />
                  <span>مسودة</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={computedFacRows.length === 0}
                  className="btn-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-700 px-3.5 py-2.5 text-xs font-bold text-white shadow-[0_3px_0_0_#3730a3] disabled:opacity-45"
                >
                  <Printer className="h-4 w-4" />
                  <span>طباعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFacDiscardModal(true)}
                  className="btn-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-[0_3px_0_0_#991b1b]"
                >
                  <XCircle className="h-4 w-4" />
                  <span>إلغاء</span>
                </button>
              </div>
            ) : (
              <div className="no-print flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-3d inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-[0_2px_0_0_#3730a3]"
                >
                  <Printer className="h-4 w-4" />
                  <span>طباعة</span>
                </button>
                {loadedInvoice?.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={() => setShowFacCancelModal(true)}
                    className="btn-3d inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-[0_2px_0_0_#991b1b]"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>إلغاء الفاتورة</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Print Footer */}
      <div className="print-only hidden border-t border-slate-300 pt-4 text-center text-xs text-slate-700">
        {APP_NAME} — إعداد وتنفيذ لصالح: {OWNER_NAME} — تاريخ الطباعة:{' '}
        {formatArabicDateTime(new Date().toISOString())}
      </div>

      {/* Blank Quantity Confirmation */}
      <ConfirmDialog
        open={showBlankZeroPrompt}
        title="تأكيد الخانات الفارغة"
        variant="warning"
        description={
          <p>
            توجد <strong>{blankInvCount}</strong> أصناف لم يتم إدخال كمية لها في
            الجرد. هل تريد اعتبار الخانات الفارغة صفراً (0) والمتابعة؟
          </p>
        }
        confirmLabel="اعتبار الفارغ صفراً والمتابعة"
        cancelLabel="العودة للجدول"
        onCancel={() => {
          setShowBlankZeroPrompt(false);
          setPendingInvSaveMode(null);
        }}
        onConfirm={() => {
          setShowBlankZeroPrompt(false);
          if (pendingInvSaveMode === 'confirm') {
            setShowInvConfirmReview(true);
          } else {
            void executeInvSave('draft');
          }
        }}
      />

      {/* Inventory Review Summary */}
      <ConfirmDialog
        open={showInvConfirmReview}
        title="مراجعة وتأكيد اعتماد الجرد"
        variant="primary"
        busy={saving}
        description={
          <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 text-sm dark:bg-slate-800">
            <div className="flex justify-between">
              <span>إجمالي قيمة المخزون:</span>
              <strong className="font-num text-blue-700 dark:text-blue-300">
                {formatPiastres(invSummary.totalInventoryValueInPiastres, true)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>قيمة التأمين:</span>
              <strong className="font-num">
                {formatPiastres(invSummary.insuranceLimitInPiastres, true)}
              </strong>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span>مبلغ الاستعاضة المطلوب:</span>
              <strong className="font-num text-emerald-700 dark:text-emerald-400">
                {formatPiastres(
                  invSummary.replenishmentRequiredInPiastres,
                  true,
                )}
              </strong>
            </div>
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>نقص السكر / نقص الزيت:</span>
              <span className="font-num font-bold">
                {formatNumber(sugarStatus.shortfallQty)} كيلو /{' '}
                {formatNumber(oilStatus.shortfallQty)} زجاجة
              </span>
            </div>
          </div>
        }
        confirmLabel="اعتماد الجرد نهائياً"
        cancelLabel="مراجعة"
        onCancel={() => {
          setShowInvConfirmReview(false);
          setPendingInvSaveMode(null);
        }}
        onConfirm={() => void executeInvSave('confirm')}
      />

      {/* Clear Inventory Dialog */}
      <ConfirmDialog
        open={showInvClearConfirm}
        title="مسح بيانات الجرد الحالي؟"
        variant="danger"
        description="سيتم مسح الكميات المدخلة حالياً في الجرد. السجلات المعتمدة السابقة لن تتأثر."
        confirmLabel="نعم، مسح البيانات"
        cancelLabel="تراجع"
        onCancel={() => setShowInvClearConfirm(false)}
        onConfirm={() => void handleInvClear()}
      />

      {/* Confirm Invoice Modal */}
      <ConfirmDialog
        open={showFacConfirmModal}
        title="تأكيد اعتماد فاتورة الاستعاضة"
        variant="primary"
        busy={saving}
        description={
          <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 text-sm dark:bg-slate-800">
            {(!loadedSession || loadedSession.status !== 'confirmed') && (
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                ملاحظة: سيتم اعتماد الجرد الحالي تلقائياً ثم اعتماد هذه الفاتورة
                وربطها به.
              </p>
            )}
            <div className="flex justify-between">
              <span>مبلغ الاستعاضة المطلوب:</span>
              <strong className="font-num">
                {formatPiastres(facMetrics.requiredAmountInPiastres, true)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>إجمالي الفاتورة:</span>
              <strong className="font-num text-emerald-700 dark:text-emerald-400">
                {formatPiastres(facMetrics.invoiceTotalInPiastres, true)}
              </strong>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span>المتبقي (النقص المسموح):</span>
              <strong className="font-num">
                {formatPiastres(facMetrics.remainingAmountInPiastres, true)} (
                {formatPercent(facMetrics.shortfallPercent)})
              </strong>
            </div>
          </div>
        }
        confirmLabel="اعتماد نهائي"
        cancelLabel="مراجعة"
        onCancel={() => setShowFacConfirmModal(false)}
        onConfirm={() => void handleSaveInvoice('confirm')}
      />

      {/* Cancel Confirmed Invoice Modal */}
      <ConfirmDialog
        open={showFacCancelModal}
        title="إلغاء الفاتورة المعتمدة"
        variant="danger"
        busy={saving}
        description="ستظل الفاتورة محفوظة في السجل كفاتورة ملغاة مع سبب الإلغاء، ويمكنك بعدها إنشاء فاتورة جديدة لهذا الجرد."
        requireTextReason={{
          label: 'سبب إلغاء الفاتورة',
          placeholder: 'أدخل سبب الإلغاء...',
        }}
        confirmLabel="تأكيد الإلغاء"
        cancelLabel="تراجع"
        onCancel={() => setShowFacCancelModal(false)}
        onConfirm={(reason) => void handleCancelConfirmedInvoice(reason)}
      />

      {/* Discard Invoice Modal */}
      <ConfirmDialog
        open={showFacDiscardModal}
        title="إلغاء الفاتورة الحالية؟"
        variant="danger"
        description="سيتم تفريغ بنود الفاتورة غير المعتمدة."
        confirmLabel="نعم، إلغاء"
        cancelLabel="تراجع"
        onCancel={() => setShowFacDiscardModal(false)}
        onConfirm={() => void handleDiscardFac()}
      />
    </div>
  );
};
