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
            "area_types": {
                  Row: {
                    "complex_id": number,"exclusive_area": number,"id": number,"latest_date": string | null,"latest_price": number | null,"max_price_6m": number | null,"min_price_6m": number | null,"peak_date": string | null,"peak_price": number | null,"summary_updated_at": string | null,"supply_area": number | null,"supply_area_checked_at": string | null,"supply_area_source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "complex_id": number,"exclusive_area": number,"id"?: never,"latest_date"?: string | null,"latest_price"?: number | null,"max_price_6m"?: number | null,"min_price_6m"?: number | null,"peak_date"?: string | null,"peak_price"?: number | null,"summary_updated_at"?: string | null,"supply_area"?: number | null,"supply_area_checked_at"?: string | null,"supply_area_source"?: string | null
                  }
                  Update: {
                    "complex_id"?: number,"exclusive_area"?: number,"id"?: never,"latest_date"?: string | null,"latest_price"?: number | null,"max_price_6m"?: number | null,"min_price_6m"?: number | null,"peak_date"?: string | null,"peak_price"?: number | null,"summary_updated_at"?: string | null,"supply_area"?: number | null,"supply_area_checked_at"?: string | null,"supply_area_source"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "area_types_complex_id_fkey"
      columns: ["complex_id"]
isOneToOne: false
      referencedRelation: "complexes"
      referencedColumns: ["id"]
    }
                  ]
                },"complexes": {
                  Row: {
                    "approved_on": string | null,"apt_seq": string | null,"bonbun": number | null,"bubun": number | null,"build_year": number | null,"builder": string | null,"buildings": number | null,"created_at": string,"hallway_type": string | null,"households": number | null,"id": number,"jibun": string | null,"kapt_code": string | null,"kapt_synced_at": string | null,"lat": number | null,"lng": number | null,"match_status": string,"name": string,"parking_spaces": number | null,"sigungu_code": string,"umd_code": string | null,"umd_name": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_on"?: string | null,"apt_seq"?: string | null,"bonbun"?: number | null,"bubun"?: number | null,"build_year"?: number | null,"builder"?: string | null,"buildings"?: number | null,"created_at"?: string,"hallway_type"?: string | null,"households"?: number | null,"id"?: never,"jibun"?: string | null,"kapt_code"?: string | null,"kapt_synced_at"?: string | null,"lat"?: number | null,"lng"?: number | null,"match_status"?: string,"name": string,"parking_spaces"?: number | null,"sigungu_code": string,"umd_code"?: string | null,"umd_name"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "approved_on"?: string | null,"apt_seq"?: string | null,"bonbun"?: number | null,"bubun"?: number | null,"build_year"?: number | null,"builder"?: string | null,"buildings"?: number | null,"created_at"?: string,"hallway_type"?: string | null,"households"?: number | null,"id"?: never,"jibun"?: string | null,"kapt_code"?: string | null,"kapt_synced_at"?: string | null,"lat"?: number | null,"lng"?: number | null,"match_status"?: string,"name"?: string,"parking_spaces"?: number | null,"sigungu_code"?: string,"umd_code"?: string | null,"umd_name"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "complexes_sigungu_code_fkey"
      columns: ["sigungu_code"]
isOneToOne: false
      referencedRelation: "sigungu_codes"
      referencedColumns: ["code"]
    }
                  ]
                },"ops_metrics": {
                  Row: {
                    "db_size_bytes": number | null,"detail": Json | null,"error_count": number,"fetched_count": number | null,"id": number,"job": string,"recorded_at": string,"upserted_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "db_size_bytes"?: number | null,"detail"?: Json | null,"error_count"?: number,"fetched_count"?: number | null,"id"?: never,"job": string,"recorded_at"?: string,"upserted_count"?: number | null
                  }
                  Update: {
                    "db_size_bytes"?: number | null,"detail"?: Json | null,"error_count"?: number,"fetched_count"?: number | null,"id"?: never,"job"?: string,"recorded_at"?: string,"upserted_count"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"policy_rules": {
                  Row: {
                    "checked_on": string | null,"effective_from": string,"effective_to": string | null,"id": number,"key": string,"note": string | null,"region_scope": string,"source_url": string | null,"value": NonNullable<Json>,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_on"?: string | null,"effective_from": string,"effective_to"?: string | null,"id"?: never,"key": string,"note"?: string | null,"region_scope"?: string,"source_url"?: string | null,"value": NonNullable<Json>,"verified"?: boolean
                  }
                  Update: {
                    "checked_on"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"id"?: never,"key"?: string,"note"?: string | null,"region_scope"?: string,"source_url"?: string | null,"value"?: NonNullable<Json>,"verified"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"sigungu_code_changes": {
                  Row: {
                    "effective_on": string,"new_code": string,"old_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "effective_on": string,"new_code": string,"old_code": string
                  }
                  Update: {
                    "effective_on"?: string,"new_code"?: string,"old_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sigungu_code_changes_new_code_fkey"
      columns: ["new_code"]
isOneToOne: false
      referencedRelation: "sigungu_codes"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "sigungu_code_changes_old_code_fkey"
      columns: ["old_code"]
isOneToOne: false
      referencedRelation: "sigungu_codes"
      referencedColumns: ["code"]
    }
                  ]
                },"sigungu_codes": {
                  Row: {
                    "code": string,"is_active": boolean,"is_capital_area": boolean,"is_collected": boolean,"sido_name": string,"sigungu_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"is_active"?: boolean,"is_capital_area"?: boolean,"is_collected"?: boolean,"sido_name": string,"sigungu_name": string
                  }
                  Update: {
                    "code"?: string,"is_active"?: boolean,"is_capital_area"?: boolean,"is_collected"?: boolean,"sido_name"?: string,"sigungu_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trades_archive": {
                  Row: {
                    "area_type_id": number,"trades": (number)[],"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "area_type_id": number,"trades": (number)[],"year": number
                  }
                  Update: {
                    "area_type_id"?: number,"trades"?: (number)[],"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "trades_archive_area_type_id_fkey"
      columns: ["area_type_id"]
isOneToOne: false
      referencedRelation: "area_types"
      referencedColumns: ["id"]
    }
                  ]
                },"trades_recent": {
                  Row: {
                    "area_type_id": number,"cancelled_on": string | null,"contract_date": string,"dong": string | null,"floor": number | null,"is_direct": boolean,"price": number,"registered_on": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_type_id": number,"cancelled_on"?: string | null,"contract_date": string,"dong"?: string | null,"floor"?: number | null,"is_direct"?: boolean,"price": number,"registered_on"?: string | null
                  }
                  Update: {
                    "area_type_id"?: number,"cancelled_on"?: string | null,"contract_date"?: string,"dong"?: string | null,"floor"?: number | null,"is_direct"?: boolean,"price"?: number,"registered_on"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trades_recent_area_type_id_fkey"
      columns: ["area_type_id"]
isOneToOne: false
      referencedRelation: "area_types"
      referencedColumns: ["id"]
    }
                  ]
                },"user_area_notes": {
                  Row: {
                    "area_type_id": number,"bathrooms": number | null,"memo": string | null,"rooms": number | null,"supply_area": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area_type_id": number,"bathrooms"?: number | null,"memo"?: string | null,"rooms"?: number | null,"supply_area"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "area_type_id"?: number,"bathrooms"?: number | null,"memo"?: string | null,"rooms"?: number | null,"supply_area"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_area_notes_area_type_id_fkey"
      columns: ["area_type_id"]
isOneToOne: false
      referencedRelation: "area_types"
      referencedColumns: ["id"]
    }
                  ]
                },"user_complexes": {
                  Row: {
                    "area_type_id": number,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area_type_id": number,"created_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "area_type_id"?: number,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_complexes_area_type_id_fkey"
      columns: ["area_type_id"]
isOneToOne: false
      referencedRelation: "area_types"
      referencedColumns: ["id"]
    }
                  ]
                },"user_profile": {
                  Row: {
                    "annual_income": number | null,"created_at": string,"existing_annual_debt": number,"house_count": number,"include_moving_cost": boolean,"interest_rate": number | null,"is_first_time_buyer": boolean,"lender_type": string,"loan_term_years": number,"moving_cost": number,"repayment_type": string,"seed_money": number | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_income"?: number | null,"created_at"?: string,"existing_annual_debt"?: number,"house_count"?: number,"include_moving_cost"?: boolean,"interest_rate"?: number | null,"is_first_time_buyer"?: boolean,"lender_type"?: string,"loan_term_years"?: number,"moving_cost"?: number,"repayment_type"?: string,"seed_money"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "annual_income"?: number | null,"created_at"?: string,"existing_annual_debt"?: number,"house_count"?: number,"include_moving_cost"?: boolean,"interest_rate"?: number | null,"is_first_time_buyer"?: boolean,"lender_type"?: string,"loan_term_years"?: number,"moving_cost"?: number,"repayment_type"?: string,"seed_money"?: number | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "trades_7y": {
                  Row: {
                    "area_type_id": number | null,"cancelled_on": string | null,"contract_date": string | null,"dong": string | null,"floor": number | null,"is_archived": boolean | null,"is_cancelled": boolean | null,"is_direct": boolean | null,"price": number | null,"registered_on": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "archive_trades":
{ Args: { "p_today"?: string }; Returns: Json
                           },
"ingest_trades":
{ Args: { "p_rows": Json,"p_sigungu_code": string,"p_today"?: string }; Returns: Json
                           },
"log_ops_metric":
{ Args: { "p_detail"?: Json,"p_error_count"?: number,"p_fetched_count"?: number,"p_job": string,"p_upserted_count"?: number }; Returns: number
                           },
"pack_archived_trade":
{ Args: { "p_contract_date": string,"p_floor": number,"p_is_cancelled": boolean,"p_is_direct": boolean,"p_price": number }; Returns: number
                           },
"refresh_area_type_summary":
{ Args: { "p_area_type_ids": (number)[],"p_today"?: string }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
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
            
          }
        }
} as const
