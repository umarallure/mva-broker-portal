-- Brokers leave tasks for the sales team, but they do not choose a specific
-- assignee. Broker task creation goes through the RPC below, which creates one
-- grouped closer_tasks row per active app_user with role='agent'. This keeps the
-- sales-rep portal compatible with the existing closer_tasks table while making
-- broker-originated work easy to identify by created_by_role and
-- broker_task_group_id.

ALTER TABLE public.closer_tasks
  ADD COLUMN IF NOT EXISTS broker_task_group_id uuid,
  ADD COLUMN IF NOT EXISTS assignment_scope text NOT NULL DEFAULT 'single';

DO $$
BEGIN
  ALTER TABLE public.closer_tasks
    ADD CONSTRAINT closer_tasks_assignment_scope_check
    CHECK (assignment_scope IN ('single', 'all_agents'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_closer_tasks_broker_task_group_id
  ON public.closer_tasks(broker_task_group_id);

CREATE INDEX IF NOT EXISTS idx_closer_tasks_broker_created
  ON public.closer_tasks(created_by, created_by_role, broker_task_group_id);

-- Recreate closer_tasks policies to add broker read access without allowing
-- brokers to insert direct one-off assignees. Brokers create all-agent tasks via
-- public.create_broker_closer_task_for_all_agents().
DROP POLICY IF EXISTS closer_tasks_select ON public.closer_tasks;
DROP POLICY IF EXISTS closer_tasks_insert ON public.closer_tasks;
DROP POLICY IF EXISTS closer_tasks_update ON public.closer_tasks;
DROP POLICY IF EXISTS closer_tasks_delete ON public.closer_tasks;

CREATE POLICY closer_tasks_select
  ON public.closer_tasks
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND (assignee_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR (
      public.current_user_is_broker()
      AND created_by = auth.uid()
    )
  );

CREATE POLICY closer_tasks_insert
  ON public.closer_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND assignee_user_id = auth.uid()
      AND created_by = auth.uid()
    )
  );

CREATE POLICY closer_tasks_update
  ON public.closer_tasks
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND assignee_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND assignee_user_id = auth.uid()
    )
  );

CREATE POLICY closer_tasks_delete
  ON public.closer_tasks
  FOR DELETE
  TO authenticated
  USING (public.current_user_can_manage_closer_tasks());

CREATE OR REPLACE FUNCTION public.create_broker_closer_task_for_all_agents(
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
  task_id uuid,
  broker_task_group_id uuid,
  assignee_user_id uuid,
  assignee_name text
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
      id AS task_id,
      broker_task_group_id AS task_group_id,
      assignee_user_id AS assigned_user_id,
      assignee_name AS assigned_name
  ),
  inserted_notes AS (
    INSERT INTO public.closer_task_notes (
      task_id,
      author_user_id,
      author_name,
      content
    )
    SELECT
      inserted_tasks.task_id,
      v_user_id,
      COALESCE(v_creator_name, 'Broker'),
      v_note
    FROM inserted_tasks
    WHERE v_note IS NOT NULL
    RETURNING id
  )
  SELECT
    inserted_tasks.task_id,
    inserted_tasks.task_group_id,
    inserted_tasks.assigned_user_id,
    inserted_tasks.assigned_name
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

-- closer_task_notes: any task participant (creator OR assignee) can read/write.
-- This lets the sales rep reply on a broker-authored task without admin help.
DROP POLICY IF EXISTS closer_task_notes_select ON public.closer_task_notes;
DROP POLICY IF EXISTS closer_task_notes_insert ON public.closer_task_notes;
DROP POLICY IF EXISTS closer_task_notes_delete ON public.closer_task_notes;

CREATE POLICY closer_task_notes_select
  ON public.closer_task_notes
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1 FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND (task.assignee_user_id = auth.uid() OR task.created_by = auth.uid())
    )
  );

CREATE POLICY closer_task_notes_insert
  ON public.closer_task_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1 FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND (task.assignee_user_id = auth.uid() OR task.created_by = auth.uid())
    )
  );

CREATE POLICY closer_task_notes_delete
  ON public.closer_task_notes
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1 FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND task.created_by = auth.uid()
    )
  );

COMMENT ON COLUMN public.closer_tasks.broker_task_group_id IS
  'Shared id for the per-agent closer_tasks rows created by one broker broadcast.';

COMMENT ON COLUMN public.closer_tasks.assignment_scope IS
  'single for normal one-assignee tasks; all_agents for broker broadcasts.';

COMMENT ON FUNCTION public.create_broker_closer_task_for_all_agents(
  text,
  text,
  uuid,
  text,
  text,
  date,
  text[],
  text
) IS
  'Creates one grouped closer_tasks row per active agent for a broker-authored task.';

NOTIFY pgrst, 'reload schema';
