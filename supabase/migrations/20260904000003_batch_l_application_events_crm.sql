-- =============================================================================
-- Migration 0027: Batch L — Application Tracking, CRM & Event Sourcing
-- =============================================================================
-- Purpose:
--   1. Create immutable application_events audit log table.
--   2. Establish performance indexes for timeline queries and tenancy filters.
--   3. Configure strict Row Level Security (RLS) policies preventing cross-tenant leakage.
--   4. Implement automatic database-level event sourcing trigger on applications.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. APPLICATION EVENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  from_status public.application_status_enum,
  to_status public.application_status_enum,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_app_events_app_created 
  ON public.application_events(application_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_app_events_org_created 
  ON public.application_events(organization_id, created_at DESC) 
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_events_actor 
  ON public.application_events(actor_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

-- 2.1 SELECT: Application Owner or Organization Admin / Platform Admin
DROP POLICY IF EXISTS "authorized_users_view_application_events" ON public.application_events;
CREATE POLICY "authorized_users_view_application_events" ON public.application_events
  FOR SELECT USING (
    -- Case A: User is the application owner
    EXISTS (
      SELECT 1 FROM public.applications a 
      WHERE a.id = application_events.application_id 
        AND a.user_id = auth.uid()
    )
    -- Case B: User is an admin of the organization associated with this event
    OR (
      organization_id IS NOT NULL 
      AND public.is_org_admin(organization_id)
    )
    -- Case C: Platform superadmin
    OR public.is_admin()
  );

-- 2.2 INSERT: Authorized actor or Service Role
DROP POLICY IF EXISTS "authorized_users_insert_application_events" ON public.application_events;
CREATE POLICY "authorized_users_insert_application_events" ON public.application_events
  FOR INSERT WITH CHECK (
    -- Service role or platform superadmin
    current_user = 'service_role'
    OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR public.is_admin()
    -- Normal authenticated user acting as themselves on an accessible application
    OR (
      auth.uid() = actor_id
      AND (
        EXISTS (
          SELECT 1 FROM public.applications a 
          WHERE a.id = application_events.application_id 
            AND (
              a.user_id = auth.uid() 
              OR (a.organization_id IS NOT NULL AND public.is_org_member(a.organization_id))
            )
        )
      )
    )
  );

-- Notice: No UPDATE or DELETE policies are created.
-- application_events is strictly an append-only immutable audit trail.

-- 2.3 Allow Organization Admins to update applications belonging to their organization
DROP POLICY IF EXISTS "org_admins_update_org_applications" ON public.applications;
CREATE POLICY "org_admins_update_org_applications" ON public.applications
  FOR UPDATE USING (
    organization_id IS NOT NULL AND public.is_org_admin(organization_id)
  ) WITH CHECK (
    organization_id IS NOT NULL AND public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "org_admins_delete_org_applications" ON public.applications;
CREATE POLICY "org_admins_delete_org_applications" ON public.applications
  FOR DELETE USING (
    organization_id IS NOT NULL AND public.is_org_admin(organization_id)
  );

-- -----------------------------------------------------------------------------
-- 3. AUTOMATIC EVENT SOURCING TRIGGER ON APPLICATIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_application_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
BEGIN
  -- Default to application user_id if triggered from background job or system process
  IF v_actor_id IS NULL THEN
    v_actor_id := COALESCE(NEW.user_id, OLD.user_id);
  END IF;

  -- 3.1 ON INSERT: Emit 'created' event
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.application_events (
      application_id,
      organization_id,
      actor_id,
      event_type,
      from_status,
      to_status,
      metadata,
      created_at
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      v_actor_id,
      CASE WHEN NEW.status = 'applied' THEN 'applied' ELSE 'created' END,
      NULL,
      NEW.status,
      jsonb_build_object(
        'job_id', NEW.job_id,
        'company_name', NEW.company_name,
        'job_title', NEW.job_title,
        'initial_status', NEW.status,
        'notes', NEW.notes
      ),
      now()
    );
    RETURN NEW;
  END IF;

  -- 3.2 ON UPDATE: Check for status change or notes change
  IF TG_OP = 'UPDATE' THEN
    -- A: Status changed
    IF NEW.status != OLD.status THEN
      INSERT INTO public.application_events (
        application_id,
        organization_id,
        actor_id,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        v_actor_id,
        'status_changed',
        OLD.status,
        NEW.status,
        jsonb_build_object(
          'previous_status', OLD.status,
          'new_status', NEW.status,
          'notes', NEW.notes
        ),
        now()
      );
    END IF;

    -- B: Notes updated independently without status change
    IF NEW.status = OLD.status AND (NEW.notes IS DISTINCT FROM OLD.notes) THEN
      INSERT INTO public.application_events (
        application_id,
        organization_id,
        actor_id,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        v_actor_id,
        'note_updated',
        OLD.status,
        NEW.status,
        jsonb_build_object('notes', NEW.notes),
        now()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_application_events ON public.applications;
CREATE TRIGGER trg_capture_application_events
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.capture_application_lifecycle_event();
