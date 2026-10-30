import type { Database } from './database.types'

type T = Database['public']['Tables']
type E = Database['public']['Enums']

export type Vehicle = T['vehicles']['Row']
export type VehicleInsert = T['vehicles']['Insert']
export type VehicleOverview = Database['public']['Views']['vehicle_overview']['Row']
export type DocumentRow = T['documents']['Row']
export type ImageRow = T['vehicle_images']['Row']
export type Accessory = T['accessories']['Row']
export type Expense = T['expenses']['Row']
export type VehicleEvent = T['vehicle_events']['Row']
export type AuditLog = T['audit_logs']['Row']
export type Profile = T['profiles']['Row']
export type Company = T['companies']['Row']

export type VehicleStatus = E['vehicle_status']
export type DocumentType = E['document_type']
export type ImageType = E['image_type']
export type AccessoryType = E['accessory_type']
export type ItemStatus = E['item_status']
export type ExpenseCategory = E['expense_category']
export type AppRole = E['app_role']
