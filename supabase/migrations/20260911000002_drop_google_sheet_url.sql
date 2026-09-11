-- Corrective migration: Remove google_sheet_url from worker_profiles
-- The manual Sheet URL architecture was a regression. JobPulse 2.0 uses
-- Batch N's Google OAuth + user_integrations architecture instead.
ALTER TABLE public.worker_profiles DROP COLUMN IF EXISTS google_sheet_url;
