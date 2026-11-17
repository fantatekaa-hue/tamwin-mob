import Dexie, { type Table } from 'dexie';
import type {
  InsuranceHistory,
  InventoryLine,
  InventorySession,
  PriceHistory,
  Product,
  ReplenishmentInvoice,
  ReplenishmentLine,
  Settings,
  Unit,
} from '../domain/types';

export class TamweenDatabase extends Dexie {
  units!: Table<Unit, string>;
  products!: Table<Product, string>;
  priceHistory!: Table<PriceHistory, string>;
  insuranceHistory!: Table<InsuranceHistory, string>;
  settings!: Table<Settings, string>;
  inventorySessions!: Table<InventorySession, string>;
  inventoryLines!: Table<InventoryLine, string>;
  replenishmentInvoices!: Table<ReplenishmentInvoice, string>;
  replenishmentLines!: Table<ReplenishmentLine, string>;

  constructor() {
    super('TamweenAssistantDB');
    this.version(1).stores({
      units: 'id, name, isActive',
      products: 'id, name, isActive, inventoryUnitId, purchaseUnitId',
      priceHistory: 'id, productId, operationType, changedAt',
      insuranceHistory: 'id, changedAt',
      settings: 'id',
      inventorySessions: 'id, serialNumber, status, sessionDate, createdAt',
      inventoryLines: 'id, inventorySessionId, productId',
      replenishmentInvoices: 'id, serialNumber, inventorySessionId, status, createdAt',
      replenishmentLines: 'id, invoiceId, productId',
    });
  }
}

export const db = new TamweenDatabase();
