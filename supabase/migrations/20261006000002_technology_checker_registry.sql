CREATE TYPE verification_status_enum AS ENUM (
  'pending',
  'verified',
  'failed',
  'ignored'
);

CREATE TABLE IF NOT EXISTS public.discovery_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  domain text NOT NULL,
  company_name text NOT NULL,
  ats_provider text NOT NULL,
  technology_checker_id bigint,
  detection_domain text,
  detection_url text,
  country text,
  industry text,
  employees text,
  discovery_source text NOT NULL,
  discovery_confidence numeric(5,4),
  adapter text,
  adapter_status text,
  verification_status text DEFAULT 'pending',
  first_discovered_at timestamptz DEFAULT now(),
  last_verified_at timestamptz,
  last_scraped_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  UNIQUE(domain, ats_provider)
);

ALTER TABLE public.discovery_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Worker service role has full access to discovery_registry"
  ON public.discovery_registry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for querying unresolved discoveries
CREATE INDEX idx_discovery_registry_verification ON public.discovery_registry(verification_status, adapter_status);
CREATE INDEX idx_discovery_registry_domain ON public.discovery_registry(domain);
