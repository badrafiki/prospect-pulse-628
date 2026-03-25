export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          address: string | null
          confidence_score: number | null
          created_at: string
          domain: string | null
          id: string
          industries: string[] | null
          linkedin_url: string | null
          locations: string[] | null
          name: string
          notes: string | null
          phone: string | null
          processing_status: string
          products_services: string[] | null
          source_search_term: string | null
          status: string
          summary: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          confidence_score?: number | null
          created_at?: string
          domain?: string | null
          id?: string
          industries?: string[] | null
          linkedin_url?: string | null
          locations?: string[] | null
          name: string
          notes?: string | null
          phone?: string | null
          processing_status?: string
          products_services?: string[] | null
          source_search_term?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          confidence_score?: number | null
          created_at?: string
          domain?: string | null
          id?: string
          industries?: string[] | null
          linkedin_url?: string | null
          locations?: string[] | null
          name?: string
          notes?: string | null
          phone?: string | null
          processing_status?: string
          products_services?: string[] | null
          source_search_term?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      crawled_urls: {
        Row: {
          created_at: string
          id: string
          source: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          company_id: string
          context: string | null
          created_at: string
          email_address: string
          id: string
          source_url: string | null
          user_id: string
          validated: boolean | null
        }
        Insert: {
          company_id: string
          context?: string | null
          created_at?: string
          email_address: string
          id?: string
          source_url?: string | null
          user_id: string
          validated?: boolean | null
        }
        Update: {
          company_id?: string
          context?: string | null
          created_at?: string
          email_address?: string
          id?: string
          source_url?: string | null
          user_id?: string
          validated?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      global_companies: {
        Row: {
          confidence_score: number | null
          created_at: string
          domain: string
          id: string
          industries: string[] | null
          last_scraped_at: string | null
          name: string | null
          summary: string | null
          website: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          domain: string
          id?: string
          industries?: string[] | null
          last_scraped_at?: string | null
          name?: string | null
          summary?: string | null
          website?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          domain?: string
          id?: string
          industries?: string[] | null
          last_scraped_at?: string | null
          name?: string | null
          summary?: string | null
          website?: string | null
        }
        Relationships: []
      }
      global_emails: {
        Row: {
          context: string | null
          created_at: string
          domain: string
          email_address: string
          global_company_id: string | null
          id: string
          source_url: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          domain: string
          email_address: string
          global_company_id?: string | null
          id?: string
          source_url?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          domain?: string
          email_address?: string
          global_company_id?: string | null
          id?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "global_emails_global_company_id_fkey"
            columns: ["global_company_id"]
            isOneToOne: false
            referencedRelation: "global_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          company_id: string
          confidence_score: number | null
          created_at: string
          full_name: string
          id: string
          linkedin_url: string | null
          notes: string | null
          source_url: string | null
          status: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          confidence_score?: number | null
          created_at?: string
          full_name: string
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          source_url?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          confidence_score?: number | null
          created_at?: string
          full_name?: string
          id?: string
          linkedin_url?: string | null
          notes?: string | null
          source_url?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          can_use_ai_extraction: boolean
          can_use_directory_import: boolean
          can_use_mailchimp: boolean
          email_discovery_limit: number
          id: string
          name: string
          price_monthly: number
          result_limit: number
          search_limit: number
          stripe_price_id: string | null
        }
        Insert: {
          can_use_ai_extraction?: boolean
          can_use_directory_import?: boolean
          can_use_mailchimp?: boolean
          email_discovery_limit: number
          id: string
          name: string
          price_monthly: number
          result_limit: number
          search_limit: number
          stripe_price_id?: string | null
        }
        Update: {
          can_use_ai_extraction?: boolean
          can_use_directory_import?: boolean
          can_use_mailchimp?: boolean
          email_discovery_limit?: number
          id?: string
          name?: string
          price_monthly?: number
          result_limit?: number
          search_limit?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      search_results: {
        Row: {
          company_id: string
          created_at: string
          id: string
          search_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          search_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          search_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_results_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      searches: {
        Row: {
          country: string | null
          created_at: string
          id: string
          industry: string | null
          result_limit: number | null
          results_count: number | null
          search_term: string
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          result_limit?: number | null
          results_count?: number | null
          search_term: string
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          result_limit?: number | null
          results_count?: number | null
          search_term?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_usage: { Args: { p_user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
