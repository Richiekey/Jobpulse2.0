export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      applications: {
        Row: {
          applied_at: string
          company_name: string
          created_at: string
          id: string
          job_id: string | null
          job_title: string
          last_sync_error: string | null
          notes: string | null
          status: Database["public"]["Enums"]["application_status_enum"]
          sync_status: Database["public"]["Enums"]["sync_status_enum"]
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          company_name: string
          created_at?: string
          id?: string
          job_id?: string | null
          job_title: string
          last_sync_error?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["application_status_enum"]
          sync_status?: Database["public"]["Enums"]["sync_status_enum"]
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string
          company_name?: string
          created_at?: string
          id?: string
          job_id?: string | null
          job_title?: string
          last_sync_error?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["application_status_enum"]
          sync_status?: Database["public"]["Enums"]["sync_status_enum"]
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
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
      }
      companies: {
        Row: {
          careers_url: string | null
          created_at: string
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          normalized_name: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          careers_url?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          normalized_name: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          careers_url?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          normalized_name?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
      }
      company_sources: {
        Row: {
          adapter_config: Json
          company_id: string
          consecutive_failures: number
          created_at: string
          health_status: Database["public"]["Enums"]["health_status_enum"]
          id: string
          is_active: boolean
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
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
          health_status?: Database["public"]["Enums"]["health_status_enum"]
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
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
          health_status?: Database["public"]["Enums"]["health_status_enum"]
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          source_id?: string
          source_identifier?: string
          source_url?: string | null
          updated_at?: string
        }
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
      }
      jobs: {
        Row: {
          apply_url: string
          canonical_title: string
          canonical_url: string
          company_id: string
          created_at: string
          description: string
          description_html: string | null
          display_title: string
          employment_type: Database["public"]["Enums"]["employment_type_enum"]
          expires_at: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          locations: string[]
          missed_scrape_count: number
          original_apply_url: string | null
          posted_at: string
          salary_currency: string | null
          salary_interval: string | null
          salary_max: number | null
          salary_min: number | null
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
          apply_url: string
          canonical_title: string
          canonical_url: string
          company_id: string
          created_at?: string
          description: string
          description_html?: string | null
          display_title: string
          employment_type?: Database["public"]["Enums"]["employment_type_enum"]
          expires_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          locations?: string[]
          missed_scrape_count?: number
          original_apply_url?: string | null
          posted_at?: string
          salary_currency?: string | null
          salary_interval?: string | null
          salary_max?: number | null
          salary_min?: number | null
          search_vector?: unknown
          skills?: string[]
          source_metadata?: Json
          status?: Database["public"]["Enums"]["job_status_enum"]
          updated_at?: string
          url_resolution_confidence?: number
          url_resolution_method?: string
          workplace_type?: Database["public"]["Enums"]["workplace_type_enum"]
        }
        Update: {
          apply_url?: string
          canonical_title?: string
          canonical_url?: string
          company_id?: string
          created_at?: string
          description?: string
          description_html?: string | null
          display_title?: string
          employment_type?: Database["public"]["Enums"]["employment_type_enum"]
          expires_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          locations?: string[]
          missed_scrape_count?: number
          original_apply_url?: string | null
          posted_at?: string
          salary_currency?: string | null
          salary_interval?: string | null
          salary_max?: number | null
          salary_min?: number | null
          search_vector?: unknown
          skills?: string[]
          source_metadata?: Json
          status?: Database["public"]["Enums"]["job_status_enum"]
          updated_at?: string
          url_resolution_confidence?: number
          url_resolution_method?: string
          workplace_type?: Database["public"]["Enums"]["workplace_type_enum"]
        }
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
      }
      raw_job_payloads: {
        Row: {
          external_id: string
          fetched_at: string
          id: string
          parser_version: string
          payload: Json
          payload_hash: string
          source_id: string
        }
        Insert: {
          external_id: string
          fetched_at?: string
          id?: string
          parser_version: string
          payload: Json
          payload_hash: string
          source_id: string
        }
        Update: {
          external_id?: string
          fetched_at?: string
          id?: string
          parser_version?: string
          payload?: Json
          payload_hash?: string
          source_id?: string
        }
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
      }
      scrape_run_sources: {
        Row: {
          company_source_id: string
          created_at: string
          duration_ms: number
          error_message: string | null
          id: string
          jobs_discovered: number
          jobs_inserted: number
          jobs_updated: number
          scrape_run_id: string
          status: string
        }
        Insert: {
          company_source_id: string
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          jobs_discovered?: number
          jobs_inserted?: number
          jobs_updated?: number
          scrape_run_id: string
          status: string
        }
        Update: {
          company_source_id?: string
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          jobs_discovered?: number
          jobs_inserted?: number
          jobs_updated?: number
          scrape_run_id?: string
          status?: string
        }
      }
      scrape_runs: {
        Row: {
          companies_attempted: number
          companies_failed: number
          companies_succeeded: number
          completed_at: string | null
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
      }
      user_integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          updated_at?: string
          user_id?: string
        }
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
      }
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
      employment_type_enum:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "temporary"
        | "other"
      health_status_enum: "healthy" | "degraded" | "failing" | "disabled"
      job_status_enum: "active" | "suspect" | "stale" | "expired" | "removed"
      scrape_run_status_enum: "running" | "completed" | "failed" | "cancelled"
      source_type_enum:
        | "ats_direct"
        | "aggregator"
        | "sitemap"
        | "feed"
        | "manual"
      sync_status_enum: "pending" | "synced" | "failed"
      workplace_type_enum: "remote" | "hybrid" | "on_site" | "unspecified"
    }
  }
}
