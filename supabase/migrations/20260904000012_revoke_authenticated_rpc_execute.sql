-- Migration 0036: Revoke authenticated EXECUTE on upsert_user_integration_with_secret
-- Ensures that the atomic integration & secret persistence RPC can only be executed by service_role (and postgres owner).
-- Explicitly revokes EXECUTE from authenticated, anon, and PUBLIC.

REVOKE EXECUTE ON FUNCTION public.upsert_user_integration_with_secret(UUID, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, INT) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_user_integration_with_secret(UUID, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TIMESTAMPTZ, INT) TO service_role;

-- Record migration in schema_migrations
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20260904230000', ARRAY['-- Revoke authenticated EXECUTE on upsert_user_integration_with_secret'], 'revoke_authenticated_rpc_execute')
ON CONFLICT (version) DO NOTHING;
