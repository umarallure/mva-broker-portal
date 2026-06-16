-- Track broker pause/delete status changes as durable business events.
-- `deleted` is a soft DQ/deleted status; broker rows stay in place for reporting.

CREATE OR REPLACE FUNCTION public.normalize_broker_account_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(btrim(lower(coalesce(p_status, ''))), '') IS NULL THEN 'active'
    WHEN btrim(lower(coalesce(p_status, ''))) IN ('deleted', 'dq', 'disqualified') THEN 'deleted'
    WHEN btrim(lower(coalesce(p_status, ''))) IN ('paused', 'inactive', 'disabled', 'banned', 'suspended') THEN 'paused'
    WHEN btrim(lower(coalesce(p_status, ''))) = 'active' THEN 'active'
    ELSE 'paused'
  END
$$;

CREATE OR REPLACE FUNCTION public.broker_account_status_is_active(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_broker_account_status(p_status) = 'active'
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_broker()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE au.user_id = auth.uid()
      AND au.role = 'broker'
      AND public.broker_account_status_is_active(au.account_status)
  )
$$;

REVOKE ALL ON FUNCTION public.current_user_is_broker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_broker() TO authenticated;

CREATE TABLE IF NOT EXISTS public.broker_account_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_user_id uuid NOT NULL REFERENCES public.app_users(user_id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  reason_code text,
  notes text,
  changed_by_user_id uuid REFERENCES public.app_users(user_id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_account_status_events_to_status_check
    CHECK (to_status IN ('active', 'paused', 'deleted')),
  CONSTRAINT broker_account_status_events_reason_code_check
    CHECK (
      reason_code IS NULL
      OR reason_code = ANY (ARRAY[
        'billing_hold',
        'quality_review',
        'capacity_pause',
        'broker_request',
        'compliance_review',
        'poor_quality',
        'non_payment',
        'compliance',
        'fraud_or_misrepresentation',
        'duplicate_or_invalid',
        'other'
      ]::text[])
    ),
  CONSTRAINT broker_account_status_events_required_context_check
    CHECK (
      to_status = 'active'
      OR (
        nullif(btrim(coalesce(reason_code, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(notes, '')), '') IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_broker_account_status_events_broker_created
  ON public.broker_account_status_events(broker_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broker_account_status_events_changed_by
  ON public.broker_account_status_events(changed_by_user_id, created_at DESC);

ALTER TABLE public.broker_account_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_account_status_events_admin_select ON public.broker_account_status_events;

CREATE POLICY broker_account_status_events_admin_select
  ON public.broker_account_status_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role IN ('super_admin', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.set_broker_account_status(
  p_broker_user_id uuid,
  p_to_status text,
  p_reason_code text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.broker_account_status_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
  v_from_status text;
  v_to_status_input text := btrim(lower(coalesce(p_to_status, '')));
  v_to_status text := public.normalize_broker_account_status(p_to_status);
  v_reason_code text := nullif(btrim(coalesce(p_reason_code, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_event public.broker_account_status_events;
BEGIN
  SELECT role
  INTO v_actor_role
  FROM public.app_users
  WHERE user_id = auth.uid();

  IF v_actor_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Admin access is required to update broker status'
      USING errcode = '42501';
  END IF;

  SELECT role, public.normalize_broker_account_status(account_status)
  INTO v_target_role, v_from_status
  FROM public.app_users
  WHERE user_id = p_broker_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker account not found'
      USING errcode = 'P0002';
  END IF;

  IF v_target_role <> 'broker' THEN
    RAISE EXCEPTION 'Only broker accounts can use broker status tracking'
      USING errcode = '22023';
  END IF;

  IF v_to_status_input NOT IN ('active', 'paused', 'deleted') THEN
    RAISE EXCEPTION 'Invalid broker status'
      USING errcode = '22023';
  END IF;

  IF v_to_status = 'paused' THEN
    IF v_reason_code IS NULL OR v_notes IS NULL THEN
      RAISE EXCEPTION 'Paused brokers require a reason and notes'
        USING errcode = '23514';
    END IF;

    IF v_reason_code <> ALL (ARRAY[
      'billing_hold',
      'quality_review',
      'capacity_pause',
      'broker_request',
      'compliance_review',
      'other'
    ]::text[]) THEN
      RAISE EXCEPTION 'Invalid paused broker reason'
        USING errcode = '22023';
    END IF;
  ELSIF v_to_status = 'deleted' THEN
    IF v_reason_code IS NULL OR v_notes IS NULL THEN
      RAISE EXCEPTION 'Deleted brokers require a reason and notes'
        USING errcode = '23514';
    END IF;

    IF v_reason_code <> ALL (ARRAY[
      'poor_quality',
      'non_payment',
      'compliance',
      'fraud_or_misrepresentation',
      'duplicate_or_invalid',
      'broker_request',
      'other'
    ]::text[]) THEN
      RAISE EXCEPTION 'Invalid deleted broker reason'
        USING errcode = '22023';
    END IF;
  ELSE
    v_reason_code := NULL;
    v_notes := NULLIF(v_notes, '');
  END IF;

  UPDATE public.app_users
  SET account_status = v_to_status,
      updated_at = now()
  WHERE user_id = p_broker_user_id;

  INSERT INTO public.broker_account_status_events (
    broker_user_id,
    from_status,
    to_status,
    reason_code,
    notes,
    changed_by_user_id
  )
  VALUES (
    p_broker_user_id,
    v_from_status,
    v_to_status,
    v_reason_code,
    v_notes,
    auth.uid()
  )
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.set_broker_account_status(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_broker_account_status(uuid, text, text, text) TO authenticated;

INSERT INTO public.broker_account_status_events (
  broker_user_id,
  from_status,
  to_status,
  reason_code,
  notes,
  changed_by_user_id
)
SELECT
  au.user_id,
  lower(btrim(au.account_status)),
  'paused',
  'other',
  'Backfilled from legacy broker account_status: ' || lower(btrim(au.account_status)),
  NULL
FROM public.app_users au
WHERE au.role = 'broker'
  AND lower(btrim(coalesce(au.account_status, ''))) IN ('inactive', 'disabled', 'banned', 'suspended')
  AND NOT EXISTS (
    SELECT 1
    FROM public.broker_account_status_events existing
    WHERE existing.broker_user_id = au.user_id
      AND existing.to_status = 'paused'
      AND existing.reason_code = 'other'
      AND existing.notes = 'Backfilled from legacy broker account_status: ' || lower(btrim(au.account_status))
  );

UPDATE public.app_users
SET account_status = 'paused',
    updated_at = now()
WHERE role = 'broker'
  AND lower(btrim(coalesce(account_status, ''))) IN ('inactive', 'disabled', 'banned', 'suspended');

CREATE OR REPLACE FUNCTION public.current_user_broker_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role = 'broker'
        AND public.broker_account_status_is_active(au.account_status)
    ) THEN auth.uid()
    ELSE (
      SELECT btm.broker_id
      FROM public.broker_team_members btm
      JOIN public.app_users member_au ON member_au.user_id = btm.user_id
      JOIN public.app_users broker_au ON broker_au.user_id = btm.broker_id
      WHERE btm.user_id = auth.uid()
        AND member_au.role = 'broker_member'
        AND public.broker_account_status_is_active(member_au.account_status)
        AND broker_au.role = 'broker'
        AND public.broker_account_status_is_active(broker_au.account_status)
      LIMIT 1
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_broker_section(p_section text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_section <> ALL (ARRAY[
      'dashboard',
      'order_map',
      'cases',
      'invoicing',
      'attorneys',
      'task_assignment',
      'settings'
    ]::text[]) THEN false
    WHEN EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role = 'broker'
        AND public.broker_account_status_is_active(au.account_status)
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.broker_team_members btm
      JOIN public.app_users member_au ON member_au.user_id = btm.user_id
      JOIN public.app_users broker_au ON broker_au.user_id = btm.broker_id
      WHERE btm.user_id = auth.uid()
        AND member_au.role = 'broker_member'
        AND public.broker_account_status_is_active(member_au.account_status)
        AND broker_au.role = 'broker'
        AND public.broker_account_status_is_active(broker_au.account_status)
        AND p_section = ANY (coalesce(btm.allowed_sections, ARRAY[]::text[]))
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.get_current_broker_context()
RETURNS TABLE (
  broker_id uuid,
  allowed_sections text[],
  is_owner boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid(),
    ARRAY[
      'dashboard',
      'order_map',
      'cases',
      'invoicing',
      'attorneys',
      'task_assignment',
      'settings'
    ]::text[],
    true
  WHERE EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE au.user_id = auth.uid()
      AND au.role = 'broker'
      AND public.broker_account_status_is_active(au.account_status)
  )

  UNION ALL

  SELECT
    btm.broker_id,
    coalesce(btm.allowed_sections, ARRAY[]::text[]),
    false
  FROM public.broker_team_members btm
  JOIN public.app_users member_au ON member_au.user_id = btm.user_id
  JOIN public.app_users broker_au ON broker_au.user_id = btm.broker_id
  WHERE btm.user_id = auth.uid()
    AND member_au.role = 'broker_member'
    AND public.broker_account_status_is_active(member_au.account_status)
    AND broker_au.role = 'broker'
    AND public.broker_account_status_is_active(broker_au.account_status)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_user_broker_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_has_broker_section(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_broker_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_broker_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_broker_section(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_broker_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.broker_notification_recipient_ids(
  p_broker_id uuid,
  p_section text
)
RETURNS TABLE (recipient_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_broker_id
  WHERE p_broker_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.app_users broker_au
      WHERE broker_au.user_id = p_broker_id
        AND broker_au.role = 'broker'
        AND public.broker_account_status_is_active(broker_au.account_status)
    )

  UNION

  SELECT btm.user_id
  FROM public.broker_team_members btm
  JOIN public.app_users member_au ON member_au.user_id = btm.user_id
  JOIN public.app_users broker_au ON broker_au.user_id = btm.broker_id
  WHERE btm.broker_id = p_broker_id
    AND p_section = ANY (coalesce(btm.allowed_sections, ARRAY[]::text[]))
    AND member_au.role = 'broker_member'
    AND public.broker_account_status_is_active(member_au.account_status)
    AND broker_au.role = 'broker'
    AND public.broker_account_status_is_active(broker_au.account_status)
$$;

REVOKE ALL ON FUNCTION public.broker_notification_recipient_ids(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broker_notification_recipient_ids(uuid, text) FROM authenticated;

COMMENT ON TABLE public.broker_account_status_events IS
  'Durable audit trail for broker account status changes. Deleted means soft DQ/deleted.';

COMMENT ON FUNCTION public.set_broker_account_status(uuid, text, text, text) IS
  'Admin-only broker account status transition RPC. Updates app_users.account_status and records a status event atomically.';

COMMENT ON FUNCTION public.broker_account_status_is_active(text) IS
  'Returns true only when a broker account status normalizes to active.';

NOTIFY pgrst, 'reload schema';
