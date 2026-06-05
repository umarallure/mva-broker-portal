-- Credentialed broker team members belong to a broker workspace and receive
-- access only to explicitly selected broker portal sections.

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check CHECK (
    role IS NULL
    OR role = ANY (ARRAY[
      'super_admin',
      'admin',
      'lawyer',
      'agent',
      'accounts',
      'publisher_admin',
      'publisher_closer',
      'broker',
      'broker_member'
    ])
  );

CREATE TABLE IF NOT EXISTS public.broker_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  state text,
  position text NOT NULL CHECK (position IN ('accounting', 'marketing', 'invoicing', 'intake_team', 'other')),
  position_other text,
  shift_availability text NOT NULL DEFAULT 'full_day'
    CHECK (shift_availability IN ('morning', 'afternoon', 'evening', 'full_day')),
  weekly_availability jsonb NOT NULL DEFAULT public.team_member_schedule_from_shift('full_day'),
  holiday_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_sections text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_team_members_position_other_valid CHECK (
    (position = 'other' AND nullif(btrim(position_other), '') IS NOT NULL)
    OR (position <> 'other' AND position_other IS NULL)
  ),
  CONSTRAINT broker_team_members_state_valid CHECK (
    state IS NULL
    OR state IN (
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
    )
  ),
  CONSTRAINT broker_team_members_weekly_availability_valid CHECK (
    public.team_member_weekly_availability_is_valid(weekly_availability)
  ),
  CONSTRAINT broker_team_members_holiday_hours_valid CHECK (
    public.team_member_holiday_hours_are_valid(holiday_hours)
  ),
  CONSTRAINT broker_team_members_allowed_sections_valid CHECK (
    cardinality(allowed_sections) > 0
    AND allowed_sections <@ ARRAY[
      'dashboard',
      'order_map',
      'cases',
      'invoicing',
      'attorneys',
      'task_assignment',
      'settings'
    ]::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_broker_team_members_broker_created
  ON public.broker_team_members(broker_id, created_at);

CREATE INDEX IF NOT EXISTS idx_broker_team_members_allowed_sections
  ON public.broker_team_members USING gin (allowed_sections);

CREATE OR REPLACE FUNCTION public.update_broker_team_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.weekly_availability IS NULL THEN
    NEW.weekly_availability := public.team_member_schedule_from_shift(coalesce(NEW.shift_availability, 'full_day'));
  ELSIF TG_OP = 'UPDATE'
    AND NEW.shift_availability IS DISTINCT FROM OLD.shift_availability
    AND NEW.weekly_availability IS NOT DISTINCT FROM OLD.weekly_availability
  THEN
    NEW.weekly_availability := public.team_member_schedule_from_shift(coalesce(NEW.shift_availability, 'full_day'));
  END IF;

  IF NEW.holiday_hours IS NULL THEN
    NEW.holiday_hours := '[]'::jsonb;
  END IF;

  NEW.shift_availability := public.team_member_legacy_shift_from_schedule(NEW.weekly_availability);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broker_team_members_updated_at ON public.broker_team_members;

CREATE TRIGGER trg_broker_team_members_updated_at
  BEFORE INSERT OR UPDATE ON public.broker_team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_broker_team_members_updated_at();

ALTER TABLE public.broker_team_members ENABLE ROW LEVEL SECURITY;

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
    ) THEN auth.uid()
    ELSE (
      SELECT btm.broker_id
      FROM public.broker_team_members btm
      JOIN public.app_users au ON au.user_id = btm.user_id
      WHERE btm.user_id = auth.uid()
        AND au.role = 'broker_member'
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
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.broker_team_members btm
      JOIN public.app_users au ON au.user_id = btm.user_id
      WHERE btm.user_id = auth.uid()
        AND au.role = 'broker_member'
        AND p_section = ANY (btm.allowed_sections)
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.broker_workspace_owns_broker_attorney(p_broker_attorney_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.broker_attorneys ba
    WHERE ba.id = p_broker_attorney_id
      AND ba.broker_id = public.current_user_broker_id()
  )
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
    SELECT 1 FROM public.app_users au
    WHERE au.user_id = auth.uid()
      AND au.role = 'broker'
  )

  UNION ALL

  SELECT btm.broker_id, btm.allowed_sections, false
  FROM public.broker_team_members btm
  JOIN public.app_users au ON au.user_id = btm.user_id
  WHERE btm.user_id = auth.uid()
    AND au.role = 'broker_member'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_user_broker_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_has_broker_section(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broker_workspace_owns_broker_attorney(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_broker_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_broker_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_broker_section(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broker_workspace_owns_broker_attorney(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_broker_context() TO authenticated;

DROP POLICY IF EXISTS broker_team_members_admin_all ON public.broker_team_members;
DROP POLICY IF EXISTS broker_team_members_workspace_select ON public.broker_team_members;
DROP POLICY IF EXISTS broker_team_members_self_select ON public.broker_team_members;

CREATE POLICY broker_team_members_admin_all
  ON public.broker_team_members FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY broker_team_members_workspace_select
  ON public.broker_team_members FOR SELECT TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('settings')
  );

CREATE POLICY broker_team_members_self_select
  ON public.broker_team_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS broker_profiles_broker_member_settings ON public.broker_profiles;

CREATE POLICY broker_profiles_broker_member_settings
  ON public.broker_profiles FOR ALL TO authenticated
  USING (
    user_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('settings')
  )
  WITH CHECK (
    user_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('settings')
  );

DROP POLICY IF EXISTS broker_attorneys_broker_member_select ON public.broker_attorneys;
DROP POLICY IF EXISTS broker_attorneys_broker_member_insert ON public.broker_attorneys;
DROP POLICY IF EXISTS broker_attorneys_broker_member_update ON public.broker_attorneys;
DROP POLICY IF EXISTS broker_attorneys_broker_member_delete ON public.broker_attorneys;

CREATE POLICY broker_attorneys_broker_member_select
  ON public.broker_attorneys FOR SELECT TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND (
      public.current_user_has_broker_section('dashboard')
      OR public.current_user_has_broker_section('order_map')
      OR public.current_user_has_broker_section('cases')
      OR public.current_user_has_broker_section('attorneys')
    )
  );

CREATE POLICY broker_attorneys_broker_member_insert
  ON public.broker_attorneys FOR INSERT TO authenticated
  WITH CHECK (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('attorneys')
  );

CREATE POLICY broker_attorneys_broker_member_update
  ON public.broker_attorneys FOR UPDATE TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('attorneys')
  )
  WITH CHECK (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('attorneys')
  );

CREATE POLICY broker_attorneys_broker_member_delete
  ON public.broker_attorneys FOR DELETE TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('attorneys')
  );

CREATE OR REPLACE FUNCTION public.update_broker_attorney_coverage(
  p_broker_attorney_id uuid,
  p_coverage_states text[],
  p_coverage_case_category text,
  p_coverage_sol_criteria text,
  p_coverage_liability_status text,
  p_coverage_insurance_status text,
  p_coverage_medical_treatment text,
  p_coverage_languages text[],
  p_coverage_no_prior_attorney boolean,
  p_coverage_notes text
)
RETURNS public.broker_attorneys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_attorney public.broker_attorneys%rowtype;
BEGIN
  IF public.current_user_broker_id() IS NULL
    OR NOT (
      public.current_user_has_broker_section('order_map')
      OR public.current_user_has_broker_section('attorneys')
    )
  THEN
    RAISE EXCEPTION 'Broker order map access is required'
      USING errcode = '42501';
  END IF;

  UPDATE public.broker_attorneys ba
  SET
    coverage_states = coalesce(p_coverage_states, '{}'::text[]),
    coverage_case_category = p_coverage_case_category,
    coverage_sol_criteria = p_coverage_sol_criteria,
    coverage_liability_status = p_coverage_liability_status,
    coverage_insurance_status = p_coverage_insurance_status,
    coverage_medical_treatment = p_coverage_medical_treatment,
    coverage_languages = coalesce(p_coverage_languages, '{}'::text[]),
    coverage_no_prior_attorney = coalesce(p_coverage_no_prior_attorney, true),
    coverage_notes = nullif(btrim(coalesce(p_coverage_notes, '')), '')
  WHERE ba.id = p_broker_attorney_id
    AND ba.broker_id = public.current_user_broker_id()
  RETURNING * INTO updated_attorney;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker attorney not found'
      USING errcode = 'P0002';
  END IF;

  RETURN updated_attorney;
END;
$$;

REVOKE ALL ON FUNCTION public.update_broker_attorney_coverage(
  uuid, text[], text, text, text, text, text, text[], boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_broker_attorney_coverage(
  uuid, text[], text, text, text, text, text, text[], boolean, text
) TO authenticated;

DROP POLICY IF EXISTS broker_attorney_retainer_documents_broker_member_all
  ON public.broker_attorney_retainer_documents;

CREATE POLICY broker_attorney_retainer_documents_broker_member_all
  ON public.broker_attorney_retainer_documents FOR ALL TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('attorneys')
    AND public.broker_workspace_owns_broker_attorney(broker_attorney_id)
  )
  WITH CHECK (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('attorneys')
    AND public.broker_workspace_owns_broker_attorney(broker_attorney_id)
  );

DROP POLICY IF EXISTS broker_member_retainer_documents_select ON storage.objects;
DROP POLICY IF EXISTS broker_member_retainer_documents_insert ON storage.objects;
DROP POLICY IF EXISTS broker_member_retainer_documents_update ON storage.objects;
DROP POLICY IF EXISTS broker_member_retainer_documents_delete ON storage.objects;

CREATE POLICY broker_member_retainer_documents_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'retainer-contract-documents'
    AND public.current_user_has_broker_section('attorneys')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
  );

CREATE POLICY broker_member_retainer_documents_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'retainer-contract-documents'
    AND public.current_user_has_broker_section('attorneys')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
  );

CREATE POLICY broker_member_retainer_documents_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'retainer-contract-documents'
    AND public.current_user_has_broker_section('attorneys')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
  )
  WITH CHECK (
    bucket_id = 'retainer-contract-documents'
    AND public.current_user_has_broker_section('attorneys')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
  );

CREATE POLICY broker_member_retainer_documents_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'retainer-contract-documents'
    AND public.current_user_has_broker_section('attorneys')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
  );

DROP POLICY IF EXISTS leads_broker_member_select ON public.leads;
DROP POLICY IF EXISTS leads_broker_member_update ON public.leads;

CREATE POLICY leads_broker_member_select
  ON public.leads FOR SELECT TO authenticated
  USING (
    is_active = true
    AND public.broker_workspace_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected', 'qualified_payable')
    AND (
      public.current_user_has_broker_section('dashboard')
      OR public.current_user_has_broker_section('cases')
      OR public.current_user_has_broker_section('invoicing')
      OR public.current_user_has_broker_section('task_assignment')
    )
  );

CREATE POLICY leads_broker_member_update
  ON public.leads FOR UPDATE TO authenticated
  USING (
    is_active = true
    AND public.broker_workspace_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected', 'qualified_payable')
    AND public.current_user_has_broker_section('cases')
  )
  WITH CHECK (
    is_active = true
    AND public.broker_workspace_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected', 'qualified_payable')
    AND public.current_user_has_broker_section('cases')
  );

CREATE OR REPLACE FUNCTION public.leads_broker_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace_broker_id uuid := public.current_user_broker_id();
BEGIN
  IF workspace_broker_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.broker_rejection_note_updated_at IS DISTINCT FROM OLD.broker_rejection_note_updated_at
    OR NEW.broker_rejection_note_updated_by IS DISTINCT FROM OLD.broker_rejection_note_updated_by
    OR NEW.broker_dropped_note_updated_at IS DISTINCT FROM OLD.broker_dropped_note_updated_at
    OR NEW.broker_dropped_note_updated_by IS DISTINCT FROM OLD.broker_dropped_note_updated_by
  THEN
    RAISE EXCEPTION 'Broker note metadata is managed by the database';
  END IF;

  IF NEW.broker_rejection_note IS NOT NULL THEN
    NEW.broker_rejection_note := btrim(NEW.broker_rejection_note);
  END IF;

  IF NEW.broker_dropped_note IS NOT NULL THEN
    NEW.broker_dropped_note := btrim(NEW.broker_dropped_note);
  END IF;

  IF NEW.status = 'attorney_rejected'
    AND OLD.status IS DISTINCT FROM 'attorney_rejected'
    AND (NEW.broker_rejection_note IS NULL OR length(NEW.broker_rejection_note) = 0)
  THEN
    RAISE EXCEPTION 'Broker rejection note is required when rejecting a lead';
  END IF;

  IF (to_jsonb(NEW)
        - 'status'
        - 'updated_at'
        - 'broker_rejection_note'
        - 'broker_rejection_note_updated_at'
        - 'broker_rejection_note_updated_by'
        - 'broker_dropped_note'
        - 'broker_dropped_note_updated_at'
        - 'broker_dropped_note_updated_by')
     IS DISTINCT FROM
     (to_jsonb(OLD)
        - 'status'
        - 'updated_at'
        - 'broker_rejection_note'
        - 'broker_rejection_note_updated_at'
        - 'broker_rejection_note_updated_by'
        - 'broker_dropped_note'
        - 'broker_dropped_note_updated_at'
        - 'broker_dropped_note_updated_by')
  THEN
    RAISE EXCEPTION 'Brokers may only update lead status and broker disposition notes';
  END IF;

  IF NEW.broker_rejection_note IS DISTINCT FROM OLD.broker_rejection_note THEN
    NEW.broker_rejection_note_updated_at := now();
    NEW.broker_rejection_note_updated_by := workspace_broker_id;
  END IF;

  IF NEW.broker_dropped_note IS DISTINCT FROM OLD.broker_dropped_note THEN
    NEW.broker_dropped_note_updated_at := now();
    NEW.broker_dropped_note_updated_by := workspace_broker_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_broker_column_guard ON public.leads;

CREATE TRIGGER trg_leads_broker_column_guard
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_broker_column_guard();

DROP POLICY IF EXISTS invoices_broker_all ON public.invoices;
DROP POLICY IF EXISTS invoices_broker_member_all ON public.invoices;
DROP POLICY IF EXISTS invoices_broker_workspace_select ON public.invoices;

CREATE POLICY invoices_broker_workspace_select
  ON public.invoices FOR SELECT TO authenticated
  USING (
    invoice_type = 'broker'
    AND broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('invoicing')
  );

CREATE OR REPLACE FUNCTION public.invoices_broker_chargeback_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_broker_id() IS NOT NULL
    AND OLD.invoice_type = 'broker'
    AND NEW.invoice_type = 'broker'
    AND NEW.status = 'chargeback'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND coalesce(current_setting('app.broker_drop_invoice_with_note', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'Broker invoice drops require a dropped note'
      USING errcode = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.broker_drop_invoice_with_note(
  p_invoice_id uuid,
  p_note text
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace_broker_id uuid := public.current_user_broker_id();
  trimmed_note text := btrim(coalesce(p_note, ''));
  invoice_row public.invoices%rowtype;
  updated_invoice public.invoices%rowtype;
  updated_lead_count integer := 0;
BEGIN
  IF workspace_broker_id IS NULL OR NOT public.current_user_has_broker_section('invoicing') THEN
    RAISE EXCEPTION 'Broker invoicing access is required'
      USING errcode = '42501';
  END IF;

  IF trimmed_note = '' THEN
    RAISE EXCEPTION 'Dropped note is required'
      USING errcode = '22023';
  END IF;

  SELECT *
  INTO invoice_row
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.invoice_type = 'broker'
    AND i.broker_id = workspace_broker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker invoice not found'
      USING errcode = 'P0002';
  END IF;

  WITH resolved_leads AS (
    SELECT DISTINCT l.id
    FROM public.leads l
    JOIN public.broker_attorneys ba
      ON ba.id = l.assigned_broker_attorney_id
     AND ba.broker_id = workspace_broker_id
    WHERE l.id = ANY(invoice_row.deal_ids)
      AND l.is_active = true

    UNION

    SELECT DISTINCT l.id
    FROM public.daily_deal_flow ddf
    JOIN public.leads l ON l.submission_id = ddf.submission_id
    JOIN public.broker_attorneys ba
      ON ba.id = l.assigned_broker_attorney_id
     AND ba.broker_id = workspace_broker_id
    WHERE ddf.id = ANY(invoice_row.deal_ids)
      AND l.is_active = true
  ),
  updated_leads AS (
    UPDATE public.leads l
    SET broker_dropped_note = trimmed_note
    WHERE l.id IN (SELECT id FROM resolved_leads)
    RETURNING 1
  )
  SELECT count(*) INTO updated_lead_count FROM updated_leads;

  IF updated_lead_count = 0 THEN
    RAISE EXCEPTION 'No broker-owned leads were linked to this invoice'
      USING errcode = 'P0002';
  END IF;

  PERFORM set_config('app.broker_drop_invoice_with_note', 'on', true);

  UPDATE public.invoices i
  SET status = 'chargeback'
  WHERE i.id = invoice_row.id
  RETURNING * INTO updated_invoice;

  RETURN updated_invoice;
END;
$$;

ALTER TABLE public.closer_tasks
  ADD COLUMN IF NOT EXISTS broker_id uuid NULL REFERENCES public.broker_profiles(user_id) ON DELETE SET NULL;

UPDATE public.closer_tasks ct
SET broker_id = ct.created_by
WHERE ct.broker_id IS NULL
  AND ct.created_by_role = 'broker';

CREATE INDEX IF NOT EXISTS idx_closer_tasks_broker_id
  ON public.closer_tasks(broker_id);

DROP POLICY IF EXISTS closer_tasks_select ON public.closer_tasks;

CREATE POLICY closer_tasks_select
  ON public.closer_tasks FOR SELECT TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR (
      public.current_user_can_self_manage_closer_tasks()
      AND (assignee_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR (
      broker_id = public.current_user_broker_id()
      AND public.current_user_has_broker_section('task_assignment')
    )
  );

DROP POLICY IF EXISTS closer_task_notes_select ON public.closer_task_notes;
DROP POLICY IF EXISTS closer_task_notes_insert ON public.closer_task_notes;
DROP POLICY IF EXISTS closer_task_notes_delete ON public.closer_task_notes;

CREATE POLICY closer_task_notes_select
  ON public.closer_task_notes FOR SELECT TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1 FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND (
          task.assignee_user_id = auth.uid()
          OR task.created_by = auth.uid()
          OR (
            task.broker_id = public.current_user_broker_id()
            AND public.current_user_has_broker_section('task_assignment')
          )
        )
    )
  );

CREATE POLICY closer_task_notes_insert
  ON public.closer_task_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1 FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND (
          task.assignee_user_id = auth.uid()
          OR task.created_by = auth.uid()
          OR (
            task.broker_id = public.current_user_broker_id()
            AND public.current_user_has_broker_section('task_assignment')
          )
        )
    )
  );

CREATE POLICY closer_task_notes_delete
  ON public.closer_task_notes FOR DELETE TO authenticated
  USING (
    public.current_user_can_manage_closer_tasks()
    OR EXISTS (
      SELECT 1 FROM public.closer_tasks task
      WHERE task.id = closer_task_notes.task_id
        AND (
          task.created_by = auth.uid()
          OR (
            task.broker_id = public.current_user_broker_id()
            AND public.current_user_has_broker_section('task_assignment')
          )
        )
    )
  );

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
    SELECT 1 FROM public.app_users au
    WHERE au.role = 'agent'
      AND (au.account_status IS NULL OR lower(au.account_status) NOT IN ('disabled', 'inactive', 'suspended'))
  ) THEN
    RAISE EXCEPTION 'No active agent accounts were found for task assignment';
  END IF;

  RETURN QUERY
  WITH agent_rows AS (
    SELECT
      au.user_id,
      coalesce(nullif(au.display_name, ''), au.email, au.user_id::text) AS display_label
    FROM public.app_users au
    WHERE au.role = 'agent'
      AND (au.account_status IS NULL OR lower(au.account_status) NOT IN ('disabled', 'inactive', 'suspended'))
  ),
  inserted_tasks AS (
    INSERT INTO public.closer_tasks (
      title, description, lead_id, lead_reference, assignee_user_id, assignee_name,
      created_by, created_by_name, status, priority, tags, assigned_date,
      deadline_date, broker_task_group_id, assignment_scope, broker_id
    )
    SELECT
      v_title, v_description, p_lead_id, v_lead_reference, agent_rows.user_id,
      agent_rows.display_label, v_user_id, coalesce(v_creator_name, 'Broker'),
      'todo', v_priority, v_tags, current_date, p_deadline_date, v_group_id,
      'all_agents', v_broker_id
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

-- Broker Team Profile now uses broker_team_members. Keep lawyer rows and
-- policies untouched while removing the legacy broker write path.
DROP POLICY IF EXISTS team_members_broker_all ON public.team_members;

COMMENT ON TABLE public.broker_team_members IS
  'Credentialed broker workspace members with explicitly delegated portal sections.';
COMMENT ON COLUMN public.closer_tasks.broker_id IS
  'Owning broker workspace for delegated broker-authored task broadcasts.';

NOTIFY pgrst, 'reload schema';
