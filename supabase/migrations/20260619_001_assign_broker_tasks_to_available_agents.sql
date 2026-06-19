-- Broker task broadcasts should follow the live agent status board. The agent
-- portal reads per-agent closer_tasks rows where assignee_user_id is the agent,
-- so the broadcast remains one row per recipient; only the recipient source
-- changes from all active app_users to licensed agent_status rows.

ALTER TABLE public.closer_tasks
  ADD COLUMN IF NOT EXISTS portal text;

UPDATE public.closer_tasks
SET portal = 'closer'
WHERE portal IS NULL;

ALTER TABLE public.closer_tasks
  ALTER COLUMN portal SET DEFAULT 'closer',
  ALTER COLUMN portal SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.closer_tasks
    ADD CONSTRAINT closer_tasks_portal_check
    CHECK (portal IN ('closer', 'lawyer_onboarding'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_closer_tasks_portal_assignee
  ON public.closer_tasks(portal, assignee_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_status_licensed_user_id
  ON public.agent_status(user_id)
  WHERE agent_type = 'licensed';

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
  out_task_id uuid,
  out_task_group_id uuid,
  out_agent_user_id uuid,
  out_agent_name text
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
  v_lead_reference text := nullif(trim(coalesce(p_lead_reference, '')), '');
  v_priority text := coalesce(nullif(trim(coalesce(p_priority, '')), ''), 'medium');
  v_tags text[] := coalesce(p_tags, '{}'::text[]);
  v_note text := nullif(trim(coalesce(p_note, '')), '');
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

  SELECT coalesce(nullif(display_name, ''), email, 'Broker')
  INTO v_creator_name
  FROM public.app_users
  WHERE user_id = v_user_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agent_status status_board
    WHERE status_board.user_id IS NOT NULL
      AND status_board.agent_type = 'licensed'
  ) THEN
    RAISE EXCEPTION 'No licensed agents were found for task assignment';
  END IF;

  RETURN QUERY
  WITH agent_rows AS (
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
  ),
  inserted_tasks AS (
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
    FROM agent_rows
    RETURNING
      closer_tasks.id,
      closer_tasks.broker_task_group_id,
      closer_tasks.assignee_user_id,
      closer_tasks.assignee_name
  ),
  inserted_notes AS (
    INSERT INTO public.closer_task_notes (task_id, author_user_id, author_name, content)
    SELECT inserted_tasks.id, v_user_id, coalesce(v_creator_name, 'Broker'), v_note
    FROM inserted_tasks
    WHERE v_note IS NOT NULL
    RETURNING id
  )
  SELECT
    inserted_tasks.id,
    inserted_tasks.broker_task_group_id,
    inserted_tasks.assignee_user_id,
    inserted_tasks.assignee_name
  FROM inserted_tasks;
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
  'Creates one closer task copy per distinct agent_status.user_id where agent_type = licensed, for broker task broadcasts into the closer agent portal.';

NOTIFY pgrst, 'reload schema';
