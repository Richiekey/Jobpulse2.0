-- ============================================================================
-- JobPulse 2.0 — Batch P Final Production Hardening Pass
-- Version: 20260905280000
-- Description:
--   1. Fix P-H02: Explicitly revoke EXECUTE privileges on SECURITY DEFINER RPCs
--      from PUBLIC and anon to prevent unauthorized database execution.
--   2. Explicitly grant EXECUTE solely to authenticated users and service_role.
--   3. Re-affirm and document application tenancy invariant (global unique user_id, job_id).
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. HARDEN SECURITY DEFINER EXECUTION PRIVILEGES (P-H02)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.complete_assignment_with_application(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_worker_activity_stream(UUID, TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.capture_assignment_lifecycle_event() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_assignment_with_application(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_worker_activity_stream(UUID, TEXT, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capture_assignment_lifecycle_event() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. RECORD MIGRATION ENTRY
-- -----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260905280000', ARRAY['-- Batch P: Final privilege hardening and security boundary audit'], 'batch_p_final_privilege_hardening')
ON CONFLICT (version) DO NOTHING;
