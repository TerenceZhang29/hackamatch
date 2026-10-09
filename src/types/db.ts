export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          props: NonNullable<Json>;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
          props?: NonNullable<Json>;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
          props?: NonNullable<Json>;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          allowed_email_domains: string[];
          id: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          allowed_email_domains?: string[];
          id?: boolean;
          updated_at?: string;
        };
        Update: {
          allowed_email_domains?: string[];
          id?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_interests: {
        Row: {
          created_at: string;
          event_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_interests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_interests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_interests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          created_at: string;
          description: string | null;
          end_date: string;
          id: string;
          name: string;
          nudge_sent_at: string | null;
          organizer_id: string | null;
          slug: string;
          start_date: string;
          team_size_max: number;
          team_size_min: number;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          end_date: string;
          id?: string;
          name: string;
          nudge_sent_at?: string | null;
          organizer_id?: string | null;
          slug: string;
          start_date: string;
          team_size_max?: number;
          team_size_min?: number;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          end_date?: string;
          id?: string;
          name?: string;
          nudge_sent_at?: string | null;
          organizer_id?: string | null;
          slug?: string;
          start_date?: string;
          team_size_max?: number;
          team_size_min?: number;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_organizer_id_fkey";
            columns: ["organizer_id"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_organizer_id_fkey";
            columns: ["organizer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ideas: {
        Row: {
          clarifying_question: string | null;
          created_at: string;
          domain: string | null;
          embedding: string | null;
          event_id: string | null;
          featured: boolean;
          id: string;
          owner_id: string;
          pitch: string | null;
          raw_text: string;
          scope: Database["public"]["Enums"]["idea_scope"] | null;
          skills_needed: string[];
          status: Database["public"]["Enums"]["idea_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          clarifying_question?: string | null;
          created_at?: string;
          domain?: string | null;
          embedding?: string | null;
          event_id?: string | null;
          featured?: boolean;
          id?: string;
          owner_id: string;
          pitch?: string | null;
          raw_text: string;
          scope?: Database["public"]["Enums"]["idea_scope"] | null;
          skills_needed?: string[];
          status?: Database["public"]["Enums"]["idea_status"];
          updated_at?: string;
        };
        Update: {
          clarifying_question?: string | null;
          created_at?: string;
          domain?: string | null;
          embedding?: string | null;
          event_id?: string | null;
          featured?: boolean;
          id?: string;
          owner_id?: string;
          pitch?: string | null;
          raw_text?: string;
          scope?: Database["public"]["Enums"]["idea_scope"] | null;
          skills_needed?: string[];
          status?: Database["public"]["Enums"]["idea_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ideas_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ideas_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ideas_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      match_event_votes: {
        Row: {
          created_at: string;
          event_id: string;
          match_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          match_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          match_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_event_votes_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_event_votes_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_event_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_event_votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      match_runs: {
        Row: {
          error: string | null;
          finished_at: string | null;
          id: string;
          mode: string;
          run_date: string;
          started_at: string;
          stats: NonNullable<Json>;
          status: string;
          weights: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          mode: string;
          run_date: string;
          started_at?: string;
          stats?: NonNullable<Json>;
          status?: string;
          weights: NonNullable<Json>;
        };
        Update: {
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          mode?: string;
          run_date?: string;
          started_at?: string;
          stats?: NonNullable<Json>;
          status?: string;
          weights?: NonNullable<Json>;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          a_responded_at: string | null;
          a_response: Database["public"]["Enums"]["match_response"];
          b_responded_at: string | null;
          b_response: Database["public"]["Enums"]["match_response"];
          created_at: string;
          event_id: string | null;
          id: string;
          idea_id: string | null;
          reason_for_a: string | null;
          reason_for_b: string | null;
          revealed_at: string | null;
          run_id: string | null;
          score: number | null;
          score_breakdown: Json | null;
          source: Database["public"]["Enums"]["match_source"];
          teamed_up_at: string | null;
          user_a: string;
          user_b: string;
        };
        ComputedFields: never;
        Insert: {
          a_responded_at?: string | null;
          a_response?: Database["public"]["Enums"]["match_response"];
          b_responded_at?: string | null;
          b_response?: Database["public"]["Enums"]["match_response"];
          created_at?: string;
          event_id?: string | null;
          id?: string;
          idea_id?: string | null;
          reason_for_a?: string | null;
          reason_for_b?: string | null;
          revealed_at?: string | null;
          run_id?: string | null;
          score?: number | null;
          score_breakdown?: Json | null;
          source: Database["public"]["Enums"]["match_source"];
          teamed_up_at?: string | null;
          user_a: string;
          user_b: string;
        };
        Update: {
          a_responded_at?: string | null;
          a_response?: Database["public"]["Enums"]["match_response"];
          b_responded_at?: string | null;
          b_response?: Database["public"]["Enums"]["match_response"];
          created_at?: string;
          event_id?: string | null;
          id?: string;
          idea_id?: string | null;
          reason_for_a?: string | null;
          reason_for_b?: string | null;
          revealed_at?: string | null;
          run_id?: string | null;
          score?: number | null;
          score_breakdown?: Json | null;
          source?: Database["public"]["Enums"]["match_source"];
          teamed_up_at?: string | null;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_idea_id_fkey";
            columns: ["idea_id"];
            isOneToOne: false;
            referencedRelation: "ideas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "match_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_user_a_fkey";
            columns: ["user_a"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_user_a_fkey";
            columns: ["user_a"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_user_b_fkey";
            columns: ["user_b"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_user_b_fkey";
            columns: ["user_b"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_log: {
        Row: {
          channel: Database["public"]["Enums"]["notify_channel"];
          created_at: string;
          id: string;
          kind: string;
          local_date: string;
          payload: NonNullable<Json>;
          provider_id: string | null;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          channel: Database["public"]["Enums"]["notify_channel"];
          created_at?: string;
          id?: string;
          kind: string;
          local_date: string;
          payload?: NonNullable<Json>;
          provider_id?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["notify_channel"];
          created_at?: string;
          id?: string;
          kind?: string;
          local_date?: string;
          payload?: NonNullable<Json>;
          provider_id?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          domains: string[];
          embedded_at: string | null;
          embedding: string | null;
          experience_level: Database["public"]["Enums"]["experience_level"] | null;
          extracted_at: string | null;
          extraction_model: string | null;
          skills: string[];
          stack: string[];
          summary: string | null;
          user_edited: boolean;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          domains?: string[];
          embedded_at?: string | null;
          embedding?: string | null;
          experience_level?: Database["public"]["Enums"]["experience_level"] | null;
          extracted_at?: string | null;
          extraction_model?: string | null;
          skills?: string[];
          stack?: string[];
          summary?: string | null;
          user_edited?: boolean;
          user_id: string;
        };
        Update: {
          domains?: string[];
          embedded_at?: string | null;
          embedding?: string | null;
          experience_level?: Database["public"]["Enums"]["experience_level"] | null;
          extracted_at?: string | null;
          extraction_model?: string | null;
          skills?: string[];
          stack?: string[];
          summary?: string | null;
          user_edited?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          joined_at: string;
          team_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          joined_at?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          created_by: string;
          event_id: string | null;
          id: string;
          idea_id: string | null;
          match_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          event_id?: string | null;
          id?: string;
          idea_id?: string | null;
          match_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          event_id?: string | null;
          id?: string;
          idea_id?: string | null;
          match_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "active_pool";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_idea_id_fkey";
            columns: ["idea_id"];
            isOneToOne: false;
            referencedRelation: "ideas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teams_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          campus: string;
          cornell_email: string;
          created_at: string;
          github_url: string | null;
          id: string;
          intents: Database["public"]["Enums"]["user_intent"][];
          is_admin: boolean;
          is_organizer: boolean;
          last_active_at: string;
          linkedin_text: string | null;
          linkedin_url: string | null;
          name: string | null;
          notify_channel: Database["public"]["Enums"]["notify_channel"];
          onboarded_at: string | null;
          onboarding_started_at: string | null;
          paused_until: string | null;
          phone_e164: string | null;
          raw_bio: string | null;
          role: Database["public"]["Enums"]["user_role"] | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          campus?: string;
          cornell_email: string;
          created_at?: string;
          github_url?: string | null;
          id: string;
          intents?: Database["public"]["Enums"]["user_intent"][];
          is_admin?: boolean;
          is_organizer?: boolean;
          last_active_at?: string;
          linkedin_text?: string | null;
          linkedin_url?: string | null;
          name?: string | null;
          notify_channel?: Database["public"]["Enums"]["notify_channel"];
          onboarded_at?: string | null;
          onboarding_started_at?: string | null;
          paused_until?: string | null;
          phone_e164?: string | null;
          raw_bio?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
          updated_at?: string;
        };
        Update: {
          campus?: string;
          cornell_email?: string;
          created_at?: string;
          github_url?: string | null;
          id?: string;
          intents?: Database["public"]["Enums"]["user_intent"][];
          is_admin?: boolean;
          is_organizer?: boolean;
          last_active_at?: string;
          linkedin_text?: string | null;
          linkedin_url?: string | null;
          name?: string | null;
          notify_channel?: Database["public"]["Enums"]["notify_channel"];
          onboarded_at?: string | null;
          onboarding_started_at?: string | null;
          paused_until?: string | null;
          phone_e164?: string | null;
          raw_bio?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      active_pool: {
        Row: {
          campus: string | null;
          cornell_email: string | null;
          created_at: string | null;
          github_url: string | null;
          id: string | null;
          intents: Database["public"]["Enums"]["user_intent"][] | null;
          is_admin: boolean | null;
          is_organizer: boolean | null;
          last_active_at: string | null;
          linkedin_text: string | null;
          linkedin_url: string | null;
          name: string | null;
          notify_channel: Database["public"]["Enums"]["notify_channel"] | null;
          onboarded_at: string | null;
          onboarding_started_at: string | null;
          paused_until: string | null;
          phone_e164: string | null;
          raw_bio: string | null;
          role: Database["public"]["Enums"]["user_role"] | null;
          updated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          campus?: string | null;
          cornell_email?: string | null;
          created_at?: string | null;
          github_url?: string | null;
          id?: string | null;
          intents?: Database["public"]["Enums"]["user_intent"][] | null;
          is_admin?: boolean | null;
          is_organizer?: boolean | null;
          last_active_at?: string | null;
          linkedin_text?: string | null;
          linkedin_url?: string | null;
          name?: string | null;
          notify_channel?: Database["public"]["Enums"]["notify_channel"] | null;
          onboarded_at?: string | null;
          onboarding_started_at?: string | null;
          paused_until?: string | null;
          phone_e164?: string | null;
          raw_bio?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
          updated_at?: string | null;
        };
        Update: {
          campus?: string | null;
          cornell_email?: string | null;
          created_at?: string | null;
          github_url?: string | null;
          id?: string | null;
          intents?: Database["public"]["Enums"]["user_intent"][] | null;
          is_admin?: boolean | null;
          is_organizer?: boolean | null;
          last_active_at?: string | null;
          linkedin_text?: string | null;
          linkedin_url?: string | null;
          name?: string | null;
          notify_channel?: Database["public"]["Enums"]["notify_channel"] | null;
          onboarded_at?: string | null;
          onboarding_started_at?: string | null;
          paused_until?: string | null;
          phone_e164?: string | null;
          raw_bio?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      display_name: { Args: { p_name: string }; Returns: string };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_organizer: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_team_member: { Args: { p_team_id: string }; Returns: boolean };
      public_board_ideas: {
        Args: { p_event_slug?: string; p_limit?: number; p_offset?: number };
        Returns: {
          created_at: string;
          domain: string;
          event_id: string;
          featured: boolean;
          id: string;
          owner_display: string;
          pitch: string;
          scope: Database["public"]["Enums"]["idea_scope"];
          skills_needed: string[];
        }[];
      };
      public_board_people: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_role?: Database["public"]["Enums"]["user_role"];
        };
        Returns: {
          display_name: string;
          domains: string[];
          experience_level: Database["public"]["Enums"]["experience_level"];
          role: Database["public"]["Enums"]["user_role"];
          skills: string[];
          stack: string[];
          summary: string;
          user_id: string;
        }[];
      };
    };
    Enums: {
      experience_level: "beginner" | "intermediate" | "advanced";
      idea_scope: "weekend" | "few_weeks" | "ongoing";
      idea_status: "open" | "filled" | "archived";
      match_response: "pending" | "interested" | "pass";
      match_source: "admin" | "board" | "nightly" | "curated";
      notify_channel: "email" | "sms" | "slack" | "none";
      user_intent: "hackathon" | "side_project" | "cofounder";
      user_role: "idea" | "builder" | "both";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      experience_level: ["beginner", "intermediate", "advanced"],
      idea_scope: ["weekend", "few_weeks", "ongoing"],
      idea_status: ["open", "filled", "archived"],
      match_response: ["pending", "interested", "pass"],
      match_source: ["admin", "board", "nightly", "curated"],
      notify_channel: ["email", "sms", "slack", "none"],
      user_intent: ["hackathon", "side_project", "cofounder"],
      user_role: ["idea", "builder", "both"],
    },
  },
} as const;
