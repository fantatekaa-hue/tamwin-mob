export type OperationType = 'inventory' | 'purchase';
export type RecordStatus = 'draft' | 'confirmed' | 'cancelled';
export type ThemeMode = 'light' | 'dark';

export interface Unit {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  isActive: boolean;
  inventoryUnitId: string;
  inventoryPriceInPiastres: number;
  purchaseUnitId: string;
  purchasePriceInPiastres: number;
  allowFractionalQuantity: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistory {
  id: string;
  productId: string;
  productNameSnapshot: string;
  operationType: OperationType;
  oldPriceInPiastres: number;
  newPriceInPiastres: number;
  unitId: string;
  unitNameSnapshot: string;
  changedAt: string;
}

export interface InsuranceHistory {
  id: string;
  oldLimitInPiastres: number;
  newLimitInPiastres: number;
  changedAt: string;
}

export interface Settings {
  id: 'main';
  insuranceLimitInPiastres: number;
  ownerName: string;
  appName: string;
  requireSugarOilExactMatch: boolean;
  theme: ThemeMode;
  lastBackupAt?: string;
  updatedAt: string;
}

export interface InventorySession {
  id: string;
  serialNumber: string;
  createdAt: string;
  updatedAt: string;
  sessionDate: string;
  status: RecordStatus;
  insuranceLimitSnapshotInPiastres: number;
  totalInventoryValueInPiastres: number;
  replenishmentRequiredInPiastres: number;
  surplusOverInsuranceInPiastres: number;
  notes: string;
  cancellationReason?: string;
}

export interface InventoryLine {
  id: string;
  inventorySessionId: string;
  productId: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  unitPriceSnapshotInPiastres: number;
  quantity: number;
  lineTotalInPiastres: number;
}

export interface ReplenishmentInvoice {
  id: string;
  serialNumber: string;
  inventorySessionId: string;
  inventorySerialSnapshot: string;
  inventoryDateSnapshot: string;
  createdAt: string;
  updatedAt: string;
  status: RecordStatus;
  requiredAmountSnapshotInPiastres: number;
  invoiceTotalInPiastres: number;
  remainingAmountInPiastres: number;
  overageAmountInPiastres: number;
  usagePercent: number;
  shortfallPercent: number;
  sugarShortfallSnapshot: number;
  oilShortfallSnapshot: number;
  notes: string;
  cancellationReason?: string;
}

export interface ReplenishmentLine {
  id: string;
  invoiceId: string;
  productId: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  unitPriceSnapshotInPiastres: number;
  quantity: number;
  lineTotalInPiastres: number;
}

export interface BackupDataTables {
  units: Unit[];
  products: Product[];
  priceHistory: PriceHistory[];
  insuranceHistory: InsuranceHistory[];
  settings: Settings[];
  inventorySessions: InventorySession[];
  inventoryLines: InventoryLine[];
  replenishmentInvoices: ReplenishmentInvoice[];
  replenishmentLines: ReplenishmentLine[];
}

export interface BackupPayload {
  schemaVersion: 1;
  appName: string;
  ownerName: string;
  exportedAt: string;
  deviceLabel: string;
  data: BackupDataTables;
}
