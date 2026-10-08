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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      concept_sources: {
        Row: {
          concept_id: string
          relevance: string
          source_id: string
          updated_at: string
        }
        Insert: {
          concept_id: string
          relevance: string
          source_id: string
          updated_at?: string
        }
        Update: {
          concept_id?: string
          relevance?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_sources_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          better_alternative: string | null
          description: string
          id: string
          layer_id: string
          mechanism: string | null
          name: string
          problem: string | null
          search_text: string | null
          slug: string
          tradeoffs: string | null
          updated_at: string
          why: string | null
        }
        Insert: {
          better_alternative?: string | null
          description: string
          id: string
          layer_id: string
          mechanism?: string | null
          name: string
          problem?: string | null
          search_text?: string | null
          slug: string
          tradeoffs?: string | null
          updated_at?: string
          why?: string | null
        }
        Update: {
          better_alternative?: string | null
          description?: string
          id?: string
          layer_id?: string
          mechanism?: string | null
          name?: string
          problem?: string | null
          search_text?: string | null
          slug?: string
          tradeoffs?: string | null
          updated_at?: string
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concepts_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          concept_id: string
          false_positive: string | null
          id: string
          kind: string
          signal: string
          trend: string
          updated_at: string
          what_you_see: string
          where_to_look: string
          why_it_matters: string
        }
        Insert: {
          concept_id: string
          false_positive?: string | null
          id: string
          kind: string
          signal: string
          trend: string
          updated_at?: string
          what_you_see: string
          where_to_look: string
          why_it_matters: string
        }
        Update: {
          concept_id?: string
          false_positive?: string | null
          id?: string
          kind?: string
          signal?: string
          trend?: string
          updated_at?: string
          what_you_see?: string
          where_to_look?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          contributing_ids: string[]
          created_at: string
          id: string
          lesson: string
          narrative: string
          resolution: string
          root_cause_id: string
          severity: string
          slug: string
          sort_order: number
          summary: string
          symptom_ids: string[]
          timeline: Json
          title: string
          updated_at: string
        }
        Insert: {
          contributing_ids?: string[]
          created_at?: string
          id: string
          lesson: string
          narrative: string
          resolution: string
          root_cause_id: string
          severity?: string
          slug: string
          sort_order?: number
          summary: string
          symptom_ids?: string[]
          timeline?: Json
          title: string
          updated_at?: string
        }
        Update: {
          contributing_ids?: string[]
          created_at?: string
          id?: string
          lesson?: string
          narrative?: string
          resolution?: string
          root_cause_id?: string
          severity?: string
          slug?: string
          sort_order?: number
          summary?: string
          symptom_ids?: string[]
          timeline?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_root_cause_id_fkey"
            columns: ["root_cause_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      layers: {
        Row: {
          description: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          description: string
          id: string
          name: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          description?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      learning_progress: {
        Row: {
          concept_id: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          concept_id: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          concept_id?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_progress_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          id: string
          source_id: string
          target_id: string
          type: string
          updated_at: string
        }
        Insert: {
          id: string
          source_id: string
          target_id: string
          type: string
          updated_at?: string
        }
        Update: {
          id?: string
          source_id?: string
          target_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      research_proposals: {
        Row: {
          context: Json
          context_hash: string
          created_at: string
          decided_at: string | null
          id: string
          issues: Json
          model: string
          proposal: Json
          question: string
          review_note: string | null
          run_id: string | null
          status: string
          summary: string
          topic: string
        }
        Insert: {
          context: Json
          context_hash: string
          created_at?: string
          decided_at?: string | null
          id?: string
          issues?: Json
          model: string
          proposal: Json
          question?: string
          review_note?: string | null
          run_id?: string | null
          status?: string
          summary?: string
          topic: string
        }
        Update: {
          context?: Json
          context_hash?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          issues?: Json
          model?: string
          proposal?: Json
          question?: string
          review_note?: string | null
          run_id?: string | null
          status?: string
          summary?: string
          topic?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          author: string
          id: string
          kind: string
          note: string
          title: string
          updated_at: string
          url: string
          year: number | null
        }
        Insert: {
          author: string
          id: string
          kind: string
          note: string
          title: string
          updated_at?: string
          url: string
          year?: number | null
        }
        Update: {
          author?: string
          id?: string
          kind?: string
          note?: string
          title?: string
          updated_at?: string
          url?: string
          year?: number | null
        }
        Relationships: []
      }
      symptom_evidence: {
        Row: {
          evidence_id: string
          strength: string
          symptom_id: string
        }
        Insert: {
          evidence_id: string
          strength: string
          symptom_id: string
        }
        Update: {
          evidence_id?: string
          strength?: string
          symptom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "symptom_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "symptom_evidence_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      symptoms: {
        Row: {
          description: string
          id: string
          layer_id: string
          name: string
          signal: string
          trend: string
        }
        Insert: {
          description: string
          id: string
          layer_id: string
          name: string
          signal: string
          trend: string
        }
        Update: {
          description?: string
          id?: string
          layer_id?: string
          name?: string
          signal?: string
          trend?: string
        }
        Relationships: [
          {
            foreignKeyName: "symptoms_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atlas_stats: { Args: never; Returns: Json }
      concept_neighborhood: {
        Args: { p_concept_id: string; p_depth?: number }
        Returns: {
          concept_id: string
          hops: number
        }[]
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
