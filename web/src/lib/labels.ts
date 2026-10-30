// Every user-facing enum label lives here, so an Arabic translation only
// needs this file plus page copy.
import type { AccessoryType, AppRole, DocumentType, ExpenseCategory, ImageType, ItemStatus, VehicleStatus } from './types'

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  in_stock: 'In stock',
  in_garage: 'In garage',
  reserved: 'Reserved',
  sold: 'Sold',
  delivered: 'Delivered',
}
export const STATUS_ORDER: VehicleStatus[] = ['in_stock', 'in_garage', 'reserved', 'sold', 'delivered']

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  vehicle_pdf: 'Vehicle PDF',
  registration: 'Registration',
  inspection: 'Inspection',
  purchase: 'Purchase',
  other: 'Other',
}

export const IMAGE_LABEL: Record<ImageType, string> = {
  arrival: 'Arrival',
  current: 'Current',
  garage: 'Garage',
  information_card: 'Information card',
  other: 'Other',
}

export const ACCESSORY_LABEL: Record<AccessoryType, string> = {
  physical_key: 'Physical key',
  smart_key: 'Smart key',
  nfc_card: 'NFC card',
  charger: 'Charger',
  other: 'Other',
}

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  present: 'Present',
  missing: 'Missing',
  unknown: 'Unknown',
}

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  bodywork: 'Bodywork',
  paint: 'Paint',
  tires: 'Tires',
  maintenance: 'Maintenance',
  transportation: 'Transportation',
  accessories: 'Accessories',
  other: 'Other',
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  secretary: 'Secretary',
  staff: 'Staff / technician',
  viewer: 'Read-only',
}
