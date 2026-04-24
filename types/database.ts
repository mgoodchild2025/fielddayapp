export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string | null
          avatar_url: string | null
          platform_role: 'platform_admin' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          phone?: string | null
          avatar_url?: string | null
          platform_role?: 'platform_admin' | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          sport: string | null
          city: string | null
          status: 'active' | 'suspended' | 'trial'
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sport?: string | null
          city?: string | null
          status?: 'active' | 'suspended' | 'trial'
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>
        Relationships: []
      }
      org_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'org_admin' | 'league_admin' | 'captain' | 'player'
          status: 'active' | 'invited' | 'suspended'
          invited_email: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: 'org_admin' | 'league_admin' | 'captain' | 'player'
          status?: 'active' | 'invited' | 'suspended'
          invited_email?: string | null
          joined_at?: string
        }
        Update: Partial<Database['public']['Tables']['org_members']['Insert']>
        Relationships: [
          { foreignKeyName: 'org_members_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'org_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      org_branding: {
        Row: {
          id: string
          organization_id: string
          primary_color: string | null
          secondary_color: string | null
          bg_color: string | null
          text_color: string | null
          heading_font: string | null
          body_font: string | null
          logo_url: string | null
          favicon_url: string | null
          hero_image_url: string | null
          tagline: string | null
          contact_email: string | null
          custom_domain: string | null
          social_instagram: string | null
          social_facebook: string | null
          social_x: string | null
          social_tiktok: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          primary_color?: string | null
          secondary_color?: string | null
          bg_color?: string | null
          text_color?: string | null
          heading_font?: string | null
          body_font?: string | null
          logo_url?: string | null
          favicon_url?: string | null
          hero_image_url?: string | null
          tagline?: string | null
          contact_email?: string | null
          custom_domain?: string | null
          social_instagram?: string | null
          social_facebook?: string | null
          social_x?: string | null
          social_tiktok?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['org_branding']['Insert']>
        Relationships: [
          { foreignKeyName: 'org_branding_organization_id_fkey'; columns: ['organization_id']; isOneToOne: true; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      subscriptions: {
        Row: {
          id: string
          organization_id: string
          stripe_subscription_id: string | null
          stripe_customer_id: string | null
          plan_tier: 'starter' | 'pro' | 'club' | 'internal'
          billing_interval: 'month' | 'year' | null
          status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'
          trial_end: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          cancellation_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          stripe_subscription_id?: string | null
          stripe_customer_id?: string | null
          plan_tier?: 'starter' | 'pro' | 'club' | 'internal'
          billing_interval?: 'month' | 'year' | null
          status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'
          trial_end?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
        Relationships: [
          { foreignKeyName: 'subscriptions_organization_id_fkey'; columns: ['organization_id']; isOneToOne: true; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      stripe_connect_accounts: {
        Row: {
          id: string
          organization_id: string
          stripe_account_id: string
          status: 'pending' | 'active' | 'restricted'
          charges_enabled: boolean
          payouts_enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          stripe_account_id: string
          status?: 'pending' | 'active' | 'restricted'
          charges_enabled?: boolean
          payouts_enabled?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['stripe_connect_accounts']['Insert']>
        Relationships: [
          { foreignKeyName: 'stripe_connect_accounts_organization_id_fkey'; columns: ['organization_id']; isOneToOne: true; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      leagues: {
        Row: {
          id: string
          organization_id: string
          name: string
          slug: string
          description: string | null
          league_type: 'team' | 'individual' | 'dropin' | 'tournament'
          sport: string | null
          status: 'draft' | 'registration_open' | 'active' | 'completed' | 'archived'
          registration_opens_at: string | null
          registration_closes_at: string | null
          season_start_date: string | null
          season_end_date: string | null
          max_teams: number | null
          min_team_size: number
          max_team_size: number
          price_cents: number
          currency: string
          early_bird_price_cents: number | null
          early_bird_deadline: string | null
          payment_mode: 'per_player' | 'per_team'
          waiver_version_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          slug: string
          description?: string | null
          league_type: 'team' | 'individual' | 'dropin' | 'tournament'
          sport?: string | null
          status?: 'draft' | 'registration_open' | 'active' | 'completed' | 'archived'
          registration_opens_at?: string | null
          registration_closes_at?: string | null
          season_start_date?: string | null
          season_end_date?: string | null
          max_teams?: number | null
          min_team_size?: number
          max_team_size?: number
          price_cents?: number
          currency?: string
          early_bird_price_cents?: number | null
          early_bird_deadline?: string | null
          payment_mode?: 'per_player' | 'per_team'
          waiver_version_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leagues']['Insert']>
        Relationships: [
          { foreignKeyName: 'leagues_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'leagues_waiver_version_id_fkey'; columns: ['waiver_version_id']; isOneToOne: false; referencedRelation: 'waivers'; referencedColumns: ['id'] }
        ]
      }
      divisions: {
        Row: {
          id: string
          organization_id: string
          league_id: string
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          league_id: string
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['divisions']['Insert']>
        Relationships: [
          { foreignKeyName: 'divisions_league_id_fkey'; columns: ['league_id']; isOneToOne: false; referencedRelation: 'leagues'; referencedColumns: ['id'] },
          { foreignKeyName: 'divisions_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      teams: {
        Row: {
          id: string
          organization_id: string
          league_id: string
          division_id: string | null
          name: string
          color: string | null
          logo_url: string | null
          team_code: string
          status: 'active' | 'inactive' | 'withdrawn'
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          league_id: string
          division_id?: string | null
          name: string
          color?: string | null
          logo_url?: string | null
          team_code?: string
          status?: 'active' | 'inactive' | 'withdrawn'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
        Relationships: [
          { foreignKeyName: 'teams_league_id_fkey'; columns: ['league_id']; isOneToOne: false; referencedRelation: 'leagues'; referencedColumns: ['id'] },
          { foreignKeyName: 'teams_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      team_members: {
        Row: {
          id: string
          organization_id: string
          team_id: string
          user_id: string | null
          role: 'captain' | 'player' | 'sub'
          status: 'active' | 'inactive' | 'invited'
          invited_email: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          team_id: string
          user_id?: string | null
          role?: 'captain' | 'player' | 'sub'
          status?: 'active' | 'inactive' | 'invited'
          invited_email?: string | null
          joined_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
        Relationships: [
          { foreignKeyName: 'team_members_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'team_members_team_id_fkey'; columns: ['team_id']; isOneToOne: false; referencedRelation: 'teams'; referencedColumns: ['id'] },
          { foreignKeyName: 'team_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      waivers: {
        Row: {
          id: string
          organization_id: string
          version: number
          title: string
          content: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          version?: number
          title: string
          content: string
          is_active?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['waivers']['Insert']>
        Relationships: [
          { foreignKeyName: 'waivers_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      waiver_signatures: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          waiver_id: string
          signed_at: string
          signature_name: string
          ip_address: string | null
          pdf_url: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          waiver_id: string
          signed_at?: string
          signature_name: string
          ip_address?: string | null
          pdf_url?: string | null
        }
        Update: Partial<Database['public']['Tables']['waiver_signatures']['Insert']>
        Relationships: [
          { foreignKeyName: 'waiver_signatures_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'waiver_signatures_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'waiver_signatures_waiver_id_fkey'; columns: ['waiver_id']; isOneToOne: false; referencedRelation: 'waivers'; referencedColumns: ['id'] }
        ]
      }
      registrations: {
        Row: {
          id: string
          organization_id: string
          league_id: string
          user_id: string
          team_id: string | null
          waiver_signature_id: string | null
          status: 'pending' | 'active' | 'withdrawn' | 'waitlisted'
          form_data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          league_id: string
          user_id: string
          team_id?: string | null
          waiver_signature_id?: string | null
          status?: 'pending' | 'active' | 'withdrawn' | 'waitlisted'
          form_data?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['registrations']['Insert']>
        Relationships: [
          { foreignKeyName: 'registrations_league_id_fkey'; columns: ['league_id']; isOneToOne: false; referencedRelation: 'leagues'; referencedColumns: ['id'] },
          { foreignKeyName: 'registrations_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'registrations_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'registrations_waiver_signature_id_fkey'; columns: ['waiver_signature_id']; isOneToOne: false; referencedRelation: 'waiver_signatures'; referencedColumns: ['id'] }
        ]
      }
      player_details: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          skill_level: 'beginner' | 'intermediate' | 'competitive' | null
          t_shirt_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          date_of_birth: string | null
          how_did_you_hear: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          skill_level?: 'beginner' | 'intermediate' | 'competitive' | null
          t_shirt_size?: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          date_of_birth?: string | null
          how_did_you_hear?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['player_details']['Insert']>
        Relationships: [
          { foreignKeyName: 'player_details_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'player_details_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      payments: {
        Row: {
          id: string
          organization_id: string
          registration_id: string | null
          user_id: string
          league_id: string | null
          stripe_payment_intent_id: string | null
          stripe_checkout_session_id: string | null
          amount_cents: number
          currency: string
          status: 'pending' | 'paid' | 'failed' | 'refunded' | 'manual'
          payment_method: 'stripe' | 'cash' | 'etransfer'
          notes: string | null
          paid_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          registration_id?: string | null
          user_id: string
          league_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_checkout_session_id?: string | null
          amount_cents: number
          currency?: string
          status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'manual'
          payment_method?: 'stripe' | 'cash' | 'etransfer'
          notes?: string | null
          paid_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: [
          { foreignKeyName: 'payments_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_registration_id_fkey'; columns: ['registration_id']; isOneToOne: false; referencedRelation: 'registrations'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      games: {
        Row: {
          id: string
          organization_id: string
          league_id: string
          division_id: string | null
          home_team_id: string | null
          away_team_id: string | null
          court: string | null
          scheduled_at: string
          week_number: number | null
          status: 'scheduled' | 'completed' | 'cancelled' | 'postponed'
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          league_id: string
          division_id?: string | null
          home_team_id?: string | null
          away_team_id?: string | null
          court?: string | null
          scheduled_at: string
          week_number?: number | null
          status?: 'scheduled' | 'completed' | 'cancelled' | 'postponed'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['games']['Insert']>
        Relationships: [
          { foreignKeyName: 'games_league_id_fkey'; columns: ['league_id']; isOneToOne: false; referencedRelation: 'leagues'; referencedColumns: ['id'] },
          { foreignKeyName: 'games_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'games_home_team_id_fkey'; columns: ['home_team_id']; isOneToOne: false; referencedRelation: 'teams'; referencedColumns: ['id'] },
          { foreignKeyName: 'games_away_team_id_fkey'; columns: ['away_team_id']; isOneToOne: false; referencedRelation: 'teams'; referencedColumns: ['id'] }
        ]
      }
      game_results: {
        Row: {
          id: string
          organization_id: string
          game_id: string
          home_score: number | null
          away_score: number | null
          sets: Json | null
          submitted_by: string | null
          confirmed_by: string | null
          status: 'pending' | 'confirmed' | 'disputed'
          submitted_at: string
          confirmed_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          game_id: string
          home_score?: number | null
          away_score?: number | null
          sets?: Json | null
          submitted_by?: string | null
          confirmed_by?: string | null
          status?: 'pending' | 'confirmed' | 'disputed'
          submitted_at?: string
          confirmed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['game_results']['Insert']>
        Relationships: [
          { foreignKeyName: 'game_results_game_id_fkey'; columns: ['game_id']; isOneToOne: true; referencedRelation: 'games'; referencedColumns: ['id'] },
          { foreignKeyName: 'game_results_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      announcements: {
        Row: {
          id: string
          organization_id: string
          league_id: string | null
          title: string
          body: string
          sent_by: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          league_id?: string | null
          title: string
          body: string
          sent_by?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>
        Relationships: [
          { foreignKeyName: 'announcements_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] }
        ]
      }
      notifications: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          type: string
          title: string
          body: string | null
          read: boolean
          data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          type: string
          title: string
          body?: string | null
          read?: boolean
          data?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: [
          { foreignKeyName: 'notifications_organization_id_fkey'; columns: ['organization_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'notifications_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

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
