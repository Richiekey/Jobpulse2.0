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
      application_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          application_id: string
          created_at: string
          event_type: string
          from_status:
            | Database["public"]["Enums"]["application_status_enum"]
            | null
          id: string
          metadata: Json
          organization_id: string | null
          to_status:
            | Database["public"]["Enums"]["application_status_enum"]
            | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          application_id: string
          created_at?: string
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["application_status_enum"]
            | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          to_status?:
            | Database["public"]["Enums"]["application_status_enum"]
            | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          application_id?: string
          created_at?: string
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["application_status_enum"]
            | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          to_status?:
            | Database["public"]["Enums"]["application_status_enum"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      application_verifications: {
        Row: {
          application_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          organization_id: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          screenshot_url: string
          status: Database["public"]["Enums"]["verification_status_enum"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          organization_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          screenshot_url: string
          status?: Database["public"]["Enums"]["verification_status_enum"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          organization_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          screenshot_url?: string
          status?: Database["public"]["Enums"]["verification_status_enum"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_verifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_verifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string
          assigned_by: string | null
          company_name: string
          created_at: string
          deleted_at: string | null
          id: string
          job_id: string | null
          job_title: string
          last_sync_error: string | null
          notes: string | null
          organization_id: string | null
          status: Database["public"]["Enums"]["application_status_enum"]
          sync_status: Database["public"]["Enums"]["sync_status_enum"]
          synced_at: string | null
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["verification_status_enum"]
          worker_id: string | null
        }
        Insert: {
          applied_at?: string
          assigned_by?: string | null
          company_name: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          job_id?: string | null
          job_title: string
          last_sync_error?: string | null
          notes?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["application_status_enum"]
          sync_status?: Database["public"]["Enums"]["sync_status_enum"]
          synced_at?: string | null
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["verification_status_enum"]
          worker_id?: string | null
        }
        Update: {
          applied_at?: string
          assigned_by?: string | null
          company_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          job_id?: string | null
          job_title?: string
          last_sync_error?: string | null
          notes?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["application_status_enum"]
          sync_status?: Database["public"]["Enums"]["sync_status_enum"]
          synced_at?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["verification_status_enum"]
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_events: {
        Row: {
          actor_id: string
          assignment_id: string
          created_at: string
          event_type: string
          from_status:
            | Database["public"]["Enums"]["assignment_status_enum"]
            | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          to_status: Database["public"]["Enums"]["assignment_status_enum"]
          worker_id: string
        }
        Insert: {
          actor_id: string
          assignment_id: string
          created_at?: string
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["assignment_status_enum"]
            | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          to_status: Database["public"]["Enums"]["assignment_status_enum"]
          worker_id: string
        }
        Update: {
          actor_id?: string
          assignment_id?: string
          created_at?: string
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["assignment_status_enum"]
            | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          to_status?: Database["public"]["Enums"]["assignment_status_enum"]
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "job_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ats_platforms: {
        Row: {
          capabilities: Json
          created_at: string
          domains: string[]
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          domains?: string[]
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          domains?: string[]
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          amount: number
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          interval: string
          is_active: boolean
          name: string
          provider: string
          provider_plan_code: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval: string
          is_active?: boolean
          name: string
          provider?: string
          provider_plan_code?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          provider?: string
          provider_plan_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          status: Database["public"]["Enums"]["webhook_status_enum"]
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["webhook_status_enum"]
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["webhook_status_enum"]
        }
        Relationships: []
      }
      companies: {
        Row: {
          careers_url: string | null
          company_size: string | null
          created_at: string
          description: string | null
          domain: string | null
          id: string
          industry: string | null
          logo_url: string | null
          metadata: Json
          name: string
          normalized_name: string
          slug: string
          status: string
          updated_at: string
          verified: boolean
          website: string | null
        }
        Insert: {
          careers_url?: string | null
          company_size?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          metadata?: Json
          name: string
          normalized_name: string
          slug: string
          status?: string
          updated_at?: string
          verified?: boolean
          website?: string | null
        }
        Update: {
          careers_url?: string | null
          company_size?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          metadata?: Json
          name?: string
          normalized_name?: string
          slug?: string
          status?: string
          updated_at?: string
          verified?: boolean
          website?: string | null
        }
        Relationships: []
      }
      company_sources: {
        Row: {
          adapter_config: Json
          company_id: string
          consecutive_failures: number
          created_at: string
          discovery_method: string
          health_status: Database["public"]["Enums"]["health_status_enum"]
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_error: string | null
          last_failure_at: string | null
          last_job_count: number
          last_success_at: string | null
          priority: number
          schedule_interval_minutes: number
          source_id: string
          source_identifier: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          adapter_config?: Json
          company_id: string
          consecutive_failures?: number
          created_at?: string
          discovery_method?: string
          health_status?: Database["public"]["Enums"]["health_status_enum"]
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          last_failure_at?: string | null
          last_job_count?: number
          last_success_at?: string | null
          priority?: number
          schedule_interval_minutes?: number
          source_id: string
          source_identifier: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          adapter_config?: Json
          company_id?: string
          consecutive_failures?: number
          created_at?: string
          discovery_method?: string
          health_status?: Database["public"]["Enums"]["health_status_enum"]
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          last_failure_at?: string | null
          last_job_count?: number
          last_success_at?: string | null
          priority?: number
          schedule_interval_minutes?: number
          source_id?: string
          source_identifier?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          created_at: string
          encrypted_refresh_token: string
          id: string
          integration_id: string
          key_version: number
          token_auth_tag: string
          token_expires_at: string | null
          token_iv: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_refresh_token: string
          id?: string
          integration_id: string
          key_version?: number
          token_auth_tag: string
          token_expires_at?: string | null
          token_iv: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_refresh_token?: string
          id?: string
          integration_id?: string
          key_version?: number
          token_auth_tag?: string
          token_expires_at?: string | null
          token_iv?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "user_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_alert_delivered_jobs: {
        Row: {
          alert_id: string
          attempts: number
          claimed_at: string
          delivered_at: string
          delivery_id: string | null
          error_message: string | null
          job_id: string
          status: string
        }
        Insert: {
          alert_id: string
          attempts?: number
          claimed_at?: string
          delivered_at?: string
          delivery_id?: string | null
          error_message?: string | null
          job_id: string
          status?: string
        }
        Update: {
          alert_id?: string
          attempts?: number
          claimed_at?: string
          delivered_at?: string
          delivery_id?: string | null
          error_message?: string | null
          job_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_alert_delivered_jobs_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "job_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_alert_delivered_jobs_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "job_alert_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_alert_delivered_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_alert_deliveries: {
        Row: {
          alert_id: string
          channel: string
          dispatched_at: string
          error_message: string | null
          id: string
          matched_job_ids: string[]
          metadata: Json
          status: string
          user_id: string
        }
        Insert: {
          alert_id: string
          channel: string
          dispatched_at?: string
          error_message?: string | null
          id?: string
          matched_job_ids?: string[]
          metadata?: Json
          status: string
          user_id: string
        }
        Update: {
          alert_id?: string
          channel?: string
          dispatched_at?: string
          error_message?: string | null
          id?: string
          matched_job_ids?: string[]
          metadata?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_alert_deliveries_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "job_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      job_alerts: {
        Row: {
          channel: string
          created_at: string
          department: string | null
          employment_type: string | null
          frequency: string
          id: string
          is_active: boolean
          last_dispatched_at: string | null
          location: string | null
          query: string | null
          remote_type: string | null
          title: string
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          department?: string | null
          employment_type?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_dispatched_at?: string | null
          location?: string | null
          query?: string | null
          remote_type?: string | null
          title: string
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          department?: string | null
          employment_type?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_dispatched_at?: string | null
          location?: string | null
          query?: string | null
          remote_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      job_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          deadline_at: string | null
          id: string
          job_function_slug: string | null
          job_id: string | null
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["assignment_status_enum"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          job_function_slug?: string | null
          job_id?: string | null
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["assignment_status_enum"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          deadline_at?: string | null
          id?: string
          job_function_slug?: string | null
          job_id?: string | null
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["assignment_status_enum"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_functions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_slug: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_slug?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_slug?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_functions_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "job_functions"
            referencedColumns: ["slug"]
          },
        ]
      }
      job_sources: {
        Row: {
          created_at: string
          discovery_url: string
          external_job_id: string
          first_seen_at: string
          id: string
          is_primary: boolean
          job_id: string
          last_seen_at: string
          metadata: Json
          raw_payload_hash: string
          source_id: string
          source_job_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discovery_url: string
          external_job_id: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          job_id: string
          last_seen_at?: string
          metadata?: Json
          raw_payload_hash: string
          source_id: string
          source_job_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discovery_url?: string
          external_job_id?: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          job_id?: string
          last_seen_at?: string
          metadata?: Json
          raw_payload_hash?: string
          source_id?: string
          source_job_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sources_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          annualized_max: number | null
          annualized_min: number | null
          apply_url: string
          ats_platform_slug: string | null
          canonical_fingerprint: string | null
          canonical_title: string
          canonical_url: string
          company_id: string
          consecutive_misses: number
          created_at: string
          description: string
          description_html: string | null
          display_title: string
          employment_type: Database["public"]["Enums"]["employment_type_enum"]
          equity_mentioned: boolean
          expires_at: string | null
          first_seen_at: string
          has_salary: boolean
          id: string
          is_remote: boolean
          job_function_confidence: string | null
          job_function_slug: string | null
          last_seen_at: string
          location_city: string | null
          location_country: string | null
          location_region: string | null
          locations: string[]
          missed_scrape_count: number
          original_apply_url: string | null
          posted_at: string
          salary_currency: string | null
          salary_interval: string | null
          salary_max: number | null
          salary_min: number | null
          scraped_at: string | null
          search_vector: unknown
          skills: string[]
          source_metadata: Json
          status: Database["public"]["Enums"]["job_status_enum"]
          updated_at: string
          url_resolution_confidence: number
          url_resolution_method: string
          workplace_type: Database["public"]["Enums"]["workplace_type_enum"]
        }
        Insert: {
          annualized_max?: number | null
          annualized_min?: number | null
          apply_url: string
          ats_platform_slug?: string | null
          canonical_fingerprint?: string | null
          canonical_title: string
          canonical_url: string
          company_id: string
          consecutive_misses?: number
          created_at?: string
          description: string
          description_html?: string | null
          display_title: string
          employment_type?: Database["public"]["Enums"]["employment_type_enum"]
          equity_mentioned?: boolean
          expires_at?: string | null
          first_seen_at?: string
          has_salary?: boolean
          id?: string
          is_remote?: boolean
          job_function_confidence?: string | null
          job_function_slug?: string | null
          last_seen_at?: string
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          locations?: string[]
          missed_scrape_count?: number
          original_apply_url?: string | null
          posted_at?: string
          salary_currency?: string | null
          salary_interval?: string | null
          salary_max?: number | null
          salary_min?: number | null
          scraped_at?: string | null
          search_vector?: unknown
          skills?: string[]
          source_metadata?: Json
          status?: Database["public"]["Enums"]["job_status_enum"]
          updated_at?: string
          url_resolution_confidence?: number
          url_resolution_method: string
          workplace_type?: Database["public"]["Enums"]["workplace_type_enum"]
        }
        Update: {
          annualized_max?: number | null
          annualized_min?: number | null
          apply_url?: string
          ats_platform_slug?: string | null
          canonical_fingerprint?: string | null
          canonical_title?: string
          canonical_url?: string
          company_id?: string
          consecutive_misses?: number
          created_at?: string
          description?: string
          description_html?: string | null
          display_title?: string
          employment_type?: Database["public"]["Enums"]["employment_type_enum"]
          equity_mentioned?: boolean
          expires_at?: string | null
          first_seen_at?: string
          has_salary?: boolean
          id?: string
          is_remote?: boolean
          job_function_confidence?: string | null
          job_function_slug?: string | null
          last_seen_at?: string
          location_city?: string | null
          location_country?: string | null
          location_region?: string | null
          locations?: string[]
          missed_scrape_count?: number
          original_apply_url?: string | null
          posted_at?: string
          salary_currency?: string | null
          salary_interval?: string | null
          salary_max?: number | null
          salary_min?: number | null
          scraped_at?: string | null
          search_vector?: unknown
          skills?: string[]
          source_metadata?: Json
          status?: Database["public"]["Enums"]["job_status_enum"]
          updated_at?: string
          url_resolution_confidence?: number
          url_resolution_method?: string
          workplace_type?: Database["public"]["Enums"]["workplace_type_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_clicks: {
        Row: {
          created_at: string
          destination_url: string
          id: string
          ip_hash: string | null
          job_id: string
          referrer: string | null
          url_resolution_confidence: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          destination_url: string
          id?: string
          ip_hash?: string | null
          job_id: string
          referrer?: string | null
          url_resolution_confidence?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          destination_url?: string
          id?: string
          ip_hash?: string | null
          job_id?: string
          referrer?: string | null
          url_resolution_confidence?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_clicks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          payment_type: string
          provider: string
          provider_transaction_id: string | null
          raw_event_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id?: string
          paid_at?: string | null
          payment_type: string
          provider?: string
          provider_transaction_id?: string | null
          raw_event_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status_enum"]
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          payment_type?: string
          provider?: string
          provider_transaction_id?: string | null
          raw_event_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status_enum"]
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_organization_id: string | null
          email: string | null
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_organization_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_organization_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_organization_id_fkey"
            columns: ["current_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_job_payloads: {
        Row: {
          created_at: string | null
          external_id: string
          fetched_at: string
          id: string
          parser_version: string
          payload: Json
          payload_hash: string
          source_id: string
        }
        Insert: {
          created_at?: string | null
          external_id: string
          fetched_at?: string
          id?: string
          parser_version: string
          payload: Json
          payload_hash: string
          source_id: string
        }
        Update: {
          created_at?: string | null
          external_id?: string
          fetched_at?: string
          id?: string
          parser_version?: string
          payload?: Json
          payload_hash?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_job_payloads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          holder_id: string
          lock_key: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          holder_id: string
          lock_key: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          holder_id?: string
          lock_key?: string
        }
        Relationships: []
      }
      scrape_run_sources: {
        Row: {
          company_source_id: string
          completed_at: string | null
          created_at: string
          duration_ms: number
          error_message: string | null
          id: string
          jobs_discovered: number
          jobs_failed: number
          jobs_inserted: number
          jobs_rejected: number
          jobs_updated: number
          metadata: Json
          scrape_run_id: string
          started_at: string
          status: string
        }
        Insert: {
          company_source_id: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          jobs_discovered?: number
          jobs_failed?: number
          jobs_inserted?: number
          jobs_rejected?: number
          jobs_updated?: number
          metadata?: Json
          scrape_run_id: string
          started_at?: string
          status: string
        }
        Update: {
          company_source_id?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          jobs_discovered?: number
          jobs_failed?: number
          jobs_inserted?: number
          jobs_rejected?: number
          jobs_updated?: number
          metadata?: Json
          scrape_run_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_run_sources_company_source_id_fkey"
            columns: ["company_source_id"]
            isOneToOne: false
            referencedRelation: "company_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_run_sources_scrape_run_id_fkey"
            columns: ["scrape_run_id"]
            isOneToOne: false
            referencedRelation: "scrape_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_runs: {
        Row: {
          companies_attempted: number
          companies_failed: number
          companies_succeeded: number
          completed_at: string | null
          concurrency_scope: string
          error_summary: Json
          id: string
          jobs_discovered: number
          jobs_failed: number
          jobs_inserted: number
          jobs_rejected: number
          jobs_updated: number
          metadata: Json
          started_at: string
          status: Database["public"]["Enums"]["scrape_run_status_enum"]
        }
        Insert: {
          companies_attempted?: number
          companies_failed?: number
          companies_succeeded?: number
          completed_at?: string | null
          concurrency_scope?: string
          error_summary?: Json
          id?: string
          jobs_discovered?: number
          jobs_failed?: number
          jobs_inserted?: number
          jobs_rejected?: number
          jobs_updated?: number
          metadata?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["scrape_run_status_enum"]
        }
        Update: {
          companies_attempted?: number
          companies_failed?: number
          companies_succeeded?: number
          completed_at?: string | null
          concurrency_scope?: string
          error_summary?: Json
          id?: string
          jobs_discovered?: number
          jobs_failed?: number
          jobs_inserted?: number
          jobs_rejected?: number
          jobs_updated?: number
          metadata?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["scrape_run_status_enum"]
        }
        Relationships: []
      }
      source_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_class: string | null
          error_message: string | null
          id: string
          jobs_found: number
          jobs_inserted: number
          jobs_updated: number
          source: string
          source_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          jobs_found?: number
          jobs_inserted?: number
          jobs_updated?: number
          source: string
          source_id?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_class?: string | null
          error_message?: string | null
          id?: string
          jobs_found?: number
          jobs_inserted?: number
          jobs_updated?: number
          source?: string
          source_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          adapter_name: string
          ats_platform_id: string | null
          created_at: string
          domain: string
          id: string
          metadata: Json
          name: string
          status: Database["public"]["Enums"]["health_status_enum"]
          type: Database["public"]["Enums"]["source_type_enum"]
          updated_at: string
        }
        Insert: {
          adapter_name: string
          ats_platform_id?: string | null
          created_at?: string
          domain: string
          id?: string
          metadata?: Json
          name: string
          status?: Database["public"]["Enums"]["health_status_enum"]
          type?: Database["public"]["Enums"]["source_type_enum"]
          updated_at?: string
        }
        Update: {
          adapter_name?: string
          ats_platform_id?: string | null
          created_at?: string
          domain?: string
          id?: string
          metadata?: Json
          name?: string
          status?: Database["public"]["Enums"]["health_status_enum"]
          type?: Database["public"]["Enums"]["source_type_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_ats_platform_id_fkey"
            columns: ["ats_platform_id"]
            isOneToOne: false
            referencedRelation: "ats_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          cancelled_at: string | null
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          interval: string
          plan_id: string
          provider: string
          provider_customer_id: string
          provider_email: string
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          cancelled_at?: string | null
          created_at?: string
          currency: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval: string
          plan_id: string
          provider?: string
          provider_customer_id: string
          provider_email: string
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval?: string
          plan_id?: string
          provider?: string
          provider_customer_id?: string
          provider_email?: string
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_events: {
        Row: {
          application_id: string
          attempts: number
          claim_token: string | null
          created_at: string
          external_row_id: string | null
          id: string
          integration_id: string
          last_error: string | null
          manual_retry_count: number
          max_attempts: number
          next_retry_at: string
          organization_id: string | null
          payload: Json
          pending_payload: Json | null
          processing_started_at: string | null
          provider: string
          status: Database["public"]["Enums"]["sync_event_status_enum"]
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          attempts?: number
          claim_token?: string | null
          created_at?: string
          external_row_id?: string | null
          id?: string
          integration_id: string
          last_error?: string | null
          manual_retry_count?: number
          max_attempts?: number
          next_retry_at?: string
          organization_id?: string | null
          payload?: Json
          pending_payload?: Json | null
          processing_started_at?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["sync_event_status_enum"]
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          attempts?: number
          claim_token?: string | null
          created_at?: string
          external_row_id?: string | null
          id?: string
          integration_id?: string
          last_error?: string | null
          manual_retry_count?: number
          max_attempts?: number
          next_retry_at?: string
          organization_id?: string | null
          payload?: Json
          pending_payload?: Json | null
          processing_started_at?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["sync_event_status_enum"]
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "user_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          last_error: string | null
          last_synced_at: string | null
          organization_id: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          email_alerts_enabled: boolean
          id: string
          minimum_salary: number | null
          preferred_locations: string[]
          preferred_roles: string[]
          preferred_workplace_types: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_alerts_enabled?: boolean
          id?: string
          minimum_salary?: number | null
          preferred_locations?: string[]
          preferred_roles?: string[]
          preferred_workplace_types?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_alerts_enabled?: boolean
          id?: string
          minimum_salary?: number | null
          preferred_locations?: string[]
          preferred_roles?: string[]
          preferred_workplace_types?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_profiles: {
        Row: {
          availability: string
          created_at: string
          cv_url: string | null
          education: Json
          experience_years: number | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          preferred_locations: string[]
          preferred_roles: string[]
          resumes: Json
          skills: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          availability?: string
          created_at?: string
          cv_url?: string | null
          education?: Json
          experience_years?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          preferred_locations?: string[]
          preferred_roles?: string[]
          resumes?: Json
          skills?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          availability?: string
          created_at?: string
          cv_url?: string | null
          education?: Json
          experience_years?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          preferred_locations?: string[]
          preferred_roles?: string[]
          resumes?: Json
          skills?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_organization_id_fkey"
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
      claim_next_pending_scrape_run: {
        Args: never
        Returns: {
          id: string
          metadata: Json
          started_at: string
          status: Database["public"]["Enums"]["scrape_run_status_enum"]
        }[]
      }
      claim_next_pending_sync_events: {
        Args: { p_batch_size?: number }
        Returns: {
          application_id: string
          attempts: number
          claim_token: string
          id: string
          integration_id: string
          max_attempts: number
          organization_id: string
          payload: Json
          provider: string
          status: Database["public"]["Enums"]["sync_event_status_enum"]
          user_id: string
        }[]
      }
      claim_sync_event: {
        Args: { p_event_id: string }
        Returns: {
          application_id: string
          attempts: number
          claim_token: string
          id: string
          integration_id: string
          max_attempts: number
          organization_id: string
          payload: Json
          provider: string
          status: Database["public"]["Enums"]["sync_event_status_enum"]
          user_id: string
        }[]
      }
      claim_undelivered_alert_jobs: {
        Args: {
          p_alert_id: string
          p_job_ids: string[]
          p_lease_seconds?: number
        }
        Returns: string[]
      }
      classify_source_error: {
        Args: { p_error_message: string }
        Returns: string
      }
      cleanup_test_fixtures_by_ids: {
        Args: { p_target_org_ids: string[] }
        Returns: Json
      }
      cleanup_test_run_by_prefix: {
        Args: { p_run_slug_prefix: string }
        Returns: Json
      }
      complete_assignment_with_application: {
        Args: {
          p_assignment_id: string
          p_company_name?: string
          p_job_title?: string
          p_notes?: string
        }
        Returns: Json
      }
      complete_sync_event: {
        Args: {
          p_claim_token: string
          p_event_id: string
          p_external_row_id?: string
        }
        Returns: Json
      }
      create_organization_with_owner: {
        Args: {
          p_domain?: string
          p_logo_url?: string
          p_name: string
          p_slug: string
        }
        Returns: Json
      }
      enqueue_existing_applications_for_sync: {
        Args: { p_integration_id: string; p_limit?: number }
        Returns: number
      }
      expand_function_slugs: {
        Args: { input_slugs: string[] }
        Returns: string[]
      }
      fail_sync_event: {
        Args: {
          p_claim_token: string
          p_error_message: string
          p_event_id: string
          p_is_non_retryable?: boolean
          p_retry_delay_seconds?: number
        }
        Returns: Json
      }
      force_unlock_scrape: { Args: { p_lock_key: string }; Returns: boolean }
      get_admin_system_metrics: { Args: never; Returns: Json }
      get_job_filter_facets: { Args: never; Returns: Json }
      get_operational_intelligence_metrics: {
        Args: { p_organization_id?: string; p_time_range?: string }
        Returns: Json
      }
      get_retention_and_storage_metrics: { Args: never; Returns: Json }
      get_salary_benchmarks: {
        Args: {
          p_currency?: string
          p_department?: string
          p_query?: string
          p_workplace_type?: string
        }
        Returns: Json
      }
      get_user_org_ids: {
        Args: { p_user_id?: string }
        Returns: {
          organization_id: string
          role: Database["public"]["Enums"]["org_role_enum"]
        }[]
      }
      get_worker_activity_stream: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_organization_id?: string
        }
        Returns: Json
      }
      ingest_job_transaction: {
        Args: {
          p_annualized_max?: number
          p_annualized_min?: number
          p_apply_url?: string
          p_ats_platform_slug?: string
          p_canonical_fingerprint?: string
          p_canonical_title: string
          p_canonical_url?: string
          p_company_id: string
          p_description: string
          p_description_html?: string
          p_discovery_url?: string
          p_display_title: string
          p_employment_type?: Database["public"]["Enums"]["employment_type_enum"]
          p_equity_mentioned?: boolean
          p_external_job_id?: string
          p_has_salary?: boolean
          p_is_remote?: boolean
          p_job_function_confidence?: string
          p_job_function_slug?: string
          p_location_city?: string
          p_location_country?: string
          p_location_region?: string
          p_locations?: string[]
          p_original_apply_url?: string
          p_parser_version?: string
          p_posted_at?: string
          p_raw_payload?: Json
          p_raw_payload_hash?: string
          p_salary_currency?: string
          p_salary_interval?: string
          p_salary_max?: number
          p_salary_min?: number
          p_skills?: string[]
          p_source_id?: string
          p_source_job_url?: string
          p_source_metadata?: Json
          p_store_raw_payload?: boolean
          p_url_resolution_confidence?: number
          p_url_resolution_method?: string
          p_workplace_type?: Database["public"]["Enums"]["workplace_type_enum"]
        }
        Returns: Json
      }
      ingest_normalized_job: {
        Args: {
          p_annualized_max?: number
          p_annualized_min?: number
          p_apply_url: string
          p_canonical_url: string
          p_city: string
          p_company_id: string
          p_country: string
          p_department: string
          p_description_html?: string
          p_description_text?: string
          p_employment_type: string
          p_equity_mentioned?: boolean
          p_external_job_id: string
          p_has_salary?: boolean
          p_location_raw: string
          p_posted_at?: string
          p_region: string
          p_salary_currency: string
          p_salary_interval: string
          p_salary_max: number
          p_salary_min: number
          p_source_data?: Json
          p_source_id: string
          p_title: string
          p_workplace_type: string
        }
        Returns: {
          is_new: boolean
          job_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_org_admin: {
        Args: { p_org_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { p_org_id: string; p_user_id?: string }
        Returns: boolean
      }
      mark_alert_jobs_delivered: {
        Args: {
          p_alert_id: string
          p_delivery_id?: string
          p_job_ids: string[]
        }
        Returns: undefined
      }
      mark_alert_jobs_failed: {
        Args: {
          p_alert_id: string
          p_error_message?: string
          p_job_ids: string[]
        }
        Returns: undefined
      }
      onboard_company_and_source: {
        Args: {
          p_careers_url: string
          p_company_domain: string
          p_company_name: string
          p_company_slug: string
          p_health_status?: Database["public"]["Enums"]["health_status_enum"]
          p_is_active?: boolean
          p_normalized_name: string
          p_priority?: number
          p_schedule_interval_minutes?: number
          p_source_id: string
          p_source_identifier: string
          p_source_url: string
        }
        Returns: Json
      }
      purge_orphaned_jobs: {
        Args: {
          p_batch_size?: number
          p_max_batches?: number
          p_retention_days?: number
        }
        Returns: Json
      }
      purge_stale_job_records: {
        Args: {
          p_batch_size?: number
          p_max_batches?: number
          p_retention_days?: number
        }
        Returns: Json
      }
      purge_stale_raw_payloads: {
        Args: {
          p_batch_size?: number
          p_max_batches?: number
          p_retention_days?: number
        }
        Returns: Json
      }
      reconcile_company_source_job_lifecycle: {
        Args: {
          p_company_id: string
          p_consecutive_miss_threshold?: number
          p_crawled_external_ids: string[]
          p_max_staleness_days?: number
          p_scrape_time?: string
        }
        Returns: Json
      }
      reconcile_source_job_lifecycle: {
        Args: {
          p_company_source_id: string
          p_consecutive_miss_threshold?: number
          p_crawled_external_ids: string[]
          p_max_staleness_days?: number
          p_scrape_time?: string
          p_source_id: string
        }
        Returns: Json
      }
      record_job_alert_delivery: {
        Args: {
          p_alert_id: string
          p_channel: string
          p_error_message?: string
          p_matched_job_ids: string[]
          p_metadata?: Json
          p_status: string
          p_user_id: string
        }
        Returns: string
      }
      recover_stale_sync_events: {
        Args: { p_lease_seconds?: number }
        Returns: number
      }
      release_scrape_lock: {
        Args: { p_holder_id: string; p_lock_key: string }
        Returns: boolean
      }
      retry_sync_events_bulk: {
        Args: {
          p_max_manual_retries?: number
          p_organization_id?: string
          p_user_id: string
        }
        Returns: number
      }
      review_application_verification: {
        Args: {
          p_reviewer_notes?: string
          p_status: Database["public"]["Enums"]["verification_status_enum"]
          p_verification_id: string
        }
        Returns: {
          application_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          organization_id: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          screenshot_url: string
          status: Database["public"]["Enums"]["verification_status_enum"]
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "application_verifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_admin_scrape_run: {
        Args: {
          p_admin_id: string
          p_company_identifier?: string
          p_execution_mode?: string
          p_source_id?: string
          p_ttl_seconds?: number
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_application_verification: {
        Args: {
          p_application_id: string
          p_idempotency_key?: string
          p_screenshot_url: string
        }
        Returns: {
          application_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          organization_id: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          screenshot_url: string
          status: Database["public"]["Enums"]["verification_status_enum"]
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "application_verifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_organization_ownership: {
        Args: { p_new_owner_user_id: string; p_organization_id: string }
        Returns: Json
      }
      try_acquire_scrape_lock: {
        Args: {
          p_holder_id: string
          p_lock_key: string
          p_ttl_seconds?: number
        }
        Returns: boolean
      }
      upsert_user_integration_with_secret: {
        Args: {
          p_config: Json
          p_encrypted_refresh_token: string
          p_key_version?: number
          p_organization_id: string
          p_provider: string
          p_token_auth_tag: string
          p_token_expires_at?: string
          p_token_iv: string
          p_user_id: string
        }
        Returns: Json
      }
      verify_worker_access: { Args: never; Returns: boolean }
    }
    Enums: {
      application_status_enum:
        | "saved"
        | "applied"
        | "screening"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
        | "archived"
      assignment_status_enum:
        | "assigned"
        | "in_progress"
        | "completed"
        | "skipped"
        | "cancelled"
      employment_type_enum:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "temporary"
        | "other"
      health_status_enum: "healthy" | "degraded" | "failing" | "disabled"
      job_status_enum: "active" | "suspect" | "stale" | "expired" | "removed"
      org_role_enum: "owner" | "admin" | "worker"
      payment_status_enum: "pending" | "success" | "failed"
      scrape_run_status_enum:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      source_type_enum:
        | "ats_direct"
        | "aggregator"
        | "sitemap"
        | "feed"
        | "manual"
      subscription_status_enum:
        | "active"
        | "non_renewing"
        | "attention"
        | "cancelled"
        | "completed"
      sync_event_status_enum:
        | "pending"
        | "processing"
        | "synced"
        | "failed"
        | "dead_letter"
      sync_status_enum: "pending" | "synced" | "failed"
      verification_status_enum: "pending" | "verified" | "rejected"
      webhook_status_enum: "pending" | "processed" | "failed"
      workplace_type_enum: "remote" | "hybrid" | "on_site" | "unspecified"
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
    Enums: {
      application_status_enum: [
        "saved",
        "applied",
        "screening",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
        "archived",
      ],
      assignment_status_enum: [
        "assigned",
        "in_progress",
        "completed",
        "skipped",
        "cancelled",
      ],
      employment_type_enum: [
        "full_time",
        "part_time",
        "contract",
        "internship",
        "temporary",
        "other",
      ],
      health_status_enum: ["healthy", "degraded", "failing", "disabled"],
      job_status_enum: ["active", "suspect", "stale", "expired", "removed"],
      org_role_enum: ["owner", "admin", "worker"],
      payment_status_enum: ["pending", "success", "failed"],
      scrape_run_status_enum: [
        "pending",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      source_type_enum: [
        "ats_direct",
        "aggregator",
        "sitemap",
        "feed",
        "manual",
      ],
      subscription_status_enum: [
        "active",
        "non_renewing",
        "attention",
        "cancelled",
        "completed",
      ],
      sync_event_status_enum: [
        "pending",
        "processing",
        "synced",
        "failed",
        "dead_letter",
      ],
      sync_status_enum: ["pending", "synced", "failed"],
      verification_status_enum: ["pending", "verified", "rejected"],
      webhook_status_enum: ["pending", "processed", "failed"],
      workplace_type_enum: ["remote", "hybrid", "on_site", "unspecified"],
    },
  },
} as const
