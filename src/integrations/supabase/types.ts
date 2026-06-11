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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      legacy_brief_reads: {
        Row: {
          brief_id: string
          client_user_id: string
          read_at: string
        }
        Insert: {
          brief_id: string
          client_user_id: string
          read_at?: string
        }
        Update: {
          brief_id?: string
          client_user_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_reads_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "legacy_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_briefs: {
        Row: {
          analyst_id: string
          body: string
          call_date: string | null
          call_title: string
          client_id: string
          created_at: string
          granola_note_id: string
          id: string
          participants: string | null
          published_at: string | null
          skip_reason: string | null
          status: Database["public"]["Enums"]["brief_status"]
          updated_at: string
        }
        Insert: {
          analyst_id: string
          body?: string
          call_date?: string | null
          call_title: string
          client_id: string
          created_at?: string
          granola_note_id: string
          id?: string
          participants?: string | null
          published_at?: string | null
          skip_reason?: string | null
          status?: Database["public"]["Enums"]["brief_status"]
          updated_at?: string
        }
        Update: {
          analyst_id?: string
          body?: string
          call_date?: string | null
          call_title?: string
          client_id?: string
          created_at?: string
          granola_note_id?: string
          id?: string
          participants?: string | null
          published_at?: string | null
          skip_reason?: string | null
          status?: Database["public"]["Enums"]["brief_status"]
          updated_at?: string
        }
        Relationships: []
      }
      legacy_folder_mappings: {
        Row: {
          analyst_id: string
          client_id: string
          created_at: string
          granola_folder_id: string
          granola_folder_name: string
          id: string
        }
        Insert: {
          analyst_id: string
          client_id: string
          created_at?: string
          granola_folder_id: string
          granola_folder_name: string
          id?: string
        }
        Update: {
          analyst_id?: string
          client_id?: string
          created_at?: string
          granola_folder_id?: string
          granola_folder_name?: string
          id?: string
        }
        Relationships: []
      }
      legacy_granola_connections: {
        Row: {
          analyst_id: string
          api_key: string
          created_at: string
          id: string
          last_polled_at: string | null
        }
        Insert: {
          analyst_id: string
          api_key: string
          created_at?: string
          id?: string
          last_polled_at?: string | null
        }
        Update: {
          analyst_id?: string
          api_key?: string
          created_at?: string
          id?: string
          last_polled_at?: string | null
        }
        Relationships: []
      }
      legacy_requests: {
        Row: {
          brief_id: string | null
          client_id: string
          created_at: string
          created_by: string
          id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          brief_id?: string | null
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          brief_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "requests_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "legacy_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_entries: {
        Row: {
          author_id: string | null
          call_date: string | null
          created_at: string
          custom: Json
          id: string
          portal_id: string
          readout: Json | null
          subject_person_id: string | null
          talked_to: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          call_date?: string | null
          created_at?: string
          custom?: Json
          id?: string
          portal_id: string
          readout?: Json | null
          subject_person_id?: string | null
          talked_to?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          call_date?: string | null
          created_at?: string
          custom?: Json
          id?: string
          portal_id?: string
          readout?: Json | null
          subject_person_id?: string | null
          talked_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_entries_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_entries_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "portal_people"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_entry_mentions: {
        Row: {
          entry_id: string
          person_id: string
        }
        Insert: {
          entry_id: string
          person_id: string
        }
        Update: {
          entry_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_entry_mentions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "portal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_entry_mentions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "portal_people"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_form_schema: {
        Row: {
          fields: Json
          portal_id: string
          relationship_types: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fields?: Json
          portal_id: string
          relationship_types?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fields?: Json
          portal_id?: string
          relationship_types?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_form_schema_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: true
            referencedRelation: "portals"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_members: {
        Row: {
          invited_by: string | null
          joined_at: string
          portal_id: string
          role: Database["public"]["Enums"]["portal_role"]
          user_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string
          portal_id: string
          role?: Database["public"]["Enums"]["portal_role"]
          user_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string
          portal_id?: string
          role?: Database["public"]["Enums"]["portal_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_members_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portals"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_people: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          org: string | null
          portal_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org?: string | null
          portal_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org?: string | null
          portal_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_people_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portals"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          from_person_id: string
          id: string
          note: string | null
          portal_id: string
          to_person_id: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_person_id: string
          id?: string
          note?: string | null
          portal_id: string
          to_person_id: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_person_id?: string
          id?: string
          note?: string | null
          portal_id?: string
          to_person_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_relationships_from_person_id_fkey"
            columns: ["from_person_id"]
            isOneToOne: false
            referencedRelation: "portal_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_relationships_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_relationships_to_person_id_fkey"
            columns: ["to_person_id"]
            isOneToOne: false
            referencedRelation: "portal_people"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_requests: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          portal_id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          portal_id: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          portal_id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_requests_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portals"
            referencedColumns: ["id"]
          },
        ]
      }
      portals: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_admin: boolean
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_admin?: boolean
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_portal_admin: {
        Args: { _portal: string; _user: string }
        Returns: boolean
      }
      is_portal_member: {
        Args: { _portal: string; _user: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      portal_member_role: {
        Args: { _portal: string; _user: string }
        Returns: Database["public"]["Enums"]["portal_role"]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "analyst" | "client" | "admin"
      brief_status: "draft" | "pending" | "published" | "rejected" | "skipped"
      portal_role: "owner" | "co_owner" | "analyst"
      request_status: "open" | "resolved"
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
      app_role: ["analyst", "client", "admin"],
      brief_status: ["draft", "pending", "published", "rejected", "skipped"],
      portal_role: ["owner", "co_owner", "analyst"],
      request_status: ["open", "resolved"],
    },
  },
} as const
