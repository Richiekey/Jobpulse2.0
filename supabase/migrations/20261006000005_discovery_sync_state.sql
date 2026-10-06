-- Phase 8: Incremental synchronization state tracking

CREATE TABLE IF NOT EXISTS public.discovery_sync_state (
  ats_provider text PRIMARY KEY,
  technology_checker_id bigint NOT NULL,
  last_sync_at timestamptz,
  last_full_sync_at timestamptz,
  total_companies integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.discovery_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Worker service role has full access to discovery_sync_state"
  ON public.discovery_sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
