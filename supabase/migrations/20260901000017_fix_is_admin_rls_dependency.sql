-- Migration: Fix RLS policy dependency on is_admin()
-- The security hardening migration (0016) revoked EXECUTE on is_admin() from anon/authenticated.
-- However, RLS policies on jobs and companies tables call is_admin() in their qualifiers:
--   "(status = 'active') OR is_admin()"
-- When anon users query these tables, PostgreSQL evaluates the RLS policy and fails
-- because anon cannot execute is_admin(). The function is safe to expose — it simply
-- returns false for non-admin users.

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
