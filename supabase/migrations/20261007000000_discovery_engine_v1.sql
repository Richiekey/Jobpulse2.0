-- Migration: 20261007000000_discovery_engine_v1.sql
-- Description: Extend discovery_registry with multi-provider provenance and active hiring evidence.

-- Multi-provider provenance (append-only array of provider names)
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS discovery_providers text[] DEFAULT '{}';

-- Structured evidence from all providers (append-only JSONB array)
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS discovery_evidence jsonb DEFAULT '[]'::jsonb;

-- Careers page tracking
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS careers_url text;

-- Job evidence count (proof of active hiring)
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS job_evidence_count integer DEFAULT 0;

-- Idempotency: when was this company last seen by any provider?
ALTER TABLE public.discovery_registry
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Index for idempotent queries and freshness sorting
CREATE INDEX IF NOT EXISTS idx_discovery_registry_last_seen
  ON public.discovery_registry(last_seen_at DESC);
