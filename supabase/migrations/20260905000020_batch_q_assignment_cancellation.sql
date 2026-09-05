-- =============================================================================
-- Migration: 20260905000020_batch_q_assignment_cancellation.sql
-- Description: Batch Q Hardening (Q-H02): Non-destructive Assignment Cancellation
--   1. Add 'cancelled' value to public.assignment_status_enum
--   2. Update enforce_assignment_lifecycle() FSM trigger for 'cancelled' state
--   3. Update capture_assignment_lifecycle_event() to record 'cancelled' events
-- =============================================================================

-- 1. Add 'cancelled' to assignment_status_enum
ALTER TYPE public.assignment_status_enum ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Update enforce_assignment_lifecycle() to handle 'cancelled' transitions
CREATE OR REPLACE FUNCTION public.enforce_assignment_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  -- Service role bypasses
  IF current_user = 'service_role' 
     OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Immutable assignment identities
    IF NEW.organization_id != OLD.organization_id 
       OR NEW.job_id != OLD.job_id 
       OR NEW.worker_id != OLD.worker_id 
       OR NEW.assigned_by != OLD.assigned_by THEN
      RAISE EXCEPTION 'INVALID_OPERATION: Cannot alter assignment core identities (organization, job, worker, assigned_by).';
    END IF;

    -- Invariant: Terminal assignments cannot transition to other statuses
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Completed assignment is terminal and cannot change status.';
    END IF;

    IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Cancelled assignment is terminal and cannot change status.';
    END IF;

    IF OLD.status = 'skipped' AND NEW.status IN ('assigned', 'in_progress', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Skipped assignment cannot be transitioned to %.', NEW.status;
    END IF;

    -- Direct jump from assigned to completed without in_progress is forbidden
    IF OLD.status = 'assigned' AND NEW.status = 'completed' THEN
      RAISE EXCEPTION 'INVALID_STATE_TRANSITION: Assignment must transition to in_progress before completed.';
    END IF;

    -- Cancellation restrictions: Only organization admins/owners or platform admins can cancel
    IF NEW.status = 'cancelled' THEN
      IF v_caller_id IS NOT NULL 
         AND NOT public.is_org_admin(OLD.organization_id, v_caller_id) 
         AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'FORBIDDEN: Only organization administrators or platform admins can cancel assignments.';
      END IF;
    END IF;

    -- Worker mutation restrictions: Workers cannot mutate terminal assignments
    IF v_caller_id = OLD.worker_id AND NOT public.is_org_admin(OLD.organization_id, v_caller_id) THEN
      IF OLD.status IN ('completed', 'skipped', 'cancelled') AND NEW.status != OLD.status THEN
        RAISE EXCEPTION 'FORBIDDEN: Workers cannot mutate terminal assignments.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Update capture_assignment_lifecycle_event() to record 'cancelled' events
CREATE OR REPLACE FUNCTION public.capture_assignment_lifecycle_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_event_type TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    v_actor_id := COALESCE(NEW.assigned_by, NEW.worker_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.assignment_events (
      assignment_id,
      organization_id,
      worker_id,
      actor_id,
      event_type,
      from_status,
      to_status,
      notes,
      metadata,
      created_at
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      NEW.worker_id,
      v_actor_id,
      'assigned',
      NULL,
      NEW.status,
      NEW.notes,
      jsonb_build_object('deadline_at', NEW.deadline_at, 'job_id', NEW.job_id),
      now()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status != OLD.status THEN
      v_event_type := CASE 
        WHEN NEW.status = 'in_progress' THEN 'started'
        WHEN NEW.status = 'completed' THEN 'completed'
        WHEN NEW.status = 'skipped' THEN 'skipped'
        WHEN NEW.status = 'cancelled' THEN 'cancelled'
        ELSE 'status_changed'
      END;

      INSERT INTO public.assignment_events (
        assignment_id,
        organization_id,
        worker_id,
        actor_id,
        event_type,
        from_status,
        to_status,
        notes,
        metadata,
        created_at
      ) VALUES (
        NEW.id,
        NEW.organization_id,
        NEW.worker_id,
        v_actor_id,
        v_event_type,
        OLD.status,
        NEW.status,
        NEW.notes,
        jsonb_build_object('previous_status', OLD.status, 'new_status', NEW.status, 'job_id', NEW.job_id),
        now()
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;
