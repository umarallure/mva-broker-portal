-- Keep broker task lead references scoped to the current broker workspace and
-- avoid returning agent recipient details from broker task broadcasts.

CREATE INDEX IF NOT EXISTS idx_leads_broker_task_options
  ON public.leads(assigned_broker_attorney_id, submission_date DESC)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.get_broker_task_lead_options(
  p_search text DEFAULT '',
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  reference text,
  customer_name text,
  phone_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broker_id uuid := public.current_user_broker_id();
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF NOT (
    public.current_user_can_manage_closer_tasks()
    OR (
      v_broker_id IS NOT NULL
      AND public.current_user_has_broker_section('task_assignment')
    )
  ) THEN
    RAISE EXCEPTION 'Broker task assignment access is required'
      USING errcode = '42501';
  END IF;

  IF v_broker_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.submission_id,
    l.customer_full_name,
    l.phone_number
  FROM public.leads l
  JOIN public.broker_attorneys ba
    ON ba.id = l.assigned_broker_attorney_id
   AND ba.broker_id = v_broker_id
  WHERE l.is_active = true
    AND (
      v_search IS NULL
      OR l.submission_id ILIKE ('%' || v_search || '%')
      OR l.customer_full_name ILIKE ('%' || v_search || '%')
      OR l.phone_number ILIKE ('%' || v_search || '%')
    )
  ORDER BY l.submission_date DESC NULLS LAST, l.created_at DESC NULLS LAST
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_broker_task_lead_options(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_broker_task_lead_options(text, integer) TO authenticated;

COMMENT ON FUNCTION public.get_broker_task_lead_options(text, integer) IS
  'Returns active public.leads assigned to the current broker workspace for broker task lead reference selection.';

DROP FUNCTION IF EXISTS public.create_broker_closer_task_for_all_agents(
  text, text, uuid, text, text, date, text[], text
);

CREATE FUNCTION public.create_broker_closer_task_for_all_agents(
  p_title text,
  p_description text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_lead_reference text DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_deadline_date date DEFAULT NULL,
  p_tags text[] DEFAULT '{}'::text[],
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  out_task_group_id uuid,
  out_forwarded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_broker_id uuid := public.current_user_broker_id();
  v_creator_name text;
  v_group_id uuid := gen_random_uuid();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_lead_reference text;
  v_priority text := coalesce(nullif(trim(coalesce(p_priority, '')), ''), 'medium');
  v_tags text[] := coalesce(p_tags, '{}'::text[]);
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_inserted_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF NOT (
    public.current_user_can_manage_closer_tasks()
    OR (
      v_broker_id IS NOT NULL
      AND public.current_user_has_broker_section('task_assignment')
    )
  ) THEN
    RAISE EXCEPTION 'Broker task assignment access is required'
      USING errcode = '42501';
  END IF;

  IF v_title IS NULL OR p_deadline_date IS NULL OR v_priority NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'A valid title, deadline, and priority are required';
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT l.submission_id
    INTO v_lead_reference
    FROM public.leads l
    JOIN public.broker_attorneys ba
      ON ba.id = l.assigned_broker_attorney_id
     AND ba.broker_id = v_broker_id
    WHERE l.id = p_lead_id
      AND l.is_active = true;

    IF v_lead_reference IS NULL THEN
      RAISE EXCEPTION 'Lead reference is not available for this broker workspace'
        USING errcode = '42501';
    END IF;
  END IF;

  SELECT coalesce(nullif(display_name, ''), email, 'Broker')
  INTO v_creator_name
  FROM public.app_users
  WHERE user_id = v_user_id;

  INSERT INTO public.closer_tasks (
    title, description, lead_id, lead_reference, assignee_user_id, assignee_name,
    created_by, created_by_name, status, priority, tags, assigned_date,
    deadline_date, broker_task_group_id, assignment_scope, broker_id, portal
  )
  SELECT
    v_title, v_description, p_lead_id, v_lead_reference, agent_rows.user_id,
    agent_rows.display_label, v_user_id, coalesce(v_creator_name, 'Broker'),
    'todo', v_priority, v_tags, current_date, p_deadline_date, v_group_id,
    'all_agents', v_broker_id, 'closer'
  FROM (
    SELECT
      status_board.user_id,
      coalesce(nullif(au.display_name, ''), au.email, status_board.user_id::text) AS display_label
    FROM (
      SELECT DISTINCT user_id
      FROM public.agent_status
      WHERE user_id IS NOT NULL
        AND agent_type = 'licensed'
    ) status_board
    LEFT JOIN public.app_users au ON au.user_id = status_board.user_id
  ) agent_rows;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count = 0 THEN
    RAISE EXCEPTION 'Task forwarding is unavailable right now';
  END IF;

  IF v_note IS NOT NULL THEN
    INSERT INTO public.closer_task_notes (task_id, author_user_id, author_name, content)
    SELECT task.id, v_user_id, coalesce(v_creator_name, 'Broker'), v_note
    FROM public.closer_tasks task
    WHERE task.broker_task_group_id = v_group_id
      AND task.created_by = v_user_id;
  END IF;

  RETURN QUERY SELECT v_group_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_broker_closer_task_for_all_agents(
  text, text, uuid, text, text, date, text[], text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_broker_closer_task_for_all_agents(
  text, text, uuid, text, text, date, text[], text
) TO authenticated;

COMMENT ON FUNCTION public.create_broker_closer_task_for_all_agents(
  text, text, uuid, text, text, date, text[], text
) IS
  'Creates broker task copies for licensed agent_status users while validating broker lead ownership and returning no agent recipient details.';

NOTIFY pgrst, 'reload schema';
