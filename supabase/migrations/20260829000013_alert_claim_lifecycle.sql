-- ============================================================================
-- JobPulse 2.0 — Alert Claim vs Delivery State Machine & Lease Expiration
-- Version: 20260829000013
-- Description: Separates claimed from delivered status. Failed deliveries and
--              crashed workers become eligible for retry via lease expiration.
-- ============================================================================

-- 1. ALTER public.job_alert_delivered_jobs to support full claim lifecycle
ALTER TABLE public.job_alert_delivered_jobs
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('claimed', 'delivered', 'failed')),
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 2. INDEX FOR FAST LEASE & STATUS LOOKUPS
CREATE INDEX IF NOT EXISTS idx_alert_delivered_jobs_status_claimed 
ON public.job_alert_delivered_jobs(alert_id, status, claimed_at);

-- 3. ATOMIC RPC: CLAIM UNDELIVERED ALERT JOBS (WITH LEASE EXPIRATION & FAILED RETRY)
CREATE OR REPLACE FUNCTION public.claim_undelivered_alert_jobs(
    p_alert_id UUID,
    p_job_ids UUID[],
    p_lease_seconds INT DEFAULT 600
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claimed_ids UUID[];
    v_cutoff TIMESTAMPTZ := now() - (p_lease_seconds || ' seconds')::interval;
BEGIN
    IF p_job_ids IS NULL OR array_length(p_job_ids, 1) IS NULL THEN
        RETURN '{}'::UUID[];
    END IF;

    WITH candidate_jobs AS (
        SELECT unnest(p_job_ids) AS jid
    ),
    inserted_or_reclaimed AS (
        INSERT INTO public.job_alert_delivered_jobs (
            alert_id,
            job_id,
            status,
            claimed_at,
            attempts
        )
        SELECT 
            p_alert_id,
            c.jid,
            'claimed',
            now(),
            1
        FROM candidate_jobs c
        ON CONFLICT (alert_id, job_id) DO UPDATE
        SET status = 'claimed',
            claimed_at = now(),
            attempts = public.job_alert_delivered_jobs.attempts + 1
        WHERE (public.job_alert_delivered_jobs.status = 'failed')
           OR (public.job_alert_delivered_jobs.status = 'claimed' AND public.job_alert_delivered_jobs.claimed_at < v_cutoff)
        RETURNING job_id
    )
    SELECT coalesce(array_agg(job_id), '{}'::UUID[])
    INTO v_claimed_ids
    FROM inserted_or_reclaimed;

    RETURN v_claimed_ids;
END;
$$;

-- 4. ATOMIC RPC: MARK ALERT JOBS DELIVERED
CREATE OR REPLACE FUNCTION public.mark_alert_jobs_delivered(
    p_alert_id UUID,
    p_job_ids UUID[],
    p_delivery_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_job_ids IS NULL OR array_length(p_job_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.job_alert_delivered_jobs
    SET status = 'delivered',
        delivered_at = now(),
        delivery_id = coalesce(p_delivery_id, delivery_id)
    WHERE alert_id = p_alert_id
      AND job_id = ANY(p_job_ids);
END;
$$;

-- 5. ATOMIC RPC: MARK ALERT JOBS FAILED
CREATE OR REPLACE FUNCTION public.mark_alert_jobs_failed(
    p_alert_id UUID,
    p_job_ids UUID[],
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_job_ids IS NULL OR array_length(p_job_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.job_alert_delivered_jobs
    SET status = 'failed',
        error_message = p_error_message
    WHERE alert_id = p_alert_id
      AND job_id = ANY(p_job_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_undelivered_alert_jobs FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_alert_jobs_delivered FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_alert_jobs_failed FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_undelivered_alert_jobs TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_alert_jobs_delivered TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_alert_jobs_failed TO authenticated, service_role;
