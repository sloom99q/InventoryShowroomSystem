// Enum labels, translated. Reading a key always returns the current language;
// the app remounts on language change so everything re-renders.
import i18n from '@/i18n'
import type { AccessoryType, AppRole, DocumentType, ExpenseCategory, ImageType, ItemStatus, VehicleStatus } from './types'

function translated<K extends string>(keys: readonly K[], prefix: string): Record<K, string> {
  const set = new Set<string>(keys)
  return new Proxy({} as Record<K, string>, {
    get: (_, k) => (typeof k === 'string' && set.has(k) ? i18n.t(`${prefix}.${k}` as never) : undefined),
    ownKeys: () => [...keys],
    getOwnPropertyDescriptor: (_, k) =>
      typeof k === 'string' && set.has(k) ? { enumerable: true, configurable: true, value: i18n.t(`${prefix}.${k}` as never) } : undefined,
  })
}

export const STATUS_ORDER: VehicleStatus[] = ['in_stock', 'in_garage', 'reserved', 'sold', 'delivered']
export const STATUS_LABEL = translated<VehicleStatus>(STATUS_ORDER, 'status')
export const DOCUMENT_LABEL = translated<DocumentType>(['vehicle_pdf', 'registration', 'inspection', 'purchase', 'brochure', 'other'], 'documentType')
export const IMAGE_LABEL = translated<ImageType>(['arrival', 'current', 'garage', 'information_card', 'other'], 'imageType')
export const ACCESSORY_LABEL = translated<AccessoryType>(['physical_key', 'smart_key', 'nfc_card', 'charger', 'other'], 'accessoryType')
export const ITEM_STATUS_LABEL = translated<ItemStatus>(['present', 'missing', 'unknown'], 'itemStatus')
export const EXPENSE_LABEL = translated<ExpenseCategory>(
  ['mechanical', 'electrical', 'bodywork', 'paint', 'tires', 'maintenance', 'transportation', 'accessories', 'other'],
  'expenseCategory',
)
export const ROLE_LABEL = translated<AppRole>(['admin', 'secretary', 'staff', 'viewer'], 'role')
