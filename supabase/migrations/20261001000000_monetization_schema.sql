-- ============================================================================
-- Jobpulse 2.0 — Monetization Schema
-- Description: Subscriptions, plans, payments, and webhook idempotency.
-- ============================================================================

CREATE TYPE subscription_status_enum AS ENUM ('active', 'non_renewing', 'attention', 'cancelled', 'completed');
CREATE TYPE payment_status_enum AS ENUM ('pending', 'success', 'failed');
CREATE TYPE webhook_status_enum AS ENUM ('pending', 'processed', 'failed');

-- 1. BILLING PLANS
CREATE TABLE IF NOT EXISTS public.billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    currency TEXT NOT NULL DEFAULT 'NGN',
    amount NUMERIC NOT NULL,
    interval TEXT NOT NULL CHECK (interval IN ('monthly', 'annually')),
    provider TEXT NOT NULL DEFAULT 'paystack',
    provider_plan_code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'paystack',
    provider_customer_id TEXT NOT NULL,
    provider_subscription_id TEXT UNIQUE,
    provider_email TEXT NOT NULL,
    status subscription_status_enum NOT NULL DEFAULT 'active',
    currency TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    interval TEXT NOT NULL,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure a user only has one active subscription at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_active_subscription 
ON public.subscriptions (user_id) 
WHERE status IN ('active', 'non_renewing', 'attention');

-- 3. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'paystack',
    provider_transaction_id TEXT UNIQUE,
    reference TEXT UNIQUE,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    status payment_status_enum NOT NULL DEFAULT 'pending',
    payment_type TEXT NOT NULL,
    paid_at TIMESTAMPTZ,
    raw_event_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. WEBHOOK EVENTS (Idempotency)
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'paystack',
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    status webhook_status_enum NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. INITIALIZE PLANS
INSERT INTO public.billing_plans (code, name, description, currency, amount, interval, provider, provider_plan_code, is_active)
VALUES 
    ('free', 'Free', 'Basic job search and tracking', 'NGN', 0, 'monthly', 'paystack', NULL, true),
    ('pro_monthly', 'Jobpulse Pro Monthly', 'Unlimited access to advanced tools', 'NGN', 7500, 'monthly', 'paystack', NULL, true),
    ('pro_annual', 'Jobpulse Pro Annual', 'Unlimited access, billed annually', 'NGN', 75000, 'annually', 'paystack', NULL, true)
ON CONFLICT (code) DO NOTHING;

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active billing plans" 
    ON public.billing_plans FOR SELECT 
    USING (is_active = true OR public.is_admin());

CREATE POLICY "Users can view their own subscriptions" 
    ON public.subscriptions FOR SELECT 
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Users can view their own payments" 
    ON public.payments FOR SELECT 
    USING (auth.uid() = user_id OR public.is_admin());

-- Webhook events are entirely restricted to service_role and admin
CREATE POLICY "Admins can view webhook events" 
    ON public.billing_webhook_events FOR SELECT 
    USING (public.is_admin());

-- Notice: No INSERT/UPDATE/DELETE policies are granted to authenticated users.
-- All write operations must happen server-side via `service_role`.
