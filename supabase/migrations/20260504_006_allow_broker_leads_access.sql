-- Broker access to leads, scoped two ways:
--   1) by center: lead_vendor must match the broker's centers.lead_vendor
--   2) by workflow: status must be one of attorney_review / attorney_approved / attorney_rejected
--
-- Brokers can SELECT matching leads, and UPDATE only the status column. We layer
-- defenses: an RLS WITH CHECK keeps the new status inside the broker workflow,
-- and a BEFORE UPDATE trigger blocks brokers from changing any column other
-- than status (column-level GRANTs aren't role-aware in Supabase, so we use a
-- jsonb diff trigger that's column-agnostic and won't rot when columns are added).

CREATE OR REPLACE FUNCTION public.broker_lead_vendor()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_vendor text;
BEGIN
  SELECT c.lead_vendor
  INTO v_lead_vendor
  FROM public.app_users au
  JOIN public.centers c ON c.id = au.center_id
  WHERE au.user_id = auth.uid()
    AND au.role = 'broker';
  RETURN v_lead_vendor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broker_lead_vendor() TO authenticated;

DROP POLICY IF EXISTS leads_broker_select ON public.leads;
DROP POLICY IF EXISTS leads_broker_update ON public.leads;

CREATE POLICY leads_broker_select
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND is_active = true
    AND lead_vendor IS NOT DISTINCT FROM public.broker_lead_vendor()
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected')
  );

CREATE POLICY leads_broker_update
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND is_active = true
    AND lead_vendor IS NOT DISTINCT FROM public.broker_lead_vendor()
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected')
  )
  WITH CHECK (
    public.current_user_is_broker()
    AND lead_vendor IS NOT DISTINCT FROM public.broker_lead_vendor()
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected')
  );

CREATE OR REPLACE FUNCTION public.leads_broker_column_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_broker() THEN
    RETURN NEW;
  END IF;

  -- Allow only `status` (and the auto-managed updated_at) to differ.
  IF (to_jsonb(NEW) - 'status' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'updated_at')
  THEN
    RAISE EXCEPTION 'Brokers may only update the status column on leads';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_broker_column_guard ON public.leads;

CREATE TRIGGER trg_leads_broker_column_guard
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_broker_column_guard();

NOTIFY pgrst, 'reload schema';
