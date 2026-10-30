
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accessories": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"item_name": string,"item_type": Database["public"]['Enums']["accessory_type"],"notes": string | null,"quantity": number,"status": Database["public"]['Enums']["item_status"],"updated_at": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"item_name": string,"item_type": Database["public"]['Enums']["accessory_type"],"notes"?: string | null,"quantity"?: number,"status"?: Database["public"]['Enums']["item_status"],"updated_at"?: string,"vehicle_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"item_name"?: string,"item_type"?: Database["public"]['Enums']["accessory_type"],"notes"?: string | null,"quantity"?: number,"status"?: Database["public"]['Enums']["item_status"],"updated_at"?: string,"vehicle_id"?: string
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
                    "accent_color": string,"created_at": string,"currency": string,"default_locale": string,"id": string,"known_brands": (string)[],"logo_dark_path": string | null,"logo_path": string | null,"name": string,"sidebar_color": string,"theme_mode": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"id"?: string,"known_brands"?: (string)[],"logo_dark_path"?: string | null,"logo_path"?: string | null,"name": string,"sidebar_color"?: string,"theme_mode"?: string,"timezone"?: string
                  }
                  Update: {
                    "accent_color"?: string,"created_at"?: string,"currency"?: string,"default_locale"?: string,"id"?: string,"known_brands"?: (string)[],"logo_dark_path"?: string | null,"logo_path"?: string | null,"name"?: string,"sidebar_color"?: string,"theme_mode"?: string,"timezone"?: string
                  }
                  Relationships: [
                    
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
                },"vehicle_events": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string | null,"description": string | null,"event_at": string,"event_type": string,"from_status": Database["public"]['Enums']["vehicle_status"] | null,"id": string,"to_status": Database["public"]['Enums']["vehicle_status"] | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"event_at"?: string,"event_type": string,"from_status"?: Database["public"]['Enums']["vehicle_status"] | null,"id"?: string,"to_status"?: Database["public"]['Enums']["vehicle_status"] | null,"vehicle_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"event_at"?: string,"event_type"?: string,"from_status"?: Database["public"]['Enums']["vehicle_status"] | null,"id"?: string,"to_status"?: Database["public"]['Enums']["vehicle_status"] | null,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
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
                    "caption": string | null,"captured_at": string | null,"company_id": string,"deleted_at": string | null,"file_size": number,"id": string,"image_type": Database["public"]['Enums']["image_type"],"mime_type": string,"original_filename": string,"storage_path": string,"superseded_at": string | null,"thumbnail_path": string | null,"uploaded_at": string,"uploaded_by": string | null,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"captured_at"?: string | null,"company_id"?: string,"deleted_at"?: string | null,"file_size": number,"id"?: string,"image_type": Database["public"]['Enums']["image_type"],"mime_type": string,"original_filename": string,"storage_path": string,"superseded_at"?: string | null,"thumbnail_path"?: string | null,"uploaded_at"?: string,"uploaded_by"?: string | null,"vehicle_id": string
                  }
                  Update: {
                    "caption"?: string | null,"captured_at"?: string | null,"company_id"?: string,"deleted_at"?: string | null,"file_size"?: number,"id"?: string,"image_type"?: Database["public"]['Enums']["image_type"],"mime_type"?: string,"original_filename"?: string,"storage_path"?: string,"superseded_at"?: string | null,"thumbnail_path"?: string | null,"uploaded_at"?: string,"uploaded_by"?: string | null,"vehicle_id"?: string
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
                },"vehicle_specs": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"label": string,"label_alt": string | null,"section": string | null,"sort_order": number,"source_document_id": string | null,"source_page": number | null,"unit": string | null,"updated_at": string,"value": string,"vehicle_id": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"label": string,"label_alt"?: string | null,"section"?: string | null,"sort_order"?: number,"source_document_id"?: string | null,"source_page"?: number | null,"unit"?: string | null,"updated_at"?: string,"value": string,"vehicle_id": string,"verified"?: boolean
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"label"?: string,"label_alt"?: string | null,"section"?: string | null,"sort_order"?: number,"source_document_id"?: string | null,"source_page"?: number | null,"unit"?: string | null,"updated_at"?: string,"value"?: string,"vehicle_id"?: string,"verified"?: boolean
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
                    "acquisition_price": number | null,"archived_at": string | null,"arrival_at": string | null,"brand": string | null,"chassis_normalized": string | null,"chassis_number": string,"chassis_verified": boolean,"company_id": string,"created_at": string,"created_by": string | null,"delivered_at": string | null,"exterior_color": string | null,"id": string,"interior_color": string | null,"listing_price": number | null,"location": string | null,"mileage_km": number | null,"model": string | null,"notes": string | null,"sale_price": number | null,"sold_at": string | null,"status": Database["public"]['Enums']["vehicle_status"],"trim_level": string | null,"updated_at": string,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acquisition_price"?: number | null,"archived_at"?: string | null,"arrival_at"?: string | null,"brand"?: string | null,"chassis_normalized"?: never,"chassis_number": string,"chassis_verified"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"exterior_color"?: string | null,"id"?: string,"interior_color"?: string | null,"listing_price"?: number | null,"location"?: string | null,"mileage_km"?: number | null,"model"?: string | null,"notes"?: string | null,"sale_price"?: number | null,"sold_at"?: string | null,"status"?: Database["public"]['Enums']["vehicle_status"],"trim_level"?: string | null,"updated_at"?: string,"year"?: number | null
                  }
                  Update: {
                    "acquisition_price"?: number | null,"archived_at"?: string | null,"arrival_at"?: string | null,"brand"?: string | null,"chassis_normalized"?: never,"chassis_number"?: string,"chassis_verified"?: boolean,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"delivered_at"?: string | null,"exterior_color"?: string | null,"id"?: string,"interior_color"?: string | null,"listing_price"?: number | null,"location"?: string | null,"mileage_km"?: number | null,"model"?: string | null,"notes"?: string | null,"sale_price"?: number | null,"sold_at"?: string | null,"status"?: Database["public"]['Enums']["vehicle_status"],"trim_level"?: string | null,"updated_at"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "vehicle_overview": {
                  Row: {
                    "accessory_count": number | null,"acquisition_price": number | null,"archived_at": string | null,"arrival_at": string | null,"brand": string | null,"chassis_normalized": string | null,"chassis_number": string,"chassis_verified": boolean,"company_id": string,"cover_thumbnail_path": string | null,"created_at": string,"created_by": string | null,"delivered_at": string | null,"document_count": number | null,"expense_total": number | null,"exterior_color": string | null,"id": string,"interior_color": string | null,"listing_price": number | null,"location": string | null,"mileage_km": number | null,"missing_accessories": number | null,"model": string | null,"notes": string | null,"sale_price": number | null,"sold_at": string | null,"status": Database["public"]['Enums']["vehicle_status"],"trim_level": string | null,"unknown_accessories": number | null,"updated_at": string,"year": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "vehicles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
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
"archive_vehicle":
{ Args: { "p_archive": boolean,"p_note"?: string,"p_vehicle_id": string }; Returns: undefined
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
"exterior_color": string | null,
"id": string,
"interior_color": string | null,
"listing_price": number | null,
"location": string | null,
"mileage_km": number | null,
"model": string | null,
"notes": string | null,
"sale_price": number | null,
"sold_at": string | null,
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
"current_app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"current_company_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dashboard_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"import_vehicles":
{ Args: { "p_rows": Json }; Returns: number
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"normalize_chassis":
{ Args: { "raw": string }; Returns: string
                           },
"save_vehicle_import":
{ Args: { "p_documents"?: Json,"p_fields": Json,"p_images"?: Json,"p_specs"?: Json,"p_vehicle_id": string }; Returns: string
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
"mime_type": string,
"original_filename": string,
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
                           }
          }
          Enums: {
            "accessory_type": "physical_key"|"smart_key"|"nfc_card"|"charger"|"other","app_role": "admin"|"secretary"|"staff"|"viewer","document_type": "vehicle_pdf"|"registration"|"inspection"|"purchase"|"other","expense_category": "mechanical"|"electrical"|"bodywork"|"paint"|"tires"|"maintenance"|"transportation"|"accessories"|"other","image_type": "arrival"|"current"|"garage"|"information_card"|"other","item_status": "present"|"missing"|"unknown","job_status": "pending"|"processing"|"needs_review"|"verified"|"failed","vehicle_status": "in_stock"|"in_garage"|"reserved"|"sold"|"delivered","verification_status": "unverified"|"verified"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "accessory_type": ["physical_key", "smart_key", "nfc_card", "charger", "other"],"app_role": ["admin", "secretary", "staff", "viewer"],"document_type": ["vehicle_pdf", "registration", "inspection", "purchase", "other"],"expense_category": ["mechanical", "electrical", "bodywork", "paint", "tires", "maintenance", "transportation", "accessories", "other"],"image_type": ["arrival", "current", "garage", "information_card", "other"],"item_status": ["present", "missing", "unknown"],"job_status": ["pending", "processing", "needs_review", "verified", "failed"],"vehicle_status": ["in_stock", "in_garage", "reserved", "sold", "delivered"],"verification_status": ["unverified", "verified"]
          }
        }
} as const
