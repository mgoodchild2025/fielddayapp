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
      account_deletion_logs: {
        Row: {
          email_hash: string | null
          id: string
          ip_address: string | null
          organization_id: string | null
          reason: string | null
          requested_at: string
          user_id: string
        }
        Insert: {
          email_hash?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          reason?: string | null
          requested_at?: string
          user_id: string
        }
        Update: {
          email_hash?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          reason?: string | null
          requested_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience_type: string
          body: string
          cc_admins: boolean
          cc_self: boolean
          channel: string
          created_at: string | null
          email_sent: boolean
          id: string
          league_id: string | null
          message_class: string
          organization_id: string
          recipient_user_ids: string[] | null
          scheduled_for: string | null
          sent_at: string | null
          sent_by: string | null
          team_id: string | null
          title: string
        }
        Insert: {
          audience_type?: string
          body: string
          cc_admins?: boolean
          cc_self?: boolean
          channel?: string
          created_at?: string | null
          email_sent?: boolean
          id?: string
          league_id?: string | null
          message_class?: string
          organization_id: string
          recipient_user_ids?: string[] | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          team_id?: string | null
          title: string
        }
        Update: {
          audience_type?: string
          body?: string
          cc_admins?: boolean
          cc_self?: boolean
          channel?: string
          created_at?: string | null
          email_sent?: boolean
          id?: string
          league_id?: string | null
          message_class?: string
          organization_id?: string
          recipient_user_ids?: string[] | null
          scheduled_for?: string | null
          sent_at?: string | null
          sent_by?: string | null
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          target_id: string | null
          target_label: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_matches: {
        Row: {
          bracket_id: string
          court: string | null
          created_at: string | null
          game_id: string | null
          id: string
          is_bye: boolean
          loser_to_match_id: string | null
          loser_to_slot: number | null
          match_number: number
          medal_match: string | null
          notes: string | null
          organization_id: string
          round_number: number
          scheduled_at: string | null
          score1: number | null
          score2: number | null
          sets: Json | null
          status: string
          team1_id: string | null
          team1_label: string | null
          team1_seed: number | null
          team2_id: string | null
          team2_label: string | null
          team2_seed: number | null
          winner_team_id: string | null
          winner_to_match_id: string | null
          winner_to_slot: number | null
        }
        Insert: {
          bracket_id: string
          court?: string | null
          created_at?: string | null
          game_id?: string | null
          id?: string
          is_bye?: boolean
          loser_to_match_id?: string | null
          loser_to_slot?: number | null
          match_number: number
          medal_match?: string | null
          notes?: string | null
          organization_id: string
          round_number: number
          scheduled_at?: string | null
          score1?: number | null
          score2?: number | null
          sets?: Json | null
          status?: string
          team1_id?: string | null
          team1_label?: string | null
          team1_seed?: number | null
          team2_id?: string | null
          team2_label?: string | null
          team2_seed?: number | null
          winner_team_id?: string | null
          winner_to_match_id?: string | null
          winner_to_slot?: number | null
        }
        Update: {
          bracket_id?: string
          court?: string | null
          created_at?: string | null
          game_id?: string | null
          id?: string
          is_bye?: boolean
          loser_to_match_id?: string | null
          loser_to_slot?: number | null
          match_number?: number
          medal_match?: string | null
          notes?: string | null
          organization_id?: string
          round_number?: number
          scheduled_at?: string | null
          score1?: number | null
          score2?: number | null
          sets?: Json | null
          status?: string
          team1_id?: string | null
          team1_label?: string | null
          team1_seed?: number | null
          team2_id?: string | null
          team2_label?: string | null
          team2_seed?: number | null
          winner_team_id?: string | null
          winner_to_match_id?: string | null
          winner_to_slot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bracket_matches_bracket_id_fkey"
            columns: ["bracket_id"]
            isOneToOne: false
            referencedRelation: "brackets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_loser_to_match_id_fkey"
            columns: ["loser_to_match_id"]
            isOneToOne: false
            referencedRelation: "bracket_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_winner_to_match_id_fkey"
            columns: ["winner_to_match_id"]
            isOneToOne: false
            referencedRelation: "bracket_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      brackets: {
        Row: {
          bracket_size: number
          bracket_type: string
          created_at: string | null
          division_id: string | null
          id: string
          league_id: string
          name: string
          organization_id: string
          published_at: string | null
          round_names: Json | null
          seeding_method: string
          status: string
          teams_advancing: number
          third_place_game: boolean
        }
        Insert: {
          bracket_size?: number
          bracket_type?: string
          created_at?: string | null
          division_id?: string | null
          id?: string
          league_id: string
          name?: string
          organization_id: string
          published_at?: string | null
          round_names?: Json | null
          seeding_method?: string
          status?: string
          teams_advancing?: number
          third_place_game?: boolean
        }
        Update: {
          bracket_size?: number
          bracket_type?: string
          created_at?: string | null
          division_id?: string | null
          id?: string
          league_id?: string
          name?: string
          organization_id?: string
          published_at?: string | null
          round_names?: Json | null
          seeding_method?: string
          status?: string
          teams_advancing?: number
          third_place_game?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "brackets_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brackets_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brackets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          organization_id: string
          quantity: number
          updated_at: string
          user_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          organization_id: string
          quantity?: number
          updated_at?: string
          user_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          organization_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "merchandise_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "merchandise_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          active: boolean
          applies_to: string
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          league_id: string | null
          max_uses: number | null
          organization_id: string
          type: string
          updated_at: string | null
          use_count: number
          value: number
        }
        Insert: {
          active?: boolean
          applies_to?: string
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          league_id?: string | null
          max_uses?: number | null
          organization_id: string
          type: string
          updated_at?: string | null
          use_count?: number
          value: number
        }
        Update: {
          active?: boolean
          applies_to?: string
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          league_id?: string | null
          max_uses?: number | null
          organization_id?: string
          type?: string
          updated_at?: string | null
          use_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          created_at: string | null
          id: string
          league_id: string
          name: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          league_id: string
          name: string
          organization_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          league_id?: string
          name?: string
          organization_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "divisions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_in_registrations: {
        Row: {
          checked_in_at: string | null
          created_at: string | null
          id: string
          organization_id: string
          payment_id: string | null
          qr_token: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string | null
          id?: string
          organization_id: string
          payment_id?: string | null
          qr_token?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string
          payment_id?: string | null
          qr_token?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_in_registrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drop_in_registrations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "drop_in_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drop_in_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_in_sessions: {
        Row: {
          capacity: number
          created_at: string | null
          description: string | null
          id: string
          location: string | null
          name: string
          organization_id: string
          price_cents: number
          scheduled_at: string
          sport: string
          status: string
          updated_at: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name: string
          organization_id: string
          price_cents?: number
          scheduled_at: string
          sport?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          organization_id?: string
          price_cents?: number
          scheduled_at?: string
          sport?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drop_in_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          created_at: string
          digest: string
          id: string
          message: string
          method: string | null
          organization_id: string | null
          path: string | null
          router_kind: string | null
          stack: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          digest: string
          id?: string
          message: string
          method?: string | null
          organization_id?: string | null
          path?: string | null
          router_kind?: string | null
          stack?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          digest?: string
          id?: string
          message?: string
          method?: string | null
          organization_id?: string | null
          path?: string | null
          router_kind?: string | null
          stack?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      event_budget_items: {
        Row: {
          amount_cents: number
          budget_id: string
          cost_type: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          amount_cents: number
          budget_id: string
          cost_type?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          amount_cents?: number
          budget_id?: string
          cost_type?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_budget_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "event_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      event_budgets: {
        Row: {
          created_at: string
          expected_participants: number
          expected_teams: number
          id: string
          league_id: string
          notes: string | null
          organization_id: string
          pricing_model: string | null
          target_margin_pct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_participants?: number
          expected_teams?: number
          id?: string
          league_id: string
          notes?: string | null
          organization_id: string
          pricing_model?: string | null
          target_margin_pct?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_participants?: number
          expected_teams?: number
          id?: string
          league_id?: string
          notes?: string | null
          organization_id?: string
          pricing_model?: string | null
          target_margin_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_budgets_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_display_configs: {
        Row: {
          config: Json
          enabled: boolean
          id: string
          league_id: string
          organization_id: string
          screen_number: number
          updated_at: string
        }
        Insert: {
          config?: Json
          enabled?: boolean
          id?: string
          league_id: string
          organization_id: string
          screen_number?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          enabled?: boolean
          id?: string
          league_id?: string
          organization_id?: string
          screen_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_display_configs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_display_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_expenses: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          incurred_on: string | null
          league_id: string
          notes: string | null
          organization_id: string
          session_id: string | null
          vendor: string | null
        }
        Insert: {
          amount_cents: number
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          incurred_on?: string | null
          league_id: string
          notes?: string | null
          organization_id: string
          session_id?: string | null
          vendor?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          incurred_on?: string | null
          league_id?: string
          notes?: string | null
          organization_id?: string
          session_id?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_interest: {
        Row: {
          created_at: string
          email: string
          id: string
          league_id: string
          name: string | null
          notified_at: string | null
          organization_id: string
          source: string
          unsubscribed_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          league_id: string
          name?: string | null
          notified_at?: string | null
          organization_id: string
          source?: string
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          league_id?: string
          name?: string | null
          notified_at?: string | null
          organization_id?: string
          source?: string
          unsubscribed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_interest_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_interest_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_media: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          caption: string | null
          cloudinary_public_id: string
          cloudinary_url: string
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          league_id: string
          media_type: string
          organization_id: string
          status: string
          thumbnail_url: string | null
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          cloudinary_public_id: string
          cloudinary_url: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          league_id: string
          media_type?: string
          organization_id: string
          status?: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          cloudinary_public_id?: string
          cloudinary_url?: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          league_id?: string
          media_type?: string
          organization_id?: string
          status?: string
          thumbnail_url?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_media_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_media_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_revenue: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          league_id: string
          notes: string | null
          organization_id: string
          received_on: string | null
          source: string | null
        }
        Insert: {
          amount_cents: number
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          league_id: string
          notes?: string | null
          organization_id: string
          received_on?: string | null
          source?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          league_id?: string
          notes?: string | null
          organization_id?: string
          received_on?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_revenue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_revenue_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_revenue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          capacity: number | null
          created_at: string
          duration_minutes: number
          id: string
          league_id: string
          location_override: string | null
          notes: string | null
          organization_id: string
          scheduled_at: string
          status: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          duration_minutes?: number
          id?: string
          league_id: string
          location_override?: string | null
          notes?: string | null
          organization_id: string
          scheduled_at: string
          status?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          duration_minutes?: number
          id?: string
          league_id?: string
          location_override?: string | null
          notes?: string | null
          organization_id?: string
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sponsors: {
        Row: {
          ad_image_url: string | null
          created_at: string
          display_order: number
          id: string
          league_id: string
          logo_url: string | null
          name: string | null
          organization_id: string
          sponsor_id: string | null
          tier: string
          website_url: string | null
        }
        Insert: {
          ad_image_url?: string | null
          created_at?: string
          display_order?: number
          id?: string
          league_id: string
          logo_url?: string | null
          name?: string | null
          organization_id: string
          sponsor_id?: string | null
          tier?: string
          website_url?: string | null
        }
        Update: {
          ad_image_url?: string | null
          created_at?: string
          display_order?: number
          id?: string
          league_id?: string
          logo_url?: string | null
          name?: string | null
          organization_id?: string
          sponsor_id?: string | null
          tier?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sponsors_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sponsors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sponsors_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "org_sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      game_results: {
        Row: {
          away_score: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          forfeit_team_id: string | null
          game_id: string
          home_score: number | null
          id: string
          is_forfeit: boolean
          organization_id: string
          sets: Json | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
        }
        Insert: {
          away_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          forfeit_team_id?: string | null
          game_id: string
          home_score?: number | null
          id?: string
          is_forfeit?: boolean
          organization_id: string
          sets?: Json | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Update: {
          away_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          forfeit_team_id?: string | null
          game_id?: string
          home_score?: number | null
          id?: string
          is_forfeit?: boolean
          organization_id?: string
          sets?: Json | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_results_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_forfeit_team_id_fkey"
            columns: ["forfeit_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rsvps: {
        Row: {
          created_at: string | null
          game_id: string
          id: string
          note: string | null
          organization_id: string
          status: string
          team_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          game_id: string
          id?: string
          note?: string | null
          organization_id: string
          status: string
          team_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          game_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          status?: string
          team_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rsvps_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rsvps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rsvps_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sms_reminder_logs: {
        Row: {
          game_id: string
          minutes_before: number
          sent_at: string
        }
        Insert: {
          game_id: string
          minutes_before: number
          sent_at?: string
        }
        Update: {
          game_id?: string
          minutes_before?: number
          sent_at?: string
        }
        Relationships: []
      }
      game_subs: {
        Row: {
          created_at: string
          expires_at: string
          game_id: string
          id: string
          invited_by: string
          invited_email: string
          message: string | null
          organization_id: string
          status: string
          team_id: string
          token: string
          user_id: string | null
          waiver_signature_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          game_id: string
          id?: string
          invited_by: string
          invited_email: string
          message?: string | null
          organization_id: string
          status?: string
          team_id: string
          token?: string
          user_id?: string | null
          waiver_signature_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          game_id?: string
          id?: string
          invited_by?: string
          invited_email?: string
          message?: string | null
          organization_id?: string
          status?: string
          team_id?: string
          token?: string
          user_id?: string | null
          waiver_signature_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_subs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_subs_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_subs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_subs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_subs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_subs_waiver_signature_id_fkey"
            columns: ["waiver_signature_id"]
            isOneToOne: false
            referencedRelation: "waiver_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          away_team_id: string | null
          away_team_label: string | null
          cancellation_reason: string | null
          court: string | null
          created_at: string | null
          division_id: string | null
          home_team_id: string | null
          home_team_label: string | null
          id: string
          league_id: string
          organization_id: string
          pool_id: string | null
          reminder_sent: string | null
          scheduled_at: string
          sms_reminder_sent: string | null
          status: string
          week_number: number | null
        }
        Insert: {
          away_team_id?: string | null
          away_team_label?: string | null
          cancellation_reason?: string | null
          court?: string | null
          created_at?: string | null
          division_id?: string | null
          home_team_id?: string | null
          home_team_label?: string | null
          id?: string
          league_id: string
          organization_id: string
          pool_id?: string | null
          reminder_sent?: string | null
          scheduled_at: string
          sms_reminder_sent?: string | null
          status?: string
          week_number?: number | null
        }
        Update: {
          away_team_id?: string | null
          away_team_label?: string | null
          cancellation_reason?: string | null
          court?: string | null
          created_at?: string | null
          division_id?: string | null
          home_team_id?: string | null
          home_team_label?: string | null
          id?: string
          league_id?: string
          organization_id?: string
          pool_id?: string | null
          reminder_sent?: string | null
          scheduled_at?: string
          sms_reminder_sent?: string | null
          status?: string
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "games_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      league_captain_prep_logs: {
        Row: {
          league_id: string
          sent_at: string
          team_id: string
        }
        Insert: {
          league_id: string
          sent_at?: string
          team_id: string
        }
        Update: {
          league_id?: string
          sent_at?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_captain_prep_logs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_captain_prep_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_documents: {
        Row: {
          created_at: string
          file_url: string
          id: string
          league_id: string
          organization_id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          league_id: string
          organization_id: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          league_id?: string
          organization_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_documents_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      league_merchandise: {
        Row: {
          item_id: string
          league_id: string
          price_override_cents: number | null
        }
        Insert: {
          item_id: string
          league_id: string
          price_override_cents?: number | null
        }
        Update: {
          item_id?: string
          league_id?: string
          price_override_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "league_merchandise_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "merchandise_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_merchandise_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_organizers: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          league_id: string
          organization_id: string
          show_contact_info: boolean
          status: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          league_id: string
          organization_id: string
          show_contact_info?: boolean
          status?: string
          token?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          league_id?: string
          organization_id?: string
          show_contact_info?: boolean
          status?: string
          token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_organizers_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_organizers_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_organizers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_organizers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rule_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          organization_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          organization_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_rule_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      league_waiver_reminder_logs: {
        Row: {
          id: string
          league_id: string
          sent_at: string
          team_id: string
        }
        Insert: {
          id?: string
          league_id: string
          sent_at?: string
          team_id: string
        }
        Update: {
          id?: string
          league_id?: string
          sent_at?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_waiver_reminder_logs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_waiver_reminder_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          access_token: string
          advertised: boolean
          age_group: string | null
          bracket_visibility: string
          calendar_token: string | null
          checkin_enabled: boolean
          created_at: string | null
          created_by: string | null
          currency: string
          days_of_week: string[] | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          documents_visibility: string
          drop_in_price_cents: number | null
          early_bird_deadline: string | null
          early_bird_price_cents: number | null
          event_type: string
          featured: boolean
          format_content: string | null
          format_pdf_url: string | null
          game_end_time: string | null
          game_start_time: string | null
          id: string
          league_type: string
          logo_url: string | null
          max_participants: number | null
          max_team_size: number | null
          max_teams: number | null
          min_team_size: number | null
          name: string
          notify_on_open: boolean
          officiated: string | null
          organization_id: string
          organizer_email: string | null
          organizer_name: string | null
          organizer_phone: string | null
          payment_instructions: string | null
          payment_methods: string[] | null
          payment_mode: string
          pickup_join_policy: string
          price_cents: number
          registration_closes_at: string | null
          registration_mode: string
          registration_opens_at: string | null
          rule_template_id: string | null
          rules_content: string | null
          rules_pdf_url: string | null
          schedule_published: boolean
          schedule_visibility: string
          season_end_date: string | null
          season_pass_prorate: boolean
          season_start_date: string | null
          show_org_sponsors: boolean
          skill_level: string | null
          slug: string
          sport: string | null
          standings_pts_method: string
          standings_visibility: string
          stats_public: boolean
          status: string
          team_join_policy: string
          teaser_text: string | null
          updated_at: string | null
          venue_address: string | null
          venue_maps_url: string | null
          venue_name: string | null
          venue_surface: string | null
          venue_type: string | null
          volleyball_standings_mode: string
          waiver_version_id: string | null
        }
        Insert: {
          access_token?: string
          advertised?: boolean
          age_group?: string | null
          bracket_visibility?: string
          calendar_token?: string | null
          checkin_enabled?: boolean
          created_at?: string | null
          created_by?: string | null
          currency?: string
          days_of_week?: string[] | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          documents_visibility?: string
          drop_in_price_cents?: number | null
          early_bird_deadline?: string | null
          early_bird_price_cents?: number | null
          event_type?: string
          featured?: boolean
          format_content?: string | null
          format_pdf_url?: string | null
          game_end_time?: string | null
          game_start_time?: string | null
          id?: string
          league_type: string
          logo_url?: string | null
          max_participants?: number | null
          max_team_size?: number | null
          max_teams?: number | null
          min_team_size?: number | null
          name: string
          notify_on_open?: boolean
          officiated?: string | null
          organization_id: string
          organizer_email?: string | null
          organizer_name?: string | null
          organizer_phone?: string | null
          payment_instructions?: string | null
          payment_methods?: string[] | null
          payment_mode?: string
          pickup_join_policy?: string
          price_cents?: number
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          rule_template_id?: string | null
          rules_content?: string | null
          rules_pdf_url?: string | null
          schedule_published?: boolean
          schedule_visibility?: string
          season_end_date?: string | null
          season_pass_prorate?: boolean
          season_start_date?: string | null
          show_org_sponsors?: boolean
          skill_level?: string | null
          slug: string
          sport?: string | null
          standings_pts_method?: string
          standings_visibility?: string
          stats_public?: boolean
          status?: string
          team_join_policy?: string
          teaser_text?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_maps_url?: string | null
          venue_name?: string | null
          venue_surface?: string | null
          venue_type?: string | null
          volleyball_standings_mode?: string
          waiver_version_id?: string | null
        }
        Update: {
          access_token?: string
          advertised?: boolean
          age_group?: string | null
          bracket_visibility?: string
          calendar_token?: string | null
          checkin_enabled?: boolean
          created_at?: string | null
          created_by?: string | null
          currency?: string
          days_of_week?: string[] | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          documents_visibility?: string
          drop_in_price_cents?: number | null
          early_bird_deadline?: string | null
          early_bird_price_cents?: number | null
          event_type?: string
          featured?: boolean
          format_content?: string | null
          format_pdf_url?: string | null
          game_end_time?: string | null
          game_start_time?: string | null
          id?: string
          league_type?: string
          logo_url?: string | null
          max_participants?: number | null
          max_team_size?: number | null
          max_teams?: number | null
          min_team_size?: number | null
          name?: string
          notify_on_open?: boolean
          officiated?: string | null
          organization_id?: string
          organizer_email?: string | null
          organizer_name?: string | null
          organizer_phone?: string | null
          payment_instructions?: string | null
          payment_methods?: string[] | null
          payment_mode?: string
          pickup_join_policy?: string
          price_cents?: number
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          rule_template_id?: string | null
          rules_content?: string | null
          rules_pdf_url?: string | null
          schedule_published?: boolean
          schedule_visibility?: string
          season_end_date?: string | null
          season_pass_prorate?: boolean
          season_start_date?: string | null
          show_org_sponsors?: boolean
          skill_level?: string | null
          slug?: string
          sport?: string | null
          standings_pts_method?: string
          standings_visibility?: string
          stats_public?: boolean
          status?: string
          team_join_policy?: string
          teaser_text?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_maps_url?: string | null
          venue_name?: string | null
          venue_surface?: string | null
          venue_type?: string | null
          volleyball_standings_mode?: string
          waiver_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_rule_template_id_fkey"
            columns: ["rule_template_id"]
            isOneToOne: false
            referencedRelation: "league_rule_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_waiver_fkey"
            columns: ["waiver_version_id"]
            isOneToOne: false
            referencedRelation: "waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_document_versions: {
        Row: {
          content: string
          created_at: string
          document_id: string
          effective_date: string | null
          id: string
          notes: string | null
          published_at: string
          published_by: string | null
          reconsent_summary: string | null
          requires_reconsent: boolean
          version: string
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          effective_date?: string | null
          id?: string
          notes?: string | null
          published_at?: string
          published_by?: string | null
          reconsent_summary?: string | null
          requires_reconsent?: boolean
          version: string
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          effective_date?: string | null
          id?: string
          notes?: string | null
          published_at?: string
          published_by?: string | null
          reconsent_summary?: string | null
          requires_reconsent?: boolean
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string
          created_at: string
          description: string | null
          effective_date: string | null
          id: string
          is_published: boolean
          published_at: string | null
          published_content: string | null
          reconsent_summary: string | null
          requires_reconsent: boolean
          slug: string
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          description?: string | null
          effective_date?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          published_content?: string | null
          reconsent_summary?: string | null
          requires_reconsent?: boolean
          slug: string
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          description?: string | null
          effective_date?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          published_content?: string | null
          reconsent_summary?: string | null
          requires_reconsent?: boolean
          slug?: string
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      live_streams: {
        Row: {
          created_at: string
          detected_via: string
          embed_url: string | null
          ended_at: string | null
          id: string
          league_id: string | null
          organization_id: string
          platform: string
          started_at: string
          status: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          detected_via?: string
          embed_url?: string | null
          ended_at?: string | null
          id?: string
          league_id?: string | null
          organization_id: string
          platform: string
          started_at?: string
          status?: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          detected_via?: string
          embed_url?: string | null
          ended_at?: string | null
          id?: string
          league_id?: string | null
          organization_id?: string
          platform?: string
          started_at?: string
          status?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_streams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      merchandise_items: {
        Row: {
          additional_images: Json
          cost_cents: number | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number
          name: string
          organization_id: string
          price_cents: number
          shop_enabled: boolean
          stock_quantity: number | null
        }
        Insert: {
          additional_images?: Json
          cost_cents?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          organization_id: string
          price_cents: number
          shop_enabled?: boolean
          stock_quantity?: number | null
        }
        Update: {
          additional_images?: Json
          cost_cents?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          organization_id?: string
          price_cents?: number
          shop_enabled?: boolean
          stock_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "merchandise_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      merchandise_orders: {
        Row: {
          amount_paid_cents: number | null
          buyer_email: string | null
          buyer_name: string | null
          created_at: string
          created_by_admin: string | null
          discount_cents: number
          discount_code_id: string | null
          fulfilled_at: string | null
          id: string
          item_id: string
          league_id: string | null
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_by: string | null
          payment_id: string | null
          payment_method: string | null
          quantity: number
          registration_id: string | null
          sale_source: string
          status: string
          unit_price_cents: number
          user_id: string | null
          variant_id: string | null
        }
        Insert: {
          amount_paid_cents?: number | null
          buyer_email?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by_admin?: string | null
          discount_cents?: number
          discount_code_id?: string | null
          fulfilled_at?: string | null
          id?: string
          item_id: string
          league_id?: string | null
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          paid_by?: string | null
          payment_id?: string | null
          payment_method?: string | null
          quantity?: number
          registration_id?: string | null
          sale_source?: string
          status?: string
          unit_price_cents: number
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          amount_paid_cents?: number | null
          buyer_email?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by_admin?: string | null
          discount_cents?: number
          discount_code_id?: string | null
          fulfilled_at?: string | null
          id?: string
          item_id?: string
          league_id?: string | null
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_id?: string | null
          payment_method?: string | null
          quantity?: number
          registration_id?: string | null
          sale_source?: string
          status?: string
          unit_price_cents?: number
          user_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchandise_orders_created_by_admin_fkey"
            columns: ["created_by_admin"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "merchandise_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_orders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "merchandise_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchandise_variants: {
        Row: {
          cost_cents: number | null
          id: string
          item_id: string
          label: string
          sort_order: number
          stock_quantity: number | null
        }
        Insert: {
          cost_cents?: number | null
          id?: string
          item_id: string
          label: string
          sort_order?: number
          stock_quantity?: number | null
        }
        Update: {
          cost_cents?: number | null
          id?: string
          item_id?: string
          label?: string
          sort_order?: number
          stock_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "merchandise_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "merchandise_items"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      medal_recipients: {
        Row: {
          display_name: string
          id: string
          medal_id: string
          organization_id: string
          user_id: string | null
        }
        Insert: {
          display_name: string
          id?: string
          medal_id: string
          organization_id: string
          user_id?: string | null
        }
        Update: {
          display_name?: string
          id?: string
          medal_id?: string
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medal_recipients_medal_id_fkey"
            columns: ["medal_id"]
            isOneToOne: false
            referencedRelation: "medals"
            referencedColumns: ["id"]
          },
        ]
      }
      medals: {
        Row: {
          awarded_at: string
          bracket_id: string | null
          deciding_match_id: string | null
          id: string
          label: string
          league_id: string
          league_name: string
          organization_id: string
          placement: string
          team_id: string | null
          team_name: string
        }
        Insert: {
          awarded_at?: string
          bracket_id?: string | null
          deciding_match_id?: string | null
          id?: string
          label: string
          league_id: string
          league_name: string
          organization_id: string
          placement: string
          team_id?: string | null
          team_name: string
        }
        Update: {
          awarded_at?: string
          bracket_id?: string | null
          deciding_match_id?: string | null
          id?: string
          label?: string
          league_id?: string
          league_name?: string
          organization_id?: string
          placement?: string
          team_id?: string | null
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "medals_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          organization_id: string
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          organization_id: string
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          organization_id?: string
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_branding: {
        Row: {
          bg_color: string | null
          body_font: string | null
          checkin_sound: string | null
          contact_email: string | null
          custom_domain: string | null
          favicon_url: string | null
          heading_font: string | null
          hero_image_url: string | null
          id: string
          logo_url: string | null
          onboarding_dismissed_at: string | null
          organization_id: string
          primary_color: string | null
          railway_cname_host: string | null
          railway_cname_value: string | null
          railway_domain_id: string | null
          railway_txt_host: string | null
          railway_txt_value: string | null
          secondary_color: string | null
          site_theme: string
          social_facebook: string | null
          social_instagram: string | null
          social_tiktok: string | null
          social_x: string | null
          social_youtube: string | null
          tagline: string | null
          text_color: string | null
          timezone: string
          updated_at: string | null
          website_configured_at: string | null
        }
        Insert: {
          bg_color?: string | null
          body_font?: string | null
          checkin_sound?: string | null
          contact_email?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          heading_font?: string | null
          hero_image_url?: string | null
          id?: string
          logo_url?: string | null
          onboarding_dismissed_at?: string | null
          organization_id: string
          primary_color?: string | null
          railway_cname_host?: string | null
          railway_cname_value?: string | null
          railway_domain_id?: string | null
          railway_txt_host?: string | null
          railway_txt_value?: string | null
          secondary_color?: string | null
          site_theme?: string
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_x?: string | null
          social_youtube?: string | null
          tagline?: string | null
          text_color?: string | null
          timezone?: string
          updated_at?: string | null
          website_configured_at?: string | null
        }
        Update: {
          bg_color?: string | null
          body_font?: string | null
          checkin_sound?: string | null
          contact_email?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          heading_font?: string | null
          hero_image_url?: string | null
          id?: string
          logo_url?: string | null
          onboarding_dismissed_at?: string | null
          organization_id?: string
          primary_color?: string | null
          railway_cname_host?: string | null
          railway_cname_value?: string | null
          railway_domain_id?: string | null
          railway_txt_host?: string | null
          railway_txt_value?: string | null
          secondary_color?: string | null
          site_theme?: string
          social_facebook?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_x?: string | null
          social_youtube?: string | null
          tagline?: string | null
          text_color?: string | null
          timezone?: string
          updated_at?: string | null
          website_configured_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_data_retention_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          notes: string | null
          organization_id: string
          player_count: number | null
          triggered_by: string
          triggered_by_user: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          notes?: string | null
          organization_id: string
          player_count?: number | null
          triggered_by: string
          triggered_by_user?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          notes?: string | null
          organization_id?: string
          player_count?: number | null
          triggered_by?: string
          triggered_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_data_retention_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_export_jobs: {
        Row: {
          archive_size_bytes: number | null
          completed_at: string | null
          downloaded_at: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          ip_address: string | null
          organization_id: string
          requested_at: string
          requested_by: string
          started_at: string | null
          status: string
          storage_path: string | null
        }
        Insert: {
          archive_size_bytes?: number | null
          completed_at?: string | null
          downloaded_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          organization_id: string
          requested_at?: string
          requested_by: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          archive_size_bytes?: number | null
          completed_at?: string | null
          downloaded_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string
          requested_at?: string
          requested_by?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_export_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_export_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_feature_overrides: {
        Row: {
          created_at: string | null
          enabled: boolean
          feature: string
          id: string
          limit_value: number | null
          note: string | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled: boolean
          feature: string
          id?: string
          limit_value?: number | null
          note?: string | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          feature?: string
          id?: string
          limit_value?: number | null
          note?: string | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_feature_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          invited_email: string | null
          joined_at: string | null
          organization_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_email?: string | null
          joined_at?: string | null
          organization_id: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          invited_email?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_nav_links: {
        Row: {
          created_at: string
          id: string
          label: string
          link_type: string
          open_in_new_tab: boolean
          organization_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          link_type?: string
          open_in_new_tab?: boolean
          organization_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          link_type?: string
          open_in_new_tab?: boolean
          organization_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_nav_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_notification_settings: {
        Row: {
          captain_prep_email_enabled: boolean
          email_game_reminders_enabled: boolean
          email_reminder_hours_before: number
          merch_order_notifications_enabled: boolean
          organization_id: string
          payment_failure_notifications_enabled: boolean
          registration_notification_email: string | null
          registration_notifications_enabled: boolean
          sms_game_reminders_enabled: boolean
          updated_at: string
        }
        Insert: {
          captain_prep_email_enabled?: boolean
          email_game_reminders_enabled?: boolean
          email_reminder_hours_before?: number
          merch_order_notifications_enabled?: boolean
          organization_id: string
          payment_failure_notifications_enabled?: boolean
          registration_notification_email?: string | null
          registration_notifications_enabled?: boolean
          sms_game_reminders_enabled?: boolean
          updated_at?: string
        }
        Update: {
          captain_prep_email_enabled?: boolean
          email_game_reminders_enabled?: boolean
          email_reminder_hours_before?: number
          merch_order_notifications_enabled?: boolean
          organization_id?: string
          payment_failure_notifications_enabled?: boolean
          registration_notification_email?: string | null
          registration_notifications_enabled?: boolean
          sms_game_reminders_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_overhead_expenses: {
        Row: {
          amount_cents: number
          applies_to: string
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          incurred_on: string | null
          notes: string | null
          organization_id: string
          period: string
        }
        Insert: {
          amount_cents: number
          applies_to?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          incurred_on?: string | null
          notes?: string | null
          organization_id: string
          period?: string
        }
        Update: {
          amount_cents?: number
          applies_to?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          incurred_on?: string | null
          notes?: string | null
          organization_id?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_overhead_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_overhead_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_payment_settings: {
        Row: {
          created_at: string
          id: string
          manual_payment_instructions: string | null
          organization_id: string
          registration_manual_instructions: string | null
          registration_payment_mode: string
          shop_payment_mode: string
          stripe_secret_key: string | null
          stripe_webhook_secret: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manual_payment_instructions?: string | null
          organization_id: string
          registration_manual_instructions?: string | null
          registration_payment_mode?: string
          shop_payment_mode?: string
          stripe_secret_key?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manual_payment_instructions?: string | null
          organization_id?: string
          registration_manual_instructions?: string | null
          registration_payment_mode?: string
          shop_payment_mode?: string
          stripe_secret_key?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_payment_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          display_order: number
          featured: boolean
          id: string
          organization_id: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          display_order?: number
          featured?: boolean
          id?: string
          organization_id: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          display_order?: number
          featured?: boolean
          id?: string
          organization_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_photos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tax_rates: {
        Row: {
          active: boolean
          applies_to: string
          created_at: string
          display_name: string
          id: string
          inclusive: boolean
          organization_id: string
          percentage: number
          stripe_tax_rate_id: string | null
        }
        Insert: {
          active?: boolean
          applies_to?: string
          created_at?: string
          display_name: string
          id?: string
          inclusive?: boolean
          organization_id: string
          percentage: number
          stripe_tax_rate_id?: string | null
        }
        Update: {
          active?: boolean
          applies_to?: string
          created_at?: string
          display_name?: string
          id?: string
          inclusive?: boolean
          organization_id?: string
          percentage?: number
          stripe_tax_rate_id?: string | null
        }
        Relationships: []
      }
      org_playoff_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          team_count: number
          tiers: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          team_count: number
          tiers: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          team_count?: number
          tiers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "org_playoff_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_site_content: {
        Row: {
          content: Json
          id: string
          organization_id: string
          section_key: string
          updated_at: string | null
        }
        Insert: {
          content?: Json
          id?: string
          organization_id: string
          section_key: string
          updated_at?: string | null
        }
        Update: {
          content?: Json
          id?: string
          organization_id?: string
          section_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_site_content_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_sms_reminders: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          message_template: string
          minutes_before: number
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          message_template?: string
          minutes_before: number
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          message_template?: string
          minutes_before?: number
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_sms_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_sponsors: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          logo_url: string | null
          name: string
          organization_id: string
          tier: string
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          logo_url?: string | null
          name: string
          organization_id: string
          tier?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          logo_url?: string | null
          name?: string
          organization_id?: string
          tier?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_sponsors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_staff: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_order: number
          id: string
          name: string
          organization_id: string
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          name: string
          organization_id: string
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          name?: string
          organization_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          created_at: string | null
          data_deidentified_at: string | null
          id: string
          maintenance_message: string | null
          maintenance_mode: boolean
          maintenance_until: string | null
          name: string
          slug: string
          sport: string | null
          status: string
          stripe_customer_id: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          data_deidentified_at?: string | null
          id?: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maintenance_until?: string | null
          name: string
          slug: string
          sport?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          data_deidentified_at?: string | null
          id?: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          maintenance_until?: string | null
          name?: string
          slug?: string
          sport?: string | null
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_plan_enrollments: {
        Row: {
          created_at: string | null
          id: string
          league_id: string
          organization_id: string
          plan_id: string
          registration_id: string
          status: string
          total_cents: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          league_id: string
          organization_id: string
          plan_id: string
          registration_id: string
          status?: string
          total_cents: number
        }
        Update: {
          created_at?: string | null
          id?: string
          league_id?: string
          organization_id?: string
          plan_id?: string
          registration_id?: string
          status?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_enrollments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_enrollments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_enrollments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plan_installments: {
        Row: {
          amount_cents: number
          created_at: string | null
          due_date: string
          enrollment_id: string
          id: string
          installment_number: number
          organization_id: string
          payment_id: string | null
          reminder_sent: string | null
          status: string
          stripe_checkout_session_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          due_date: string
          enrollment_id: string
          id?: string
          installment_number: number
          organization_id: string
          payment_id?: string | null
          reminder_sent?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          due_date?: string
          enrollment_id?: string
          id?: string
          installment_number?: number
          organization_id?: string
          payment_id?: string | null
          reminder_sent?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_installments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "payment_plan_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_installments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plan_installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          created_at: string | null
          enabled: boolean
          id: string
          installments: number
          interval_days: number
          league_id: string
          name: string
          organization_id: string
          updated_at: string | null
          upfront_percent: number
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          installments: number
          interval_days: number
          league_id: string
          name: string
          organization_id: string
          updated_at?: string | null
          upfront_percent?: number
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          installments?: number
          interval_days?: number
          league_id?: string
          name?: string
          organization_id?: string
          updated_at?: string | null
          upfront_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string
          discount_cents: number
          discount_code_id: string | null
          id: string
          league_id: string | null
          notes: string | null
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          payment_type: string
          registration_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          tax_cents: number
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          currency?: string
          discount_cents?: number
          discount_code_id?: string | null
          id?: string
          league_id?: string | null
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string
          registration_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string
          discount_cents?: number
          discount_code_id?: string | null
          id?: string
          league_id?: string | null
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string
          registration_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_invites: {
        Row: {
          email: string
          id: string
          invite_type: string
          invited_at: string
          league_id: string
          organization_id: string
          status: string
          token: string
        }
        Insert: {
          email: string
          id?: string
          invite_type?: string
          invited_at?: string
          league_id: string
          organization_id: string
          status?: string
          token?: string
        }
        Update: {
          email?: string
          id?: string
          invite_type?: string
          invited_at?: string
          league_id?: string
          organization_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_invites_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_configs: {
        Row: {
          enabled: boolean
          feature: string
          id: string
          limit_value: number | null
          tier: string
          updated_at: string | null
        }
        Insert: {
          enabled?: boolean
          feature: string
          id?: string
          limit_value?: number | null
          tier: string
          updated_at?: string | null
        }
        Update: {
          enabled?: boolean
          feature?: string
          id?: string
          limit_value?: number | null
          tier?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      player_bios: {
        Row: {
          hero_photo_url: string | null
          hidden_by_admin: boolean
          hometown: string | null
          id: string
          jersey_number: string | null
          organization_id: string
          position: string | null
          show_on_displays: boolean
          tagline: string | null
          updated_at: string
          user_id: string
          years_playing: number | null
        }
        Insert: {
          hero_photo_url?: string | null
          hidden_by_admin?: boolean
          hometown?: string | null
          id?: string
          jersey_number?: string | null
          organization_id: string
          position?: string | null
          show_on_displays?: boolean
          tagline?: string | null
          updated_at?: string
          user_id: string
          years_playing?: number | null
        }
        Update: {
          hero_photo_url?: string | null
          hidden_by_admin?: boolean
          hometown?: string | null
          id?: string
          jersey_number?: string | null
          organization_id?: string
          position?: string | null
          show_on_displays?: boolean
          tagline?: string | null
          updated_at?: string
          user_id?: string
          years_playing?: number | null
        }
        Relationships: []
      }
      player_consents: {
        Row: {
          consent_given: boolean
          consent_type: string
          consented_at: string
          created_at: string
          document_slug: string | null
          document_version: string | null
          id: string
          ip_address: string | null
          league_id: string | null
          legal_document_version_id: string | null
          organization_id: string
          user_agent: string | null
          user_id: string
          waiver_id: string | null
          waiver_signature_id: string | null
          withdrawn_at: string | null
        }
        Insert: {
          consent_given: boolean
          consent_type: string
          consented_at?: string
          created_at?: string
          document_slug?: string | null
          document_version?: string | null
          id?: string
          ip_address?: string | null
          league_id?: string | null
          legal_document_version_id?: string | null
          organization_id: string
          user_agent?: string | null
          user_id: string
          waiver_id?: string | null
          waiver_signature_id?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          consent_given?: boolean
          consent_type?: string
          consented_at?: string
          created_at?: string
          document_slug?: string | null
          document_version?: string | null
          id?: string
          ip_address?: string | null
          league_id?: string | null
          legal_document_version_id?: string | null
          organization_id?: string
          user_agent?: string | null
          user_id?: string
          waiver_id?: string | null
          waiver_signature_id?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_consents_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_consents_legal_document_version_id_fkey"
            columns: ["legal_document_version_id"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_consents_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "waivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_consents_waiver_signature_id_fkey"
            columns: ["waiver_signature_id"]
            isOneToOne: false
            referencedRelation: "waiver_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      player_details: {
        Row: {
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          how_did_you_hear: string | null
          id: string
          organization_id: string
          skill_level: string | null
          t_shirt_size: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          how_did_you_hear?: string | null
          id?: string
          organization_id: string
          skill_level?: string | null
          t_shirt_size?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          how_did_you_hear?: string | null
          id?: string
          organization_id?: string
          skill_level?: string | null
          t_shirt_size?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_details_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_details_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_email_reminder_logs: {
        Row: {
          created_at: string
          id: string
          log_date: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          log_date: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_email_reminder_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      player_game_day_sms_logs: {
        Row: {
          id: string
          log_date: string
          organization_id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          log_date: string
          organization_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          log_date?: string
          organization_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_game_stats: {
        Row: {
          created_at: string
          entered_by: string | null
          game_id: string
          id: string
          league_id: string
          organization_id: string
          stat_key: string
          team_id: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          game_id: string
          id?: string
          league_id: string
          organization_id: string
          stat_key: string
          team_id: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          game_id?: string
          id?: string
          league_id?: string
          organization_id?: string
          stat_key?: string
          team_id?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_game_stats_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playoff_configs: {
        Row: {
          advance_per_pool: Json | null
          created_at: string
          custom_seed_order: string[] | null
          excluded_team_ids: string[]
          id: string
          league_id: string
          organization_id: string
          seeding_method: string
        }
        Insert: {
          advance_per_pool?: Json | null
          created_at?: string
          custom_seed_order?: string[] | null
          excluded_team_ids?: string[]
          id?: string
          league_id: string
          organization_id: string
          seeding_method?: string
        }
        Update: {
          advance_per_pool?: Json | null
          created_at?: string
          custom_seed_order?: string[] | null
          excluded_team_ids?: string[]
          id?: string
          league_id?: string
          organization_id?: string
          seeding_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "playoff_configs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoff_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      playoff_tiers: {
        Row: {
          bracket_id: string | null
          bracket_type: string
          bye_seeds: number
          config_id: string
          created_at: string
          id: string
          inflow_from_tier_id: string | null
          inflow_round: number
          name: string
          organization_id: string
          seed_from: number
          seed_to: number
          sort_order: number
          third_place_game: boolean
        }
        Insert: {
          bracket_id?: string | null
          bracket_type?: string
          bye_seeds?: number
          config_id: string
          created_at?: string
          id?: string
          inflow_from_tier_id?: string | null
          inflow_round?: number
          name: string
          organization_id: string
          seed_from: number
          seed_to: number
          sort_order?: number
          third_place_game?: boolean
        }
        Update: {
          bracket_id?: string | null
          bracket_type?: string
          bye_seeds?: number
          config_id?: string
          created_at?: string
          id?: string
          inflow_from_tier_id?: string | null
          inflow_round?: number
          name?: string
          organization_id?: string
          seed_from?: number
          seed_to?: number
          sort_order?: number
          third_place_game?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "playoff_tiers_bracket_id_fkey"
            columns: ["bracket_id"]
            isOneToOne: false
            referencedRelation: "brackets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoff_tiers_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "playoff_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoff_tiers_inflow_from_tier_id_fkey"
            columns: ["inflow_from_tier_id"]
            isOneToOne: false
            referencedRelation: "playoff_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoff_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          created_at: string
          id: string
          league_id: string
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pools_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          email_reminders_enabled: boolean
          full_name: string
          id: string
          mfa_grace_until: string | null
          phone: string | null
          platform_role: string | null
          show_contact_info: boolean
          sms_game_day_enabled: boolean
          sms_opted_in: boolean
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          email_reminders_enabled?: boolean
          full_name: string
          id: string
          mfa_grace_until?: string | null
          phone?: string | null
          platform_role?: string | null
          show_contact_info?: boolean
          sms_game_day_enabled?: boolean
          sms_opted_in?: boolean
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          email_reminders_enabled?: boolean
          full_name?: string
          id?: string
          mfa_grace_until?: string | null
          phone?: string | null
          platform_role?: string | null
          show_contact_info?: boolean
          sms_game_day_enabled?: boolean
          sms_opted_in?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      registrations: {
        Row: {
          added_by_admin: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checkin_token: string
          created_at: string | null
          expires_at: string | null
          form_data: Json | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          league_id: string
          organization_id: string
          position: string | null
          registration_type: string
          session_id: string | null
          status: string
          team_id: string | null
          user_id: string | null
          waiver_signature_id: string | null
        }
        Insert: {
          added_by_admin?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_token?: string
          created_at?: string | null
          expires_at?: string | null
          form_data?: Json | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          league_id: string
          organization_id: string
          position?: string | null
          registration_type?: string
          session_id?: string | null
          status?: string
          team_id?: string | null
          user_id?: string | null
          waiver_signature_id?: string | null
        }
        Update: {
          added_by_admin?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_token?: string
          created_at?: string | null
          expires_at?: string | null
          form_data?: Json | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          league_id?: string
          organization_id?: string
          position?: string | null
          registration_type?: string
          session_id?: string | null
          status?: string
          team_id?: string | null
          user_id?: string | null
          waiver_signature_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_added_by_admin_fkey"
            columns: ["added_by_admin"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_waiver_signature_id_fkey"
            columns: ["waiver_signature_id"]
            isOneToOne: false
            referencedRelation: "waiver_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_notes: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          invite_role: string
          name: string
          note: string | null
          organization_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          invite_role?: string
          name: string
          note?: string | null
          organization_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          invite_role?: string
          name?: string
          note?: string | null
          organization_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_notes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      session_registrations: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          id: string
          is_walk_in: boolean
          league_id: string
          organization_id: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          id?: string
          is_walk_in?: boolean
          league_id: string
          organization_id: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          id?: string
          is_walk_in?: boolean
          league_id?: string
          organization_id?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_registrations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_registrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_registrations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_reminder_logs: {
        Row: {
          created_at: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_reminder_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          account_handle: string | null
          created_at: string
          external_account_id: string
          id: string
          last_synced_at: string | null
          live_sync_enabled: boolean
          organization_id: string
          platform: string
          sync_enabled: boolean
          uploads_playlist_id: string | null
        }
        Insert: {
          account_handle?: string | null
          created_at?: string
          external_account_id: string
          id?: string
          last_synced_at?: string | null
          live_sync_enabled?: boolean
          organization_id: string
          platform: string
          sync_enabled?: boolean
          uploads_playlist_id?: string | null
        }
        Update: {
          account_handle?: string | null
          created_at?: string
          external_account_id?: string
          id?: string
          last_synced_at?: string | null
          live_sync_enabled?: boolean
          organization_id?: string
          platform?: string
          sync_enabled?: boolean
          uploads_playlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media_items: {
        Row: {
          added_by: string | null
          approved: boolean
          caption: string | null
          connection_id: string | null
          created_at: string
          display_order: number
          embed_url: string | null
          external_id: string
          hidden: boolean
          id: string
          league_id: string | null
          media_url: string
          organization_id: string
          platform: string
          posted_at: string | null
          source: string
          thumbnail_url: string | null
          type: string
        }
        Insert: {
          added_by?: string | null
          approved?: boolean
          caption?: string | null
          connection_id?: string | null
          created_at?: string
          display_order?: number
          embed_url?: string | null
          external_id: string
          hidden?: boolean
          id?: string
          league_id?: string | null
          media_url: string
          organization_id: string
          platform: string
          posted_at?: string | null
          source?: string
          thumbnail_url?: string | null
          type?: string
        }
        Update: {
          added_by?: string | null
          approved?: boolean
          caption?: string | null
          connection_id?: string | null
          created_at?: string
          display_order?: number
          embed_url?: string | null
          external_id?: string
          hidden?: boolean
          id?: string
          league_id?: string | null
          media_url?: string
          organization_id?: string
          platform?: string
          posted_at?: string | null
          source?: string
          thumbnail_url?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_media_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_items_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_items_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_stats: {
        Row: {
          clicks: number
          day: string
          id: string
          impressions: number
          league_id: string
          organization_id: string
          sponsor_key: string
        }
        Insert: {
          clicks?: number
          day?: string
          id?: string
          impressions?: number
          league_id: string
          organization_id: string
          sponsor_key: string
        }
        Update: {
          clicks?: number
          day?: string
          id?: string
          impressions?: number
          league_id?: string
          organization_id?: string
          sponsor_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_stats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_positions: {
        Row: {
          display_order: number
          id: string
          name: string
          organization_id: string | null
          sport: string
        }
        Insert: {
          display_order?: number
          id?: string
          name: string
          organization_id?: string | null
          sport: string
        }
        Update: {
          display_order?: number
          id?: string
          name?: string
          organization_id?: string | null
          sport?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_positions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stat_definitions: {
        Row: {
          data_type: string
          display_order: number
          id: string
          is_active: boolean
          key: string
          label: string
          organization_id: string | null
          sport: string
        }
        Insert: {
          data_type?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key: string
          label: string
          organization_id?: string | null
          sport: string
        }
        Update: {
          data_type?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          organization_id?: string | null
          sport?: string
        }
        Relationships: [
          {
            foreignKeyName: "stat_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_connect_accounts: {
        Row: {
          charges_enabled: boolean | null
          created_at: string | null
          id: string
          organization_id: string
          payouts_enabled: boolean | null
          status: string
          stripe_account_id: string
        }
        Insert: {
          charges_enabled?: boolean | null
          created_at?: string | null
          id?: string
          organization_id: string
          payouts_enabled?: boolean | null
          status?: string
          stripe_account_id: string
        }
        Update: {
          charges_enabled?: boolean | null
          created_at?: string | null
          id?: string
          organization_id?: string
          payouts_enabled?: boolean | null
          status?: string
          stripe_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_processed_events: {
        Row: {
          event_id: string
          organization_id: string | null
          processed_at: string
        }
        Insert: {
          event_id: string
          organization_id?: string | null
          processed_at?: string
        }
        Update: {
          event_id?: string
          organization_id?: string | null
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_processed_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          cancellation_reason: string | null
          created_at: string | null
          current_period_end: string | null
          grace_ends_at: string | null
          hibernate_until: string | null
          id: string
          organization_id: string
          pending_plan_effective: string | null
          pending_plan_tier: string | null
          plan_tier: string
          pre_hibernate_tier: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string | null
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          current_period_end?: string | null
          grace_ends_at?: string | null
          hibernate_until?: string | null
          id?: string
          organization_id: string
          pending_plan_effective?: string | null
          pending_plan_tier?: string | null
          plan_tier?: string
          pre_hibernate_tier?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          current_period_end?: string | null
          grace_ends_at?: string | null
          hibernate_until?: string | null
          id?: string
          organization_id?: string
          pending_plan_effective?: string | null
          pending_plan_tier?: string | null
          plan_tier?: string
          pre_hibernate_tier?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          invited_user_id: string | null
          organization_id: string
          role: string
          status: string
          team_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          invited_user_id?: string | null
          organization_id: string
          role?: string
          status?: string
          team_id: string
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          invited_user_id?: string | null
          organization_id?: string
          role?: string
          status?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_join_requests: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_join_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          invited_email: string | null
          joined_at: string | null
          organization_id: string
          position: string | null
          role: string
          status: string
          team_id: string
          user_id: string | null
        }
        Insert: {
          id?: string
          invited_email?: string | null
          joined_at?: string | null
          organization_id: string
          position?: string | null
          role?: string
          status?: string
          team_id: string
          user_id?: string | null
        }
        Update: {
          id?: string
          invited_email?: string | null
          joined_at?: string | null
          organization_id?: string
          position?: string | null
          role?: string
          status?: string
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          calendar_token: string | null
          color: string | null
          created_at: string | null
          division_id: string | null
          id: string
          league_id: string
          logo_url: string | null
          name: string
          organization_id: string
          pool_id: string | null
          pool_sort_order: number
          status: string
          team_code: string
        }
        Insert: {
          calendar_token?: string | null
          color?: string | null
          created_at?: string | null
          division_id?: string | null
          id?: string
          league_id: string
          logo_url?: string | null
          name: string
          organization_id: string
          pool_id?: string | null
          pool_sort_order?: number
          status?: string
          team_code: string
        }
        Update: {
          calendar_token?: string | null
          color?: string | null
          created_at?: string | null
          division_id?: string | null
          id?: string
          league_id?: string
          logo_url?: string | null
          name?: string
          organization_id?: string
          pool_id?: string | null
          pool_sort_order?: number
          status?: string
          team_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_acceptances: {
        Row: {
          acceptance_type: string
          accepted_at: string
          accepted_by_user_id: string
          document_slug: string
          document_version: string
          document_version_id: string | null
          id: string
          ip_address: unknown
          notes: string | null
          organization_id: string
          user_agent: string | null
        }
        Insert: {
          acceptance_type: string
          accepted_at?: string
          accepted_by_user_id: string
          document_slug: string
          document_version: string
          document_version_id?: string | null
          id?: string
          ip_address?: unknown
          notes?: string | null
          organization_id: string
          user_agent?: string | null
        }
        Update: {
          acceptance_type?: string
          accepted_at?: string
          accepted_by_user_id?: string
          document_slug?: string
          document_version?: string
          document_version_id?: string | null
          id?: string
          ip_address?: unknown
          notes?: string | null
          organization_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_acceptances_accepted_by_user_id_fkey"
            columns: ["accepted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_acceptances_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_acceptances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_signatures: {
        Row: {
          guardian_relationship: string | null
          guest_email: string | null
          guest_name: string | null
          id: string
          ip_address: string | null
          league_id: string | null
          league_name: string | null
          organization_id: string
          pdf_url: string | null
          signature_name: string
          signed_at: string | null
          team_name: string | null
          user_id: string | null
          waiver_id: string
        }
        Insert: {
          guardian_relationship?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          ip_address?: string | null
          league_id?: string | null
          league_name?: string | null
          organization_id: string
          pdf_url?: string | null
          signature_name: string
          signed_at?: string | null
          team_name?: string | null
          user_id?: string | null
          waiver_id: string
        }
        Update: {
          guardian_relationship?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          ip_address?: string | null
          league_id?: string | null
          league_name?: string | null
          organization_id?: string
          pdf_url?: string | null
          signature_name?: string
          signed_at?: string | null
          team_name?: string | null
          user_id?: string | null
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      waivers: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          pdf_url: string | null
          requires_reconsent: boolean
          title: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          pdf_url?: string | null
          requires_reconsent?: boolean
          title: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          pdf_url?: string | null
          requires_reconsent?: boolean
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "waivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      week_phases: {
        Row: {
          created_at: string
          id: string
          league_id: string
          organization_id: string
          phase: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          organization_id: string
          phase: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          organization_id?: string
          phase?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "week_phases_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_phases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_sponsor_stats: {
        Args: {
          p_keys: string[]
          p_kind: string
          p_league: string
          p_org: string
        }
        Returns: undefined
      }
      current_org_id: { Args: never; Returns: string }
      increment_discount_use: {
        Args: { discount_id: string }
        Returns: undefined
      }
      is_org_admin_or_league_admin: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      purge_organization: { Args: { p_org_id: string }; Returns: undefined }
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
    Enums: {},
  },
} as const
// ── Hand-written aliases (preserved across regenerations) ────────────────────
// Regenerate the block above with: pnpm db:generate-types

export type OrgBranding = Database['public']['Tables']['org_branding']['Row']
export type League = Database['public']['Tables']['leagues']['Row']
export type Team = Database['public']['Tables']['teams']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Registration = Database['public']['Tables']['registrations']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type Game = Database['public']['Tables']['games']['Row']
export type GameResult = Database['public']['Tables']['game_results']['Row']
export type Waiver = Database['public']['Tables']['waivers']['Row']
export type WaiverSignature = Database['public']['Tables']['waiver_signatures']['Row']
export type DropInSession = Database['public']['Tables']['drop_in_sessions']['Row']
export type DiscountCode = Database['public']['Tables']['discount_codes']['Row']
export type PaymentPlan = Database['public']['Tables']['payment_plans']['Row']
