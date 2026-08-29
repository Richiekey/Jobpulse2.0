-- ============================================================================
-- JobPulse 2.0 — Job Alerts & Automated Notification Engine
-- Version: 20260829000011
-- Description: Creates schema for user search alerts, notification channels,
--              delivery tracking, and atomic delivery logging RPC.
-- ============================================================================

-- 1. JOB ALERTS TABLE
CREATE TABLE IF NOT EXISTS public.job_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    query TEXT,
    location TEXT,
    department TEXT,
    employment_type TEXT,
    remote_type TEXT CHECK (remote_type IN ('remote', 'hybrid', 'onsite', 'any')),
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('instant', 'daily', 'weekly')),
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'webhook', 'in_app')),
    webhook_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. JOB ALERT DELIVERIES TABLE (Historical tracking & anti-duplicate ledger)
CREATE TABLE IF NOT EXISTS public.job_alert_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES public.job_alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    matched_job_ids UUID[] NOT NULL DEFAULT '{}',
    channel TEXT NOT NULL CHECK (channel IN ('email', 'webhook', 'in_app')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES FOR PERFORMANCE & SCAN OPTIMIZATION
CREATE INDEX IF NOT EXISTS idx_job_alerts_user_id ON public.job_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_alerts_active_frequency ON public.job_alerts(frequency) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_job_alert_deliveries_alert_id ON public.job_alert_deliveries(alert_id, dispatched_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_alert_deliveries_user_id ON public.job_alert_deliveries(user_id, dispatched_at DESC);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_alert_deliveries ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own job alerts
DROP POLICY IF EXISTS "Users can read own job alerts" ON public.job_alerts;
CREATE POLICY "Users can read own job alerts"
ON public.job_alerts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own job alerts" ON public.job_alerts;
CREATE POLICY "Users can insert own job alerts"
ON public.job_alerts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own job alerts" ON public.job_alerts;
CREATE POLICY "Users can update own job alerts"
ON public.job_alerts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own job alerts" ON public.job_alerts;
CREATE POLICY "Users can delete own job alerts"
ON public.job_alerts FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Deliveries: Users can view their own deliveries
DROP POLICY IF EXISTS "Users can read own job alert deliveries" ON public.job_alert_deliveries;
CREATE POLICY "Users can read own job alert deliveries"
ON public.job_alert_deliveries FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role full access
DROP POLICY IF EXISTS "Service role manages job alerts" ON public.job_alerts;
CREATE POLICY "Service role manages job alerts"
ON public.job_alerts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages job alert deliveries" ON public.job_alert_deliveries;
CREATE POLICY "Service role manages job alert deliveries"
ON public.job_alert_deliveries FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. ATOMIC RPC: RECORD JOB ALERT DELIVERY
CREATE OR REPLACE FUNCTION public.record_job_alert_delivery(
    p_alert_id UUID,
    p_user_id UUID,
    p_matched_job_ids UUID[],
    p_channel TEXT,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_delivery_id UUID;
BEGIN
    INSERT INTO public.job_alert_deliveries (
        alert_id,
        user_id,
        matched_job_ids,
        channel,
        status,
        error_message,
        metadata,
        dispatched_at
    ) VALUES (
        p_alert_id,
        p_user_id,
        p_matched_job_ids,
        p_channel,
        p_status,
        p_error_message,
        p_metadata,
        now()
    ) RETURNING id INTO v_delivery_id;

    -- Update last_dispatched_at timestamp on the parent alert
    UPDATE public.job_alerts
    SET last_dispatched_at = now(),
        updated_at = now()
    WHERE id = p_alert_id;

    RETURN v_delivery_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_job_alert_delivery FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_job_alert_delivery TO authenticated, service_role;
