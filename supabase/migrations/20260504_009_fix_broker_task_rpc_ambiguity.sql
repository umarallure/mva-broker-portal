-- Fix: column reference "broker_task_group_id" is ambiguous (SQLSTATE 42702).
--
-- create_broker_closer_task_for_all_agents declares a RETURNS TABLE whose
-- columns become OUT parameters in PL/pgSQL. Three of those names
-- (broker_task_group_id, assignee_user_id, assignee_name) collide with columns
-- on closer_tasks, so unqualified references inside RETURNING clauses are
-- ambiguous between the OUT param and the table column.
--
-- We rename the OUT parameters to non-conflicting names and qualify every
-- column reference in the inner CTE with closer_tasks.*. The Vue caller only
-- reads `data.length`, so renaming the output fields is safe.

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
  v_creator_name text;
  v_group_id uuid := gen_random_uuid();
  v_title text := NULLIF(trim(COALESCE(p_title, '')), '');
  v_description text := NULLIF(trim(COALESCE(p_description, '')), '');
  v_lead_reference text := NULLIF(trim(COALESCE(p_lead_reference, '')), '');
  v_priority text := COALESCE(NULLIF(trim(COALESCE(p_priority, '')), ''), 'medium');
  v_tags text[] := COALESCE(p_tags, '{}'::text[]);
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_agent_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF NOT (public.current_user_is_broker() OR public.current_user_can_manage_closer_tasks()) THEN
    RAISE EXCEPTION 'Only brokers and admins can create broker task broadcasts'
      USING ERRCODE = '42501';
  END IF;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Task title is required';
  END IF;

  IF p_deadline_date IS NULL THEN
    RAISE EXCEPTION 'Task deadline is required';
  END IF;

  IF v_priority NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'Invalid task priority';
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), email, 'Broker')
  INTO v_creator_name
  FROM public.app_users
  WHERE user_id = v_user_id;

  SELECT COUNT(*)
  INTO v_agent_count
  FROM public.app_users
  WHERE role = 'agent'
    AND (
      account_status IS NULL
      OR lower(account_status) NOT IN ('disabled', 'inactive', 'suspended')
    );

  IF v_agent_count = 0 THEN
    RAISE EXCEPTION 'No active agent accounts were found for task assignment';
  END IF;

  RETURN QUERY
  WITH agent_rows AS (
    SELECT
      au.user_id,
      COALESCE(NULLIF(au.display_name, ''), au.email, au.user_id::text) AS display_label
    FROM public.app_users au
    WHERE au.role = 'agent'
      AND (
        au.account_status IS NULL
        OR lower(au.account_status) NOT IN ('disabled', 'inactive', 'suspended')
      )
  ),
  inserted_tasks AS (
    INSERT INTO public.closer_tasks (
      title,
      description,
      lead_id,
      lead_reference,
      assignee_user_id,
      assignee_name,
      created_by,
      created_by_name,
      status,
      priority,
      tags,
      assigned_date,
      deadline_date,
      broker_task_group_id,
      assignment_scope
    )
    SELECT
      v_title,
      v_description,
      p_lead_id,
      v_lead_reference,
      agent_rows.user_id,
      agent_rows.display_label,
      v_user_id,
      COALESCE(v_creator_name, 'Broker'),
      'todo',
      v_priority,
      v_tags,
      CURRENT_DATE,
      p_deadline_date,
      v_group_id,
      'all_agents'
    FROM agent_rows
    RETURNING
      closer_tasks.id,
      closer_tasks.broker_task_group_id,
      closer_tasks.assignee_user_id,
      closer_tasks.assignee_name
  ),
  inserted_notes AS (
    INSERT INTO public.closer_task_notes (
      task_id,
      author_user_id,
      author_name,
      content
    )
    SELECT
      inserted_tasks.id,
      v_user_id,
      COALESCE(v_creator_name, 'Broker'),
      v_note
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

GRANT EXECUTE ON FUNCTION public.create_broker_closer_task_for_all_agents(
  text,
  text,
  uuid,
  text,
  text,
  date,
  text[],
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
