-- ============================================================================
-- JobPulse 2.0 — Alert Delivery Idempotency & Concurrency Invariant
-- Version: 20260829000012
-- Description: Adds persistent composite primary key table public.job_alert_delivered_jobs
--              and atomic claim_undelivered_alert_jobs RPC to prevent duplicate notifications.
-- ============================================================================

-- 1. DURABLE IDEMPOTENCY LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.job_alert_delivered_jobs (
    alert_id UUID NOT NULL REFERENCES public.job_alerts(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    delivery_id UUID REFERENCES public.job_alert_deliveries(id) ON DELETE SET NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alert_id, job_id)
);

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_alert_delivered_jobs_alert ON public.job_alert_delivered_jobs(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_delivered_jobs_job ON public.job_alert_delivered_jobs(job_id);

-- 3. RLS
ALTER TABLE public.job_alert_delivered_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own alert delivered jobs" ON public.job_alert_delivered_jobs;
CREATE POLICY "Users can read own alert delivered jobs"
ON public.job_alert_delivered_jobs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.job_alerts a
        WHERE a.id = job_alert_delivered_jobs.alert_id
          AND a.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Service role manages delivered jobs" ON public.job_alert_delivered_jobs;
CREATE POLICY "Service role manages delivered jobs"
ON public.job_alert_delivered_jobs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. ATOMIC RPC: CLAIM UNDELIVERED ALERT JOBS
-- Filters candidate job IDs for an alert, inserts claims atomically, and returns only newly claimed IDs.
CREATE OR REPLACE FUNCTION public.claim_undelivered_alert_jobs(
    p_alert_id UUID,
    p_job_ids UUID[]
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claimed_ids UUID[];
BEGIN
    IF p_job_ids IS NULL OR array_length(p_job_ids, 1) IS NULL THEN
        RETURN '{}'::UUID[];
    END IF;

    WITH candidate_jobs AS (
        SELECT unnest(p_job_ids) AS jid
    ),
    inserted_claims AS (
        INSERT INTO public.job_alert_delivered_jobs (alert_id, job_id, delivered_at)
        SELECT p_alert_id, c.jid, now()
        FROM candidate_jobs c
        ON CONFLICT (alert_id, job_id) DO NOTHING
        RETURNING job_id
    )
    SELECT coalesce(array_agg(job_id), '{}'::UUID[])
    INTO v_claimed_ids
    FROM inserted_claims;

    RETURN v_claimed_ids;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_undelivered_alert_jobs FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_undelivered_alert_jobs TO authenticated, service_role;
