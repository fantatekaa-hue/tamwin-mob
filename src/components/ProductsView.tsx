import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  History,
  Package,
  Plus,
  Power,
  X,
} from 'lucide-react';
import {
  isProductUsedInHistory,
  saveProduct,
  toggleProductActive,
} from '../db/repository';
import { sortSugarOilFirst } from '../domain/calculations';
import { formatArabicDateTime, formatPiastres, parseEgpToPiastres } from '../domain/money';
import type { PriceHistory, Product, Unit } from '../domain/types';
import { ConfirmDialog } from './ConfirmDialog';

interface ProductsViewProps {
  products: Product[];
  units: Unit[];
  priceHistory: PriceHistory[];
  onDataChanged: () => Promise<void>;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  units,
  priceHistory,
  onDataChanged,
}) => {
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const activeUnits = useMemo(() => units.filter((u) => u.isActive), [units]);

  const [tab, setTab] = useState<'inventory' | 'purchase' | 'history'>(
    'inventory',
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [usedInHistory, setUsedInHistory] = useState(false);

  const [name, setName] = useState('');
  const [invUnitId, setInvUnitId] = useState('');
  const [invPrice, setInvPrice] = useState('');
  const [purUnitId, setPurUnitId] = useState('');
  const [purPrice, setPurPrice] = useState('');
  const [allowFractional, setAllowFractional] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [priceEditWarningOpen, setPriceEditWarningOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const openAddModal = () => {
    setEditingProduct(null);
    setUsedInHistory(false);
    setName('');
    setInvUnitId(activeUnits[0]?.id ?? '');
    setInvPrice('');
    setPurUnitId(activeUnits[0]?.id ?? '');
    setPurPrice('');
    setAllowFractional(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = async (product: Product) => {
    const used = await isProductUsedInHistory(product.id);
    setEditingProduct(product);
    setUsedInHistory(used);
    setName(product.name);
    setInvUnitId(product.inventoryUnitId);
    setInvPrice((product.inventoryPriceInPiastres / 100).toFixed(2));
    setPurUnitId(product.purchaseUnitId);
    setPurPrice((product.purchasePriceInPiastres / 100).toFixed(2));
    setAllowFractional(product.allowFractionalQuantity);
    setFormError('');
    setModalOpen(true);
  };

  const validateForm = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('اسم الصنف مطلوب ولا يمكن أن يكون فارغاً.');
      return null;
    }
    const parsedInv = parseEgpToPiastres(invPrice);
    if (!parsedInv.ok) {
      setFormError(`سعر الجرد: ${parsedInv.error}`);
      return null;
    }
    const parsedPur = parseEgpToPiastres(purPrice);
    if (!parsedPur.ok) {
      setFormError(`سعر الاستعاضة: ${parsedPur.error}`);
      return null;
    }
    if (!invUnitId || !purUnitId) {
      setFormError('يرجى اختيار وحدة الجرد ووحدة الاستعاضة.');
      return null;
    }
    return {
      cleanName,
      invPiastres: parsedInv.piastres,
      purPiastres: parsedPur.piastres,
    };
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const validated = validateForm();
    if (!validated) return;

    // Duplicate name check when creating or renaming
    const duplicate = products.some(
      (p) =>
        p.id !== editingProduct?.id &&
        p.name.trim() === validated.cleanName,
    );
    if (duplicate) {
      setDuplicateConfirmOpen(true);
      return;
    }

    // Price change warning if product was used in historical records
    if (
      editingProduct &&
      usedInHistory &&
      (editingProduct.inventoryPriceInPiastres !== validated.invPiastres ||
        editingProduct.purchasePriceInPiastres !== validated.purPiastres)
    ) {
      setPriceEditWarningOpen(true);
      return;
    }

    await persistProduct(validated);
  };

  const persistProduct = async (validated: {
    cleanName: string;
    invPiastres: number;
    purPiastres: number;
  }) => {
    setSaving(true);
    setFormError('');
    try {
      await saveProduct({
        id: editingProduct?.id,
        name: validated.cleanName,
        inventoryUnitId: invUnitId,
        inventoryPriceInPiastres: validated.invPiastres,
        purchaseUnitId: purUnitId,
        purchasePriceInPiastres: validated.purPiastres,
        allowFractionalQuantity: allowFractional,
      });
      await onDataChanged();
      setModalOpen(false);
      setDuplicateConfirmOpen(false);
      setPriceEditWarningOpen(false);
      setStatusMessage(
        editingProduct
          ? `تم تحديث الصنف "${validated.cleanName}" بنجاح.`
          : `تمت إضافة الصنف "${validated.cleanName}" بنجاح.`,
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'تعذر حفظ بيانات الصنف.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    await toggleProductActive(product.id, !product.isActive);
    await onDataChanged();
    setStatusMessage(
      product.isActive
        ? `تم تعطيل الصنف "${product.name}" (العمليات السابقة محفوظة كما هي).`
        : `تم إعادة تفعيل الصنف "${product.name}".`,
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              الأصناف والأسعار
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              أسعار ووحدات الجرد مستقلة تماماً عن أسعار ووحدات الاستعاضة. أي
              تعديل للسعر لا يغيّر العمليات القديمة.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="btn-3d inline-flex min-h-[46px] shrink-0 items-center gap-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_3px_0_0_#1e3a8a] hover:from-blue-600 hover:to-blue-800"
          >
            <Plus className="h-5 w-5" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('inventory')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-extrabold transition-colors ${
              tab === 'inventory'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>أصناف الجرد</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('purchase')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-extrabold transition-colors ${
              tab === 'purchase'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>أصناف الاستعاضة</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-extrabold transition-colors ${
              tab === 'history'
                ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            <History className="h-4 w-4" />
            <span>سجل تغييرات الأسعار ({priceHistory.length})</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {(tab === 'inventory' || tab === 'purchase') && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr
                  className={`text-white ${
                    tab === 'inventory'
                      ? 'bg-gradient-to-l from-blue-700 to-blue-800'
                      : 'bg-gradient-to-l from-teal-700 to-emerald-700'
                  }`}
                >
                  <th className="px-4 py-3.5 font-extrabold">اسم الصنف</th>
                  <th className="px-4 py-3.5 font-bold">
                    {tab === 'inventory' ? 'وحدة الجرد' : 'وحدة الاستعاضة'}
                  </th>
                  <th className="px-4 py-3.5 font-bold">
                    {tab === 'inventory'
                      ? 'سعر الجرد (ج.م)'
                      : 'سعر الاستعاضة (ج.م)'}
                  </th>
                  <th className="px-4 py-3.5 font-bold">الكسور في الكمية</th>
                  <th className="px-4 py-3.5 font-bold">الحالة</th>
                  <th className="px-4 py-3.5 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sortSugarOilFirst(products, (item) => item.id).map((p, idx) => {
                  const unitId =
                    tab === 'inventory' ? p.inventoryUnitId : p.purchaseUnitId;
                  const price =
                    tab === 'inventory'
                      ? p.inventoryPriceInPiastres
                      : p.purchasePriceInPiastres;
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-200 dark:border-slate-800 ${
                        idx % 2 === 1
                          ? 'bg-sky-50/60 dark:bg-slate-800/40'
                          : 'bg-white dark:bg-slate-900'
                      } ${!p.isActive ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-white">
                        {p.name}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {unitMap.get(unitId)?.name ?? 'وحدة'}
                      </td>
                      <td className="font-num px-4 py-3 font-extrabold text-blue-800 dark:text-blue-300">
                        {formatPiastres(price, true)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {p.allowFractionalQuantity ? 'مسموح بالكسور' : 'أعداد صحيحة فقط'}
                      </td>
                      <td className="px-4 py-3 text-xs font-extrabold">
                        <span
                          className={
                            p.isActive
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {p.isActive ? 'نشط' : 'غير نشط (معطل)'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void openEditModal(p)}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(p)}
                            className={`inline-flex min-h-[38px] items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
                              p.isActive
                                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300'
                            }`}
                          >
                            <Power className="h-4 w-4" />
                            <span>{p.isActive ? 'تعطيل' : 'تفعيل'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {priceHistory.length === 0 ? (
            <div className="p-10 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              لم يتم تعديل أي أسعار بعد. عند تعديل سعر أي صنف سيُسجل التاريخ
              هنا تلقائياً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-4 py-3.5 font-extrabold">الصنف</th>
                    <th className="px-4 py-3.5 font-bold">العملية</th>
                    <th className="px-4 py-3.5 font-bold">الوحدة</th>
                    <th className="px-4 py-3.5 font-bold">السعر القديم</th>
                    <th className="px-4 py-3.5 font-bold">السعر الجديد</th>
                    <th className="px-4 py-3.5 font-bold">تاريخ التعديل</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((h, idx) => (
                    <tr
                      key={h.id}
                      className={`border-b border-slate-200 dark:border-slate-800 ${
                        idx % 2 === 1
                          ? 'bg-sky-50/50 dark:bg-slate-800/40'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-white">
                        {h.productNameSnapshot}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                        {h.operationType === 'inventory'
                          ? 'جرد المخزون'
                          : 'فاتورة الاستعاضة'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {h.unitNameSnapshot}
                      </td>
                      <td className="font-num px-4 py-3 text-slate-500 line-through dark:text-slate-400">
                        {formatPiastres(h.oldPriceInPiastres, true)}
                      </td>
                      <td className="font-num px-4 py-3 font-extrabold text-blue-700 dark:text-blue-400">
                        {formatPiastres(h.newPriceInPiastres, true)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {formatArabicDateTime(h.changedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {editingProduct
                  ? `تعديل الصنف: ${editingProduct.name}`
                  : 'إضافة صنف جديد'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editingProduct && usedInHistory && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  هذا الصنف مستخدم في عمليات جرد أو فواتير سابقة. تعديل السعر أو
                  الوحدة لن يغير أي عملية قديمة، وسيُطبّق على العمليات الجديدة
                  فقط.
                </span>
              </div>
            )}

            <form onSubmit={(e) => void handleSubmitForm(e)} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  اسم الصنف <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: أرز أو عدس..."
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 sm:grid-cols-2 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div>
                  <label className="block text-xs font-bold text-blue-900 dark:text-blue-300">
                    وحدة الجرد <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={invUnitId}
                    onChange={(e) => setInvUnitId(e.target.value)}
                    className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {units
                      .filter((u) => u.isActive || u.id === invUnitId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-900 dark:text-blue-300">
                    سعر الجرد (ج.م) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={invPrice}
                    onChange={(e) => setInvPrice(e.target.value)}
                    placeholder="0.00"
                    className="font-num mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3.5 sm:grid-cols-2 dark:border-teal-900/50 dark:bg-teal-950/20">
                <div>
                  <label className="block text-xs font-bold text-teal-900 dark:text-teal-300">
                    وحدة الاستعاضة <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={purUnitId}
                    onChange={(e) => setPurUnitId(e.target.value)}
                    className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {units
                      .filter((u) => u.isActive || u.id === purUnitId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-teal-900 dark:text-teal-300">
                    سعر الاستعاضة (ج.م) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={purPrice}
                    onChange={(e) => setPurPrice(e.target.value)}
                    placeholder="0.00"
                    className="font-num mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={allowFractional}
                  onChange={(e) => setAllowFractional(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-blue-600"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  السماح بإدخال كسور عشرية في الكميات لهذا الصنف
                </span>
              </label>

              {formError && (
                <p className="text-xs font-bold text-red-600 dark:text-red-400">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] rounded-xl border border-slate-300 px-5 py-2 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-3d min-h-[44px] rounded-xl bg-blue-600 px-6 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_0_#1e40af] hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'جارٍ الحفظ...' : 'حفظ الصنف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate Name Confirmation */}
      <ConfirmDialog
        open={duplicateConfirmOpen}
        title="تنبيه: اسم صنف مشابه موجود"
        variant="warning"
        busy={saving}
        description={`يوجد بالفعل صنف مسجل باسم "${name.trim()}". هل أنت متأكد أنك تقصد صنفاً مختلفاً وتريد الحفظ؟`}
        confirmLabel="نعم، تأكيد الحفظ"
        cancelLabel="تعديل الاسم"
        onCancel={() => setDuplicateConfirmOpen(false)}
        onConfirm={() => {
          const v = validateForm();
          if (v) void persistProduct(v);
        }}
      />

      {/* Price Edit Historical Impact Warning */}
      <ConfirmDialog
        open={priceEditWarningOpen}
        title="تأكيد تعديل سعر صنف مستخدم سابقاً"
        variant="warning"
        busy={saving}
        description="هذا الصنف مسجل في عمليات جرد أو فواتير سابقة. ستبقى جميع العمليات القديمة بأسعارها الأصلية دون تغيير، وسيُسجّل السعر الجديد في سجل تغييرات الأسعار للعمليات القادمة."
        confirmLabel="تأكيد وحفظ السعر الجديد"
        cancelLabel="تراجع"
        onCancel={() => setPriceEditWarningOpen(false)}
        onConfirm={() => {
          const v = validateForm();
          if (v) void persistProduct(v);
        }}
      />
    </div>
  );
};
