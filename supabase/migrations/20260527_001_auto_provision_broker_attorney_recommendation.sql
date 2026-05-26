-- Auto-provision the closer-side recommendation row and bridge link whenever a
-- broker_attorneys row is inserted, so the closer portal recommends new broker
-- attorneys without any manual admin step. Updates and deletes stay in sync
-- via paired triggers. broker_attorneys is the source of truth for
-- attorney_name, coverage_states, transfer_sol_option, and direct_phone;
-- lawyer_requirements is a downstream projection for the closer recommendation
-- engine.

-- ── Shared SOL mapping ──────────────────────────────────────────────────────
-- broker_attorneys.transfer_sol_option uses '3_months' / '6_months' / '12_months'.
-- lawyer_requirements.sol is the sol_period enum ('3month' / '6month' / '12month').
CREATE OR REPLACE FUNCTION public.broker_attorneys_map_sol_to_requirement(p_sol text)
RETURNS public.sol_period
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    CASE p_sol
      WHEN '3_months'  THEN '3month'
      WHEN '6_months'  THEN '6month'
      WHEN '12_months' THEN '12month'
      ELSE NULL
    END
  )::public.sol_period;
$$;

-- ── AFTER INSERT: provision lawyer_requirements + link ─────────────────────
CREATE OR REPLACE FUNCTION public.broker_attorneys_provision_lawyer_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requirement_id uuid;
BEGIN
  INSERT INTO public.lawyer_requirements (
    attorney_id,
    attorney_name,
    lawyer_type,
    broker_id,
    states,
    sol,
    did_number,
    doc_requirement,
    police_report,
    insurance_report,
    medical_report,
    driver_id
  )
  VALUES (
    NULL,                  -- broker attorneys are not auth users
    NEW.attorney_name,
    'broker_lawyer',
    NEW.broker_id,         -- broker_profiles.user_id is the same uuid as auth.users.id
    to_jsonb(NEW.coverage_states),
    public.broker_attorneys_map_sol_to_requirement(NEW.transfer_sol_option),
    NEW.direct_phone,
    false,
    'no',
    'no',
    'no',
    'no'
  )
  RETURNING id INTO v_requirement_id;

  INSERT INTO public.broker_attorney_requirement_links (
    broker_id,
    broker_attorney_id,
    lawyer_requirement_id
  )
  VALUES (NEW.broker_id, NEW.id, v_requirement_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broker_attorneys_provision_lawyer_requirement
  ON public.broker_attorneys;

CREATE TRIGGER trg_broker_attorneys_provision_lawyer_requirement
  AFTER INSERT ON public.broker_attorneys
  FOR EACH ROW
  EXECUTE FUNCTION public.broker_attorneys_provision_lawyer_requirement();

-- ── AFTER UPDATE: propagate edits to the linked lawyer_requirements row ────
CREATE OR REPLACE FUNCTION public.broker_attorneys_propagate_to_lawyer_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lawyer_requirements lr
  SET
    attorney_name = NEW.attorney_name,
    states        = to_jsonb(NEW.coverage_states),
    sol           = public.broker_attorneys_map_sol_to_requirement(NEW.transfer_sol_option),
    did_number    = NEW.direct_phone,
    updated_at    = now()
  FROM public.broker_attorney_requirement_links link
  WHERE link.broker_attorney_id = NEW.id
    AND lr.id = link.lawyer_requirement_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broker_attorneys_propagate_to_lawyer_requirement
  ON public.broker_attorneys;

CREATE TRIGGER trg_broker_attorneys_propagate_to_lawyer_requirement
  AFTER UPDATE OF
    attorney_name,
    coverage_states,
    transfer_sol_option,
    direct_phone
  ON public.broker_attorneys
  FOR EACH ROW
  WHEN (
    OLD.attorney_name           IS DISTINCT FROM NEW.attorney_name
    OR OLD.coverage_states      IS DISTINCT FROM NEW.coverage_states
    OR OLD.transfer_sol_option  IS DISTINCT FROM NEW.transfer_sol_option
    OR OLD.direct_phone         IS DISTINCT FROM NEW.direct_phone
  )
  EXECUTE FUNCTION public.broker_attorneys_propagate_to_lawyer_requirement();

-- ── BEFORE DELETE: drop the linked lawyer_requirements row ─────────────────
-- broker_attorney_requirement_links has ON DELETE CASCADE on both broker_attorney_id
-- and lawyer_requirement_id (see 20260526_003), so removing the lawyer_requirements
-- row removes the link, and removing the broker_attorneys row removes the link too.
-- Running before the broker_attorneys delete keeps the closer-side row from going
-- stale even for a moment.
CREATE OR REPLACE FUNCTION public.broker_attorneys_cleanup_lawyer_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.lawyer_requirements lr
  WHERE lr.id IN (
    SELECT link.lawyer_requirement_id
    FROM public.broker_attorney_requirement_links link
    WHERE link.broker_attorney_id = OLD.id
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_broker_attorneys_cleanup_lawyer_requirement
  ON public.broker_attorneys;

CREATE TRIGGER trg_broker_attorneys_cleanup_lawyer_requirement
  BEFORE DELETE ON public.broker_attorneys
  FOR EACH ROW
  EXECUTE FUNCTION public.broker_attorneys_cleanup_lawyer_requirement();

COMMENT ON FUNCTION public.broker_attorneys_provision_lawyer_requirement() IS
  'Creates a paired lawyer_requirements + broker_attorney_requirement_links row whenever a broker_attorneys row is inserted, so the closer portal can recommend the attorney without manual admin SQL.';

COMMENT ON FUNCTION public.broker_attorneys_propagate_to_lawyer_requirement() IS
  'Keeps the linked lawyer_requirements row in sync when the broker edits attorney_name, coverage_states, transfer_sol_option, or direct_phone on a broker_attorneys row.';

COMMENT ON FUNCTION public.broker_attorneys_cleanup_lawyer_requirement() IS
  'Removes the linked lawyer_requirements row before a broker_attorneys row is deleted. The broker_attorney_requirement_links row cascades via the foreign key.';

NOTIFY pgrst, 'reload schema';
