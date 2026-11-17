import { DEFAULT_INSURANCE_LIMIT_PIASTRES } from './calculations';
import type { Product, Settings, Unit } from './types';

export const APP_NAME = 'مساعد استعاضة التموين';
export const OWNER_NAME = 'أحمد حسب الله';
export const APP_VERSION = '1.0.0';

const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const INITIAL_UNITS: Unit[] = [
  { id: 'unit_kilo', name: 'كيلو', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_bottle', name: 'زجاجة', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_bag', name: 'كيس', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_pack', name: 'باكو', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_piece', name: 'قطعة', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_bundle', name: 'طرد', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_carton', name: 'كرتونة', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_box', name: 'علبة', isActive: true, createdAt: SEED_TIMESTAMP },
  { id: 'unit_packet', name: 'باكيت', isActive: true, createdAt: SEED_TIMESTAMP },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod_sugar',
    name: 'سكر',
    isActive: true,
    inventoryUnitId: 'unit_kilo',
    inventoryPriceInPiastres: 1235, // 12.35 جنيه
    purchaseUnitId: 'unit_kilo',
    purchasePriceInPiastres: 1235, // 12.35 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'prod_oil',
    name: 'زيت',
    isActive: true,
    inventoryUnitId: 'unit_bottle',
    inventoryPriceInPiastres: 2975, // 29.75 جنيه
    purchaseUnitId: 'unit_bottle',
    purchasePriceInPiastres: 2975, // 29.75 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'prod_pasta',
    name: 'مكرونة',
    isActive: true,
    inventoryUnitId: 'unit_bag',
    inventoryPriceInPiastres: 885, // 8.85 جنيه
    purchaseUnitId: 'unit_bundle',
    purchasePriceInPiastres: 17700, // 177.00 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'prod_tea',
    name: 'شاي',
    isActive: true,
    inventoryUnitId: 'unit_pack',
    inventoryPriceInPiastres: 490, // 4.90 جنيه
    purchaseUnitId: 'unit_kilo',
    purchasePriceInPiastres: 11760, // 117.60 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'prod_cheese_250',
    name: 'جبنة 250 جرام',
    isActive: true,
    inventoryUnitId: 'unit_piece',
    inventoryPriceInPiastres: 1375, // 13.75 جنيه
    purchaseUnitId: 'unit_carton',
    purchasePriceInPiastres: 37125, // 371.25 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'prod_cheese_125',
    name: 'جبنة 125 جرام',
    isActive: true,
    inventoryUnitId: 'unit_piece',
    inventoryPriceInPiastres: 675, // 6.75 جنيه
    purchaseUnitId: 'unit_carton',
    purchasePriceInPiastres: 27000, // 270.00 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'prod_soap',
    name: 'صابون وش',
    isActive: true,
    inventoryUnitId: 'unit_piece',
    inventoryPriceInPiastres: 725, // 7.25 جنيه
    purchaseUnitId: 'unit_carton',
    purchasePriceInPiastres: 34800, // 348.00 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'prod_pril',
    name: 'سائل بريل',
    isActive: true,
    inventoryUnitId: 'unit_bag',
    inventoryPriceInPiastres: 280, // 2.80 جنيه
    purchaseUnitId: 'unit_carton',
    purchasePriceInPiastres: 11200, // 112.00 جنيه
    allowFractionalQuantity: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

export const INITIAL_SETTINGS: Settings = {
  id: 'main',
  insuranceLimitInPiastres: DEFAULT_INSURANCE_LIMIT_PIASTRES,
  ownerName: OWNER_NAME,
  appName: APP_NAME,
  requireSugarOilExactMatch: false,
  theme: 'light',
  updatedAt: SEED_TIMESTAMP,
};
