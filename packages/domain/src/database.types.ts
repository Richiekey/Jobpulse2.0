export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      ats_platforms: {
        Row: {
          id: string;
          name: string;
          slug: string;
          domains: string[];
          job_url_patterns: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          domains: string[];
          job_url_patterns: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          domains?: string[];
          job_url_patterns?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      companies: {
        Row: {
          id: string;
          name: string;
          normalized_name: string;
          slug: string;
          domain: string | null;
          logo_url: string | null;
          website: string | null;
          careers_url: string | null;
          description: string | null;
          industry: string | null;
          company_size: string | null;
          status: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          normalized_name: string;
          slug: string;
          domain?: string | null;
          logo_url?: string | null;
          website?: string | null;
          careers_url?: string | null;
          description?: string | null;
          industry?: string | null;
          company_size?: string | null;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          normalized_name?: string;
          slug?: string;
          domain?: string | null;
          logo_url?: string | null;
          website?: string | null;
          careers_url?: string | null;
          description?: string | null;
          industry?: string | null;
          company_size?: string | null;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      sources: {
        Row: {
          id: string;
          ats_platform_id: string | null;
          source_type: 'ats_direct' | 'aggregator' | 'sitemap' | 'feed' | 'manual';
          name: string;
          adapter_name: string;
          base_url: string | null;
          domain: string | null;
          status: 'healthy' | 'degraded' | 'failing' | 'disabled';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ats_platform_id?: string | null;
          source_type: 'ats_direct' | 'aggregator' | 'sitemap' | 'feed' | 'manual';
          name: string;
          adapter_name: string;
          base_url?: string | null;
          domain?: string | null;
          status?: 'healthy' | 'degraded' | 'failing' | 'disabled';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ats_platform_id?: string | null;
          source_type: 'ats_direct' | 'aggregator' | 'sitemap' | 'feed' | 'manual';
          name?: string;
          adapter_name?: string;
          base_url?: string | null;
          domain?: string | null;
          status?: 'healthy' | 'degraded' | 'failing' | 'disabled';
          created_at?: string;
          updated_at?: string;
        };
      };
      company_sources: {
        Row: {
          id: string;
          company_id: string;
          source_id: string;
          source_identifier: string;
          source_url: string | null;
          adapter_config: Json;
          is_active: boolean;
          health_status: 'healthy' | 'degraded' | 'failing' | 'disabled';
          priority: number;
          schedule_interval_minutes: number;
          consecutive_failures: number;
          last_checked_at: string | null;
          last_success_at: string | null;
          last_failure_at: string | null;
          last_error: string | null;
          last_job_count: number;
          discovery_method: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          source_id: string;
          source_identifier: string;
          source_url?: string | null;
          adapter_config?: Json;
          is_active?: boolean;
          health_status?: 'healthy' | 'degraded' | 'failing' | 'disabled';
          priority?: number;
          schedule_interval_minutes?: number;
          consecutive_failures?: number;
          last_checked_at?: string | null;
          last_success_at?: string | null;
          last_failure_at?: string | null;
          last_error?: string | null;
          last_job_count?: number;
          discovery_method?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          source_id?: string;
          source_identifier?: string;
          source_url?: string | null;
          adapter_config?: Json;
          is_active?: boolean;
          health_status?: 'healthy' | 'degraded' | 'failing' | 'disabled';
          priority?: number;
          schedule_interval_minutes?: number;
          consecutive_failures?: number;
          last_checked_at?: string | null;
          last_success_at?: string | null;
          last_failure_at?: string | null;
          last_error?: string | null;
          last_job_count?: number;
          discovery_method?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      job_functions: {
        Row: {
          id: string;
          name: string;
          slug: string;
          parent_slug: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          parent_slug?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          parent_slug?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          canonical_title: string;
          display_title: string;
          description: string;
          description_html: string | null;
          employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'other';
          workplace_type: 'remote' | 'hybrid' | 'on_site' | 'unspecified';
          locations: string[];
          salary_min: number | null;
          salary_max: number | null;
          salary_currency: string | null;
          salary_interval: string | null;
          annualized_min: number | null;
          annualized_max: number | null;
          has_salary: boolean;
          equity_mentioned: boolean;
          skills: string[];
          posted_at: string;
          first_seen_at: string;
          last_seen_at: string;
          expires_at: string | null;
          status: 'active' | 'suspect' | 'stale' | 'expired' | 'removed';
          missed_scrape_count: number;
          canonical_url: string;
          apply_url: string;
          original_apply_url: string | null;
          url_resolution_method: string;
          url_resolution_confidence: number;
          canonical_fingerprint: string | null;
          source_metadata: Json;
          search_vector?: unknown;
          created_at: string;
          updated_at: string;
          ats_platform_slug: string | null;
          job_function_slug: string | null;
          job_function_confidence: string | null;
          location_country: string | null;
          location_region: string | null;
          location_city: string | null;
          is_remote: boolean;
        };
        Insert: {
          id?: string;
          company_id: string;
          canonical_title: string;
          display_title: string;
          description: string;
          description_html?: string | null;
          employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'other';
          workplace_type: 'remote' | 'hybrid' | 'on_site' | 'unspecified';
          locations: string[];
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string | null;
          salary_interval?: string | null;
          annualized_min?: number | null;
          annualized_max?: number | null;
          has_salary?: boolean;
          equity_mentioned?: boolean;
          skills?: string[];
          posted_at: string;
          first_seen_at?: string;
          last_seen_at?: string;
          expires_at?: string | null;
          status?: 'active' | 'suspect' | 'stale' | 'expired' | 'removed';
          missed_scrape_count?: number;
          canonical_url: string;
          apply_url: string;
          original_apply_url?: string | null;
          url_resolution_method: string;
          url_resolution_confidence: number;
          canonical_fingerprint?: string | null;
          source_metadata?: Json;
          created_at?: string;
          updated_at?: string;
          ats_platform_slug?: string | null;
          job_function_slug?: string | null;
          job_function_confidence?: string | null;
          location_country?: string | null;
          location_region?: string | null;
          location_city?: string | null;
          is_remote?: boolean;
        };
        Update: {
          id?: string;
          company_id?: string;
          canonical_title?: string;
          display_title?: string;
          description?: string;
          description_html?: string | null;
          employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'other';
          workplace_type?: 'remote' | 'hybrid' | 'on_site' | 'unspecified';
          locations?: string[];
          salary_min?: number | null;
          salary_max?: number | null;
          salary_currency?: string | null;
          salary_interval?: string | null;
          annualized_min?: number | null;
          annualized_max?: number | null;
          has_salary?: boolean;
          equity_mentioned?: boolean;
          skills?: string[];
          posted_at?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          expires_at?: string | null;
          status?: 'active' | 'suspect' | 'stale' | 'expired' | 'removed';
          missed_scrape_count?: number;
          canonical_url?: string;
          apply_url?: string;
          original_apply_url?: string | null;
          url_resolution_method?: string;
          url_resolution_confidence?: number;
          canonical_fingerprint?: string | null;
          source_metadata?: Json;
          created_at?: string;
          updated_at?: string;
          ats_platform_slug?: string | null;
          job_function_slug?: string | null;
          job_function_confidence?: string | null;
          location_country?: string | null;
          location_region?: string | null;
          location_city?: string | null;
          is_remote?: boolean;
        };
      };
      job_sources: {
        Row: {
          id: string;
          job_id: string;
          source_id: string;
          external_job_id: string;
          discovery_url: string;
          source_job_url: string;
          raw_payload_hash: string;
          first_seen_at: string;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          source_id: string;
          external_job_id: string;
          discovery_url: string;
          source_job_url: string;
          raw_payload_hash: string;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          source_id?: string;
          external_job_id?: string;
          discovery_url?: string;
          source_job_url?: string;
          raw_payload_hash?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      raw_job_payloads: {
        Row: {
          id: string;
          source_id: string;
          external_id: string;
          payload: Json;
          payload_hash: string;
          parser_version: string;
          fetched_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          external_id: string;
          payload: Json;
          payload_hash: string;
          parser_version: string;
          fetched_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          external_id?: string;
          payload?: Json;
          payload_hash?: string;
          parser_version?: string;
          fetched_at?: string;
          created_at?: string;
        };
      };
      scrape_runs: {
        Row: {
          id: string;
          started_at: string;
          completed_at: string | null;
          status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
          companies_attempted: number;
          companies_succeeded: number;
          companies_failed: number;
          jobs_discovered: number;
          jobs_inserted: number;
          jobs_updated: number;
          jobs_rejected: number;
          jobs_failed: number;
          error_summary: Json;
          metadata: Json;
        };
        Insert: {
          id?: string;
          started_at?: string;
          completed_at?: string | null;
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
          companies_attempted?: number;
          companies_succeeded?: number;
          companies_failed?: number;
          jobs_discovered?: number;
          jobs_inserted?: number;
          jobs_updated?: number;
          jobs_rejected?: number;
          jobs_failed?: number;
          error_summary?: Json;
          metadata?: Json;
        };
        Update: {
          id?: string;
          started_at?: string;
          completed_at?: string | null;
          status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
          companies_attempted?: number;
          companies_succeeded?: number;
          companies_failed?: number;
          jobs_discovered?: number;
          jobs_inserted?: number;
          jobs_updated?: number;
          jobs_rejected?: number;
          jobs_failed?: number;
          error_summary?: Json;
          metadata?: Json;
        };
      };
      scrape_run_sources: {
        Row: {
          id: string;
          scrape_run_id: string;
          company_source_id: string;
          status: string;
          jobs_discovered: number;
          jobs_inserted: number;
          jobs_updated: number;
          jobs_rejected: number;
          jobs_failed: number;
          error_message: string | null;
          duration_ms: number;
          metadata: Json;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          scrape_run_id: string;
          company_source_id: string;
          status: string;
          jobs_discovered?: number;
          jobs_inserted?: number;
          jobs_updated?: number;
          jobs_rejected?: number;
          jobs_failed?: number;
          error_message?: string | null;
          duration_ms?: number;
          metadata?: Json;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          scrape_run_id?: string;
          company_source_id?: string;
          status?: string;
          jobs_discovered?: number;
          jobs_inserted?: number;
          jobs_updated?: number;
          jobs_rejected?: number;
          jobs_failed?: number;
          error_message?: string | null;
          duration_ms?: number;
          metadata?: Json;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
        };
      };
      scrape_locks: {
        Row: {
          lock_key: string;
          holder_id: string;
          acquired_at: string;
          expires_at: string;
        };
        Insert: {
          lock_key: string;
          holder_id: string;
          acquired_at?: string;
          expires_at: string;
        };
        Update: {
          lock_key?: string;
          holder_id?: string;
          acquired_at?: string;
          expires_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      applications: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          company_name: string;
          job_title: string;
          status: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'archived';
          applied_at: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          company_name: string;
          job_title: string;
          status?: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'archived';
          applied_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_id?: string | null;
          company_name?: string;
          job_title?: string;
          status?: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'archived';
          applied_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      saved_jobs: {
        Row: {
          id: string;
          user_id: string;
          job_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_id?: string;
          created_at?: string;
        };
      };
      hidden_jobs: {
        Row: {
          id: string;
          user_id: string;
          job_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_id?: string;
          created_at?: string;
        };
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          target_titles: string[];
          target_locations: string[];
          workplace_preferences: string[];
          min_salary_target: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_titles?: string[];
          target_locations?: string[];
          workplace_preferences?: string[];
          min_salary_target?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          target_titles?: string[];
          target_locations?: string[];
          workplace_preferences?: string[];
          min_salary_target?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Enums: {
      application_status_enum: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'archived';
      employment_type_enum: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'other';
      health_status_enum: 'healthy' | 'degraded' | 'failing' | 'disabled';
      job_status_enum: 'active' | 'suspect' | 'stale' | 'expired' | 'removed';
      scrape_run_status_enum: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      source_type_enum: 'ats_direct' | 'aggregator' | 'sitemap' | 'feed' | 'manual';
      sync_status_enum: 'pending' | 'synced' | 'failed';
      workplace_type_enum: 'remote' | 'hybrid' | 'on_site' | 'unspecified';
    };
    Functions: {
      ingest_job_transaction: {
        Args: {
          p_company_id: string;
          p_canonical_title: string;
          p_display_title: string;
          p_description: string;
          p_description_html?: string | null;
          p_employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'other';
          p_workplace_type?: 'remote' | 'hybrid' | 'on_site' | 'unspecified';
          p_locations?: string[];
          p_salary_min?: number | null;
          p_salary_max?: number | null;
          p_salary_currency?: string | null;
          p_salary_interval?: string | null;
          p_annualized_min?: number | null;
          p_annualized_max?: number | null;
          p_has_salary?: boolean;
          p_equity_mentioned?: boolean;
          p_skills?: string[];
          p_posted_at?: string;
          p_canonical_url?: string;
          p_apply_url?: string;
          p_original_apply_url?: string | null;
          p_url_resolution_method?: string;
          p_url_resolution_confidence?: number;
          p_canonical_fingerprint?: string | null;
          p_source_id?: string | null;
          p_external_job_id?: string;
          p_source_job_url?: string;
          p_discovery_url?: string;
          p_raw_payload_hash?: string;
          p_raw_payload?: Json;
          p_parser_version?: string;
          p_source_metadata?: Json;
          p_ats_platform_slug?: string | null;
          p_job_function_slug?: string | null;
          p_job_function_confidence?: string | null;
          p_location_country?: string | null;
          p_location_region?: string | null;
          p_location_city?: string | null;
          p_is_remote?: boolean;
        };
        Returns: {
          status: 'inserted' | 'updated';
          job_id: string;
          job_source_id: string;
        };
      };
      try_acquire_scrape_lock: {
        Args: {
          p_lock_key: string;
          p_holder_id: string;
          p_ttl_seconds?: number;
        };
        Returns: boolean;
      };
      release_scrape_lock: {
        Args: {
          p_lock_key: string;
          p_holder_id: string;
        };
        Returns: boolean;
      };
      claim_next_pending_scrape_run: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          started_at: string;
          status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
          metadata: Json;
        }>;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
  };
}
