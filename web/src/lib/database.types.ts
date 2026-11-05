
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "accessories": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"item_name": string,"item_type": Database["public"]['Enums']["accessory_type"],"notes": string | null,"quantity": number | null,"status": Database["public"]['Enums']["item_status"],"updated_at": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"item_name": string,"item_type": Database["public"]['Enums']["accessory_type"],"notes"?: string | null,"quantity"?: number | null,"status"?: Database["public"]['Enums']["item_status"],"updated_at"?: string,"vehicle_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"item_name"?: string,"item_type"?: Database["public"]['Enums']["accessory_type"],"notes"?: string | null,"quantity"?: number | null,"status"?: Database["public"]['Enums']["item_status"],"updated_at"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accessories_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "accessories_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"company_id": string,"created_at": string,"entity_id": string,"entity_type": string,"id": number,"new_values": Json | null,"previous_values": Json | null,"user_id": string | null,"vehicle_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"company_id": string,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: never,"new_values"?: Json | null,"previous_values"?: Json | null,"user_id"?: string | null,"vehicle_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"company_id"?: string,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: never,"new_values"?: Json | null,"previous_values"?: Json | null,"user_id"?: string | null,"vehicle_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"companies": {
                  Row: {
                    "accent_color": string,"created_at": string,"currency": string,"default_locale": string,"disclaimer": string | null,"doc_banner_left_path": string | null,"doc_banner_path": string | null,"doc_banner_text_path": string | null,"doc_watermark_path": string | null,"id": string,"known_brands": (string)[],"legal_name": string | null,"logo_dark_path": string | null,"logo_path": string | null,"name": string,"sidebar_color": string,"signature_line": string,"theme_mode": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"disclaimer"?: string | null,"doc_banner_left_path"?: string | null,"doc_banner_path"?: string | null,"doc_banner_text_path"?: string | null,"doc_watermark_path"?: string | null,"id"?: string,"known_brands"?: (string)[],"legal_name"?: string | null,"logo_dark_path"?: string | null,"logo_path"?: string | null,"name": string,"sidebar_color"?: string,"signature_line"?: string,"theme_mode"?: string,"timezone"?: string
                  }
                  Update: {
                    "accent_color"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"disclaimer"?: string | null,"doc_banner_left_path"?: string | null,"doc_banner_path"?: string | null,"doc_banner_text_path"?: string | null,"doc_watermark_path"?: string | null,"id"?: string,"known_brands"?: (string)[],"legal_name"?: string | null,"logo_dark_path"?: string | null,"logo_path"?: string | null,"name"?: string,"sidebar_color"?: string,"signature_line"?: string,"theme_mode"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customers": {
                  Row: {
                    "company_id": string,"created_at": string,"email": string | null,"emirate": string | null,"full_name": string,"id": string,"id_number": string | null,"language": string,"notes": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"email"?: string | null,"emirate"?: string | null,"full_name": string,"id"?: string,"id_number"?: string | null,"language"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"email"?: string | null,"emirate"?: string | null,"full_name"?: string,"id"?: string,"id_number"?: string | null,"language"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"document_jobs": {
                  Row: {
                    "company_id": string,"completed_at": string | null,"corrections": Json | null,"created_at": string,"created_by": string | null,"document_id": string | null,"extracted_data": Json | null,"id": string,"method": string | null,"processing_error": string | null,"status": Database["public"]['Enums']["job_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"completed_at"?: string | null,"corrections"?: Json | null,"created_at"?: string,"created_by"?: string | null,"document_id"?: string | null,"extracted_data"?: Json | null,"id"?: string,"method"?: string | null,"processing_error"?: string | null,"status"?: Database["public"]['Enums']["job_status"]
                  }
                  Update: {
                    "company_id"?: string,"completed_at"?: string | null,"corrections"?: Json | null,"created_at"?: string,"created_by"?: string | null,"document_id"?: string | null,"extracted_data"?: Json | null,"id"?: string,"method"?: string | null,"processing_error"?: string | null,"status"?: Database["public"]['Enums']["job_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "document_jobs_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "company_id": string,"deleted_at": string | null,"document_type": Database["public"]['Enums']["document_type"],"extracted_text": string | null,"file_size": number,"group_id": string,"id": string,"mime_type": string,"notes": string | null,"original_filename": string,"storage_path": string,"superseded_at": string | null,"uploaded_at": string,"uploaded_by": string | null,"vehicle_id": string,"verification_status": Database["public"]['Enums']["verification_status"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"deleted_at"?: string | null,"document_type"?: Database["public"]['Enums']["document_type"],"extracted_text"?: string | null,"file_size": number,"group_id"?: string,"id"?: string,"mime_type": string,"notes"?: string | null,"original_filename": string,"storage_path": string,"superseded_at"?: string | null,"uploaded_at"?: string,"uploaded_by"?: string | null,"vehicle_id": string,"verification_status"?: Database["public"]['Enums']["verification_status"],"version"?: number
                  }
                  Update: {
                    "company_id"?: string,"deleted_at"?: string | null,"document_type"?: Database["public"]['Enums']["document_type"],"extracted_text"?: string | null,"file_size"?: number,"group_id"?: string,"id"?: string,"mime_type"?: string,"notes"?: string | null,"original_filename"?: string,"storage_path"?: string,"superseded_at"?: string | null,"uploaded_at"?: string,"uploaded_by"?: string | null,"vehicle_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "documents_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"category": Database["public"]['Enums']["expense_category"],"company_id": string,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"description": string | null,"expense_date": string,"id": string,"receipt_storage_path": string | null,"supplier_name": string | null,"title": string,"updated_at": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category"?: Database["public"]['Enums']["expense_category"],"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"description"?: string | null,"expense_date"?: string,"id"?: string,"receipt_storage_path"?: string | null,"supplier_name"?: string | null,"title": string,"updated_at"?: string,"vehicle_id": string
                  }
                  Update: {
                    "amount"?: number,"category"?: Database["public"]['Enums']["expense_category"],"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"description"?: string | null,"expense_date"?: string,"id"?: string,"receipt_storage_path"?: string | null,"supplier_name"?: string | null,"title"?: string,"updated_at"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "expenses_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"message_log": {
                  Row: {
                    "company_id": string,"customer_id": string | null,"id": string,"kind": string,"opened_at": string,"opened_by": string | null,"phone": string | null,"text": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"customer_id"?: string | null,"id"?: string,"kind": string,"opened_at"?: string,"opened_by"?: string | null,"phone"?: string | null,"text": string,"vehicle_id": string
                  }
                  Update: {
                    "company_id"?: string,"customer_id"?: string | null,"id"?: string,"kind"?: string,"opened_at"?: string,"opened_by"?: string | null,"phone"?: string | null,"text"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_log_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_log_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "message_log_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"offer_catalogue": {
                  Row: {
                    "company_id": string,"created_at": string,"default_price": number | null,"icon": string,"id": string,"name": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"default_price"?: number | null,"icon"?: string,"id"?: string,"name": string,"position"?: number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"default_price"?: number | null,"icon"?: string,"id"?: string,"name"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "offer_catalogue_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "catalogue_id": string | null,"company_id": string,"created_by": string | null,"decided_at": string | null,"icon": string,"id": string,"name": string,"offered_at": string,"price": number | null,"status": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "catalogue_id"?: string | null,"company_id"?: string,"created_by"?: string | null,"decided_at"?: string | null,"icon"?: string,"id"?: string,"name": string,"offered_at"?: string,"price"?: number | null,"status"?: string,"vehicle_id": string
                  }
                  Update: {
                    "catalogue_id"?: string | null,"company_id"?: string,"created_by"?: string | null,"decided_at"?: string | null,"icon"?: string,"id"?: string,"name"?: string,"offered_at"?: string,"price"?: number | null,"status"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_catalogue_id_fkey"
      columns: ["catalogue_id"]
isOneToOne: false
      referencedRelation: "offer_catalogue"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "offers_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"part_requests": {
                  Row: {
                    "arrived_at": string | null,"cancelled_at": string | null,"company_id": string,"cost": number | null,"fitted_at": string | null,"id": string,"name": string,"ordered_at": string | null,"part_no": string | null,"qty": number,"requested_at": string,"requested_by": string | null,"service_visit_id": string | null,"status": string,"supplier": string | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arrived_at"?: string | null,"cancelled_at"?: string | null,"company_id"?: string,"cost"?: number | null,"fitted_at"?: string | null,"id"?: string,"name": string,"ordered_at"?: string | null,"part_no"?: string | null,"qty"?: number,"requested_at"?: string,"requested_by"?: string | null,"service_visit_id"?: string | null,"status"?: string,"supplier"?: string | null,"vehicle_id": string
                  }
                  Update: {
                    "arrived_at"?: string | null,"cancelled_at"?: string | null,"company_id"?: string,"cost"?: number | null,"fitted_at"?: string | null,"id"?: string,"name"?: string,"ordered_at"?: string | null,"part_no"?: string | null,"qty"?: number,"requested_at"?: string,"requested_by"?: string | null,"service_visit_id"?: string | null,"status"?: string,"supplier"?: string | null,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "part_requests_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_requests_service_visit_id_fkey"
      columns: ["service_visit_id"]
isOneToOne: false
      referencedRelation: "service_visits"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_requests_service_visit_id_fkey"
      columns: ["service_visit_id"]
isOneToOne: false
      referencedRelation: "service_visits_tech"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_requests_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "part_requests_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"company_id": string,"created_at": string,"full_name": string,"id": string,"locale": string | null,"role": Database["public"]['Enums']["app_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"company_id": string,"created_at"?: string,"full_name"?: string,"id": string,"locale"?: string | null,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "active"?: boolean,"company_id"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"locale"?: string | null,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"service_plans": {
                  Row: {
                    "brand": string | null,"company_id": string,"created_at": string,"id": string,"km": number,"months": number
                  }
                  ComputedFields: never
                  Insert: {
                    "brand"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"km": number,"months": number
                  }
                  Update: {
                    "brand"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"km"?: number,"months"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_plans_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"service_visits": {
                  Row: {
                    "company_id": string,"cost": number,"created_at": string,"created_by": string | null,"id": string,"notes": string | null,"odometer_km": number | null,"technician_id": string | null,"title": string,"vehicle_id": string,"visit_date": string,"work_done": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"cost"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"odometer_km"?: number | null,"technician_id"?: string | null,"title"?: string,"vehicle_id": string,"visit_date"?: string,"work_done"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"cost"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"odometer_km"?: number | null,"technician_id"?: string | null,"title"?: string,"vehicle_id"?: string,"visit_date"?: string,"work_done"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_visits_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_visits_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "service_visits_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"stages": {
                  Row: {
                    "color": string,"company_id": string,"created_at": string,"id": string,"name_ar": string | null,"name_en": string,"position": number,"status": Database["public"]['Enums']["vehicle_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"name_ar"?: string | null,"name_en": string,"position": number,"status"?: Database["public"]['Enums']["vehicle_status"]
                  }
                  Update: {
                    "color"?: string,"company_id"?: string,"created_at"?: string,"id"?: string,"name_ar"?: string | null,"name_en"?: string,"position"?: number,"status"?: Database["public"]['Enums']["vehicle_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "stages_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"vehicle_events": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"event_at": string,"event_type": string,"from_status": Database["public"]['Enums']["vehicle_status"] | null,"id": string,"stage_id": string | null,"stage_name": string | null,"to_status": Database["public"]['Enums']["vehicle_status"] | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"event_at"?: string,"event_type": string,"from_status"?: Database["public"]['Enums']["vehicle_status"] | null,"id"?: string,"stage_id"?: string | null,"stage_name"?: string | null,"to_status"?: Database["public"]['Enums']["vehicle_status"] | null,"vehicle_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"event_at"?: string,"event_type"?: string,"from_status"?: Database["public"]['Enums']["vehicle_status"] | null,"id"?: string,"stage_id"?: string | null,"stage_name"?: string | null,"to_status"?: Database["public"]['Enums']["vehicle_status"] | null,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicle_events_stage_id_fkey"
      columns: ["stage_id"]
isOneToOne: false
      referencedRelation: "stages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicle_events_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "vehicle_events_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"vehicle_images": {
                  Row: {
                    "caption": string | null,"captured_at": string | null,"company_id": string,"deleted_at": string | null,"file_size": number,"id": string,"image_type": Database["public"]['Enums']["image_type"],"is_cover": boolean,"mime_type": string,"original_filename": string,"sort_order": number | null,"storage_path": string,"superseded_at": string | null,"thumbnail_path": string | null,"uploaded_at": string,"uploaded_by": string | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"captured_at"?: string | null,"company_id"?: string,"deleted_at"?: string | null,"file_size": number,"id"?: string,"image_type": Database["public"]['Enums']["image_type"],"is_cover"?: boolean,"mime_type": string,"original_filename": string,"sort_order"?: number | null,"storage_path": string,"superseded_at"?: string | null,"thumbnail_path"?: string | null,"uploaded_at"?: string,"uploaded_by"?: string | null,"vehicle_id": string
                  }
                  Update: {
                    "caption"?: string | null,"captured_at"?: string | null,"company_id"?: string,"deleted_at"?: string | null,"file_size"?: number,"id"?: string,"image_type"?: Database["public"]['Enums']["image_type"],"is_cover"?: boolean,"mime_type"?: string,"original_filename"?: string,"sort_order"?: number | null,"storage_path"?: string,"superseded_at"?: string | null,"thumbnail_path"?: string | null,"uploaded_at"?: string,"uploaded_by"?: string | null,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicle_images_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "vehicle_images_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"vehicle_owners": {
                  Row: {
                    "company_id": string,"created_at": string,"customer_id": string,"from_date": string,"id": string,"sold_by": string | null,"to_date": string | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"customer_id": string,"from_date"?: string,"id"?: string,"sold_by"?: string | null,"to_date"?: string | null,"vehicle_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"customer_id"?: string,"from_date"?: string,"id"?: string,"sold_by"?: string | null,"to_date"?: string | null,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicle_owners_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicle_owners_customer_id_company_id_fkey"
      columns: ["customer_id","company_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "vehicle_owners_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "vehicle_owners_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"vehicle_specs": {
                  Row: {
                    "company_id": string,"created_at": string,"field_key": string | null,"id": string,"label": string,"label_alt": string | null,"position": number | null,"section": string | null,"sort_order": number,"source_document_id": string | null,"source_page": number | null,"unit": string | null,"updated_at": string,"value_ar": string | null,"value_en": string | null,"vehicle_id": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"field_key"?: string | null,"id"?: string,"label": string,"label_alt"?: string | null,"position"?: number | null,"section"?: string | null,"sort_order"?: number,"source_document_id"?: string | null,"source_page"?: number | null,"unit"?: string | null,"updated_at"?: string,"value_ar"?: string | null,"value_en"?: string | null,"vehicle_id": string,"verified"?: boolean
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"field_key"?: string | null,"id"?: string,"label"?: string,"label_alt"?: string | null,"position"?: number | null,"section"?: string | null,"sort_order"?: number,"source_document_id"?: string | null,"source_page"?: number | null,"unit"?: string | null,"updated_at"?: string,"value_ar"?: string | null,"value_en"?: string | null,"vehicle_id"?: string,"verified"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicle_specs_source_document_id_fkey"
      columns: ["source_document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicle_specs_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "vehicle_specs_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "acquisition_price": number | null,"archived_at": string | null,"arrival_at": string | null,"brand": string | null,"chassis_normalized": string | null,"chassis_number": string,"chassis_verified": boolean,"company_id": string,"created_at": string,"created_by": string | null,"delivered_at": string | null,"doc_settings": NonNullable<Json>,"exterior_color": string | null,"handover_checked_at": string | null,"handover_checked_by": string | null,"id": string,"interior_color": string | null,"labels": (string)[],"listing_price": number | null,"location": string | null,"mileage_km": number | null,"model": string | null,"notes": string | null,"sale_price": number | null,"sold_at": string | null,"stage_id": string | null,"status": Database["public"]['Enums']["vehicle_status"],"trim_level": string | null,"updated_at": string,"year": number | null,"handover_date": string | null
                  }
                  ComputedFields: "handover_date"
                  Insert: {
                    "acquisition_price"?: number | null,"archived_at"?: string | null,"arrival_at"?: string | null,"brand"?: string | null,"chassis_normalized"?: never,"chassis_number": string,"chassis_verified"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"doc_settings"?: NonNullable<Json>,"exterior_color"?: string | null,"handover_checked_at"?: string | null,"handover_checked_by"?: string | null,"id"?: string,"interior_color"?: string | null,"labels"?: (string)[],"listing_price"?: number | null,"location"?: string | null,"mileage_km"?: number | null,"model"?: string | null,"notes"?: string | null,"sale_price"?: number | null,"sold_at"?: string | null,"stage_id"?: string | null,"status"?: Database["public"]['Enums']["vehicle_status"],"trim_level"?: string | null,"updated_at"?: string,"year"?: number | null
                  }
                  Update: {
                    "acquisition_price"?: number | null,"archived_at"?: string | null,"arrival_at"?: string | null,"brand"?: string | null,"chassis_normalized"?: never,"chassis_number"?: string,"chassis_verified"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"doc_settings"?: NonNullable<Json>,"exterior_color"?: string | null,"handover_checked_at"?: string | null,"handover_checked_by"?: string | null,"id"?: string,"interior_color"?: string | null,"labels"?: (string)[],"listing_price"?: number | null,"location"?: string | null,"mileage_km"?: number | null,"model"?: string | null,"notes"?: string | null,"sale_price"?: number | null,"sold_at"?: string | null,"stage_id"?: string | null,"status"?: Database["public"]['Enums']["vehicle_status"],"trim_level"?: string | null,"updated_at"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_stage_fk"
      columns: ["stage_id","company_id"]
isOneToOne: false
      referencedRelation: "stages"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"warranties": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"kind": string,"km": number | null,"start_date": string,"terms": string | null,"vehicle_id": string,"years": number,"warranty_end": string | null
                  }
                  ComputedFields: "warranty_end"
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"kind": string,"km"?: number | null,"start_date": string,"terms"?: string | null,"vehicle_id": string,"years": number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"km"?: number | null,"start_date"?: string,"terms"?: string | null,"vehicle_id"?: string,"years"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "warranties_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "warranties_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "warranties_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"warranty_defaults": {
                  Row: {
                    "brand": string | null,"company_id": string,"created_at": string,"id": string,"kind": string,"km": number | null,"terms": string | null,"years": number
                  }
                  ComputedFields: never
                  Insert: {
                    "brand"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"kind": string,"km"?: number | null,"terms"?: string | null,"years": number
                  }
                  Update: {
                    "brand"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"km"?: number | null,"terms"?: string | null,"years"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "warranty_defaults_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "owner_names": {
                  Row: {
                    "full_name": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"part_requests_tech": {
                  Row: {
                    "arrived_at": string | null,"cancelled_at": string | null,"company_id": string,"fitted_at": string | null,"id": string,"name": string,"ordered_at": string | null,"part_no": string | null,"qty": number,"requested_at": string,"requested_by": string | null,"service_visit_id": string | null,"status": string,"supplier": string | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "arrived_at"?: string | null,"cancelled_at"?: string | null,"company_id"?: string | null,"fitted_at"?: string | null,"id"?: string | null,"name"?: string | null,"ordered_at"?: string | null,"part_no"?: string | null,"qty"?: number | null,"requested_at"?: string | null,"requested_by"?: string | null,"service_visit_id"?: string | null,"status"?: string | null,"supplier"?: string | null,"vehicle_id"?: string | null
                         }
                        Update: {
                           "arrived_at"?: string | null,"cancelled_at"?: string | null,"company_id"?: string | null,"fitted_at"?: string | null,"id"?: string | null,"name"?: string | null,"ordered_at"?: string | null,"part_no"?: string | null,"qty"?: number | null,"requested_at"?: string | null,"requested_by"?: string | null,"service_visit_id"?: string | null,"status"?: string | null,"supplier"?: string | null,"vehicle_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "part_requests_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_requests_service_visit_id_fkey"
      columns: ["service_visit_id"]
isOneToOne: false
      referencedRelation: "service_visits"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_requests_service_visit_id_fkey"
      columns: ["service_visit_id"]
isOneToOne: false
      referencedRelation: "service_visits_tech"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "part_requests_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "part_requests_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"service_visits_tech": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"notes": string | null,"odometer_km": number | null,"technician_id": string | null,"title": string,"vehicle_id": string,"visit_date": string,"work_done": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "company_id"?: string | null,"created_at"?: string | null,"id"?: string | null,"notes"?: string | null,"odometer_km"?: number | null,"technician_id"?: string | null,"title"?: string | null,"vehicle_id"?: string | null,"visit_date"?: string | null,"work_done"?: string | null
                         }
                        Update: {
                           "company_id"?: string | null,"created_at"?: string | null,"id"?: string | null,"notes"?: string | null,"odometer_km"?: number | null,"technician_id"?: string | null,"title"?: string | null,"vehicle_id"?: string | null,"visit_date"?: string | null,"work_done"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "service_visits_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_visits_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicle_overview"
      referencedColumns: ["id","company_id"]
    },{
      foreignKeyName: "service_visits_vehicle_id_company_id_fkey"
      columns: ["vehicle_id","company_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","company_id"]
    }
                  ]
                },"vehicle_overview": {
                  Row: {
                    "accessory_count": number | null,"acquisition_price": number | null,"archived_at": string | null,"arrival_at": string | null,"brand": string | null,"chassis_normalized": string | null,"chassis_number": string,"chassis_verified": boolean,"company_id": string,"cover_thumbnail_path": string | null,"created_at": string,"created_by": string | null,"delivered_at": string | null,"doc_settings": NonNullable<Json>,"document_count": number | null,"expense_total": number | null,"exterior_color": string | null,"handover_checked_at": string | null,"handover_checked_by": string | null,"id": string,"interior_color": string | null,"labels": (string)[],"listing_price": number | null,"location": string | null,"mileage_km": number | null,"missing_accessories": number | null,"missing_names": (string)[] | null,"model": string | null,"notes": string | null,"photo_count": number | null,"sale_price": number | null,"sold_at": string | null,"stage_color": string | null,"stage_id": string | null,"stage_name": string | null,"stage_name_ar": string | null,"stage_position": number | null,"status": Database["public"]['Enums']["vehicle_status"],"trim_level": string | null,"unknown_accessories": number | null,"updated_at": string,"year": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "vehicles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_stage_fk"
      columns: ["stage_id","company_id"]
isOneToOne: false
      referencedRelation: "stages"
      referencedColumns: ["id","company_id"]
    }
                  ]
                }
          }
          Functions: {
            "add_document_version":
{ Args: { "p_file_size": number,"p_mime_type": string,"p_notes"?: string,"p_original_filename": string,"p_previous_id": string,"p_storage_path": string }; Returns: {
              "company_id": string,
"deleted_at": string | null,
"document_type": Database["public"]['Enums']["document_type"],
"extracted_text": string | null,
"file_size": number,
"group_id": string,
"id": string,
"mime_type": string,
"notes": string | null,
"original_filename": string,
"storage_path": string,
"superseded_at": string | null,
"uploaded_at": string,
"uploaded_by": string | null,
"vehicle_id": string,
"verification_status": Database["public"]['Enums']["verification_status"],
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "documents"
        isOneToOne: true
        isSetofReturn: false
      } },
"aftersales_reminders":
{ Args: Record<PropertyKey, never>; Returns: {
              "days": number,"due_date": string,"kind": string,"part_id": string,"part_name": string,"status": string,"vehicle_id": string,"warranty_kind": string
            }[]
                           },
"archive_vehicle":
{ Args: { "p_archive": boolean,"p_note"?: string,"p_vehicle_id": string }; Returns: undefined
                           },
"can_see_customers":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_service":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_write":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"change_vehicle_status":
{ Args: { "p_event_at"?: string,"p_note"?: string,"p_status": Database["public"]['Enums']["vehicle_status"],"p_vehicle_id": string }; Returns: {
              "acquisition_price": number | null,
"archived_at": string | null,
"arrival_at": string | null,
"brand": string | null,
"chassis_normalized": string | null,
"chassis_number": string,
"chassis_verified": boolean,
"company_id": string,
"created_at": string,
"created_by": string | null,
"delivered_at": string | null,
"doc_settings": NonNullable<Json>,
"exterior_color": string | null,
"handover_checked_at": string | null,
"handover_checked_by": string | null,
"id": string,
"interior_color": string | null,
"labels": (string)[],
"listing_price": number | null,
"location": string | null,
"mileage_km": number | null,
"model": string | null,
"notes": string | null,
"sale_price": number | null,
"sold_at": string | null,
"stage_id": string | null,
"status": Database["public"]['Enums']["vehicle_status"],
"trim_level": string | null,
"updated_at": string,
"year": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "vehicles"
        isOneToOne: true
        isSetofReturn: false
      } },
"check_handover":
{ Args: { "p_vehicle_id": string }; Returns: undefined
                           },
"current_app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"current_company_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dashboard_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"delete_vehicle_permanently":
{ Args: { "p_confirm": string,"p_vehicle_id": string }; Returns: (string)[]
                           },
"handover_date":
{ Args: { "v": Omit<Database["public"]['Tables']["vehicles"]['Row'], Database["public"]['Tables']["vehicles"]['ComputedFields']> }; Returns: string
                           },
"import_vehicles":
{ Args: { "p_rows": Json }; Returns: number
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_aftersales_manager":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_service_visit":
{ Args: { "p_cost"?: number,"p_notes"?: string,"p_odometer_km": number,"p_title": string,"p_vehicle_id": string,"p_visit_date": string,"p_work_done"?: string }; Returns: string
                           },
"move_vehicle_stage":
{ Args: { "p_event_at"?: string,"p_note"?: string,"p_stage_id": string,"p_vehicle_id": string }; Returns: {
              "acquisition_price": number | null,
"archived_at": string | null,
"arrival_at": string | null,
"brand": string | null,
"chassis_normalized": string | null,
"chassis_number": string,
"chassis_verified": boolean,
"company_id": string,
"created_at": string,
"created_by": string | null,
"delivered_at": string | null,
"doc_settings": NonNullable<Json>,
"exterior_color": string | null,
"handover_checked_at": string | null,
"handover_checked_by": string | null,
"id": string,
"interior_color": string | null,
"labels": (string)[],
"listing_price": number | null,
"location": string | null,
"mileage_km": number | null,
"model": string | null,
"notes": string | null,
"sale_price": number | null,
"sold_at": string | null,
"stage_id": string | null,
"status": Database["public"]['Enums']["vehicle_status"],
"trim_level": string | null,
"updated_at": string,
"year": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "vehicles"
        isOneToOne: true
        isSetofReturn: false
      } },
"next_service":
{ Args: { "p_vehicle_id": string }; Returns: {
              "base_date": string,"days_left": number,"due_date": string,"due_km": number,"last_km": number,"plan_km": number,"plan_months": number,"status": string
            }[]
                           },
"norm_label":
{ Args: { "t": string }; Returns: string
                           },
"normalize_chassis":
{ Args: { "raw": string }; Returns: string
                           },
"reorder_images":
{ Args: { "p_ids": (string)[],"p_vehicle_id": string }; Returns: undefined
                           },
"request_part":
{ Args: { "p_cost"?: number,"p_name": string,"p_part_no"?: string,"p_qty"?: number,"p_service_visit_id"?: string,"p_supplier"?: string,"p_vehicle_id": string }; Returns: string
                           },
"save_vehicle_import":
{ Args: { "p_documents"?: Json,"p_fields": Json,"p_images"?: Json,"p_specs"?: Json,"p_vehicle_id": string }; Returns: string
                           },
"seed_aftersales_defaults":
{ Args: { "p_company": string }; Returns: undefined
                           },
"seed_default_stages":
{ Args: { "p_company": string }; Returns: undefined
                           },
"set_cover_image":
{ Args: { "p_image_id": string }; Returns: undefined
                           },
"set_information_card":
{ Args: { "p_file_size": number,"p_mime_type": string,"p_original_filename": string,"p_storage_path": string,"p_thumbnail_path"?: string,"p_vehicle_id": string }; Returns: {
              "caption": string | null,
"captured_at": string | null,
"company_id": string,
"deleted_at": string | null,
"file_size": number,
"id": string,
"image_type": Database["public"]['Enums']["image_type"],
"is_cover": boolean,
"mime_type": string,
"original_filename": string,
"sort_order": number | null,
"storage_path": string,
"superseded_at": string | null,
"thumbnail_path": string | null,
"uploaded_at": string,
"uploaded_by": string | null,
"vehicle_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "vehicle_images"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_my_locale":
{ Args: { "p_locale": string }; Returns: undefined
                           },
"set_part_status":
{ Args: { "p_part_id": string,"p_status": string }; Returns: undefined
                           },
"warranty_end":
{ Args: { "w": Omit<Database["public"]['Tables']["warranties"]['Row'], Database["public"]['Tables']["warranties"]['ComputedFields']> }; Returns: string
                           }
          }
          Enums: {
            "accessory_type": "physical_key"|"smart_key"|"nfc_card"|"charger"|"other"|"charging_cable"|"floor_mats"|"owners_manual"|"warning_triangle","app_role": "admin"|"secretary"|"staff"|"viewer"|"sales_manager"|"technician","document_type": "vehicle_pdf"|"registration"|"inspection"|"purchase"|"other"|"brochure"|"warranty_certificate"|"warranty_terms","expense_category": "mechanical"|"electrical"|"bodywork"|"paint"|"tires"|"maintenance"|"transportation"|"accessories"|"other"|"garage"|"rta"|"detailing"|"tinting"|"parts","image_type": "arrival"|"current"|"garage"|"information_card"|"other"|"delivery","item_status": "present"|"missing"|"unknown","job_status": "pending"|"processing"|"needs_review"|"verified"|"failed","vehicle_status": "in_stock"|"in_garage"|"reserved"|"sold"|"delivered","verification_status": "unverified"|"verified"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "accessory_type": ["physical_key", "smart_key", "nfc_card", "charger", "other", "charging_cable", "floor_mats", "owners_manual", "warning_triangle"],"app_role": ["admin", "secretary", "staff", "viewer", "sales_manager", "technician"],"document_type": ["vehicle_pdf", "registration", "inspection", "purchase", "other", "brochure", "warranty_certificate", "warranty_terms"],"expense_category": ["mechanical", "electrical", "bodywork", "paint", "tires", "maintenance", "transportation", "accessories", "other", "garage", "rta", "detailing", "tinting", "parts"],"image_type": ["arrival", "current", "garage", "information_card", "other", "delivery"],"item_status": ["present", "missing", "unknown"],"job_status": ["pending", "processing", "needs_review", "verified", "failed"],"vehicle_status": ["in_stock", "in_garage", "reserved", "sold", "delivered"],"verification_status": ["unverified", "verified"]
          }
        }
} as const
