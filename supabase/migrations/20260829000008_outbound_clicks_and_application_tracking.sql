-- ============================================================================
-- JobPulse 2.0 — Outbound Clicks Telemetry & Application Tracking Enhancements
-- Version: 20260829000008
-- Description: Creates outbound_clicks table and optimizes applications indexes and RLS.
-- ============================================================================

-- 1. OUTBOUND CLICKS TABLE
CREATE TABLE IF NOT EXISTS public.outbound_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    destination_url TEXT NOT NULL,
    url_resolution_confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (url_resolution_confidence >= 0 AND url_resolution_confidence <= 1.00),
    user_agent TEXT,
    referrer TEXT,
    ip_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_job_time
    ON public.outbound_clicks(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_user_time
    ON public.outbound_clicks(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

ALTER TABLE public.outbound_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow inserting outbound clicks"
    ON public.outbound_clicks FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow users to view own clicks"
    ON public.outbound_clicks FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

-- 2. APPLICATION TRACKING OPTIMIZATIONS
CREATE INDEX IF NOT EXISTS idx_applications_user_status
    ON public.applications(user_id, status, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_user_job
    ON public.applications(user_id, job_id)
    WHERE job_id IS NOT NULL;
