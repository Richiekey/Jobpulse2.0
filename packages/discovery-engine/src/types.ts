export interface JobEvidence {
  job_url: string;
  job_title: string;
  discovered_at: string;
  source_provider: string;
}

export interface DiscoveryEvidence {
  provider: string;
  timestamp: string;
  evidence_type: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface DiscoveryCandidate {
  company_name: string;
  company_domain: string;
  careers_url?: string | null;
  source_url?: string | null;
  detected_ats?: string | null;
  ats_url?: string | null;
  board_identifier?: string | null;
  job_evidence: JobEvidence[];
  discovered_from: string;          // Primary / first provider name
  discovered_at: string;
  evidence: DiscoveryEvidence[];    // Structured evidence array
  confidence: number;
}

export interface DiscoveryRunOptions {
  provider?: string;
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface DiscoveryRunMetrics {
  providers_attempted: number;
  providers_succeeded: number;
  raw_candidates: number;
  unique_companies: number;
  duplicate_candidates: number;
  careers_pages_found: number;
  ats_detected: number;
  supported_ats_detected: number;
  unsupported_ats: number;
  job_evidence_count: number;
  candidates_persisted: number;
  candidates_updated: number;
  candidates_skipped: number;
  errors: number;
  duration_ms: number;
}
