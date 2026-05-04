-- Re-scope broker access to leads through the lawyer ownership chain:
--   leads.assigned_attorney_id -> lawyer_requirements.attorney_id
--                              -> lawyer_requirements.broker_id = auth.uid()
-- This replaces the earlier center_id/lead_vendor scoping from migration 006,
-- which is dropped here along with the broker_lead_vendor() helper since nothing
-- else references it.

CREATE OR REPLACE FUNCTION public.broker_owns_attorney(p_attorney_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_attorney_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.lawyer_requirements lr
    WHERE lr.attorney_id = p_attorney_id
      AND lr.lawyer_type = 'broker_lawyer'
      AND lr.broker_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.broker_owns_attorney(uuid) TO authenticated;

DROP POLICY IF EXISTS leads_broker_select ON public.leads;
DROP POLICY IF EXISTS leads_broker_update ON public.leads;

CREATE POLICY leads_broker_select
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND is_active = true
    AND public.broker_owns_attorney(assigned_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected')
  );

CREATE POLICY leads_broker_update
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND is_active = true
    AND public.broker_owns_attorney(assigned_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected')
  )
  WITH CHECK (
    public.current_user_is_broker()
    AND public.broker_owns_attorney(assigned_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected')
  );

-- The old vendor-based helper is no longer referenced by any policy.
DROP FUNCTION IF EXISTS public.broker_lead_vendor();

-- Brokers also need to read attorney_profiles for the lawyers that belong to
-- them, so we can render assigned-attorney names on the My Cases cards. Anything
-- outside their lawyer set stays hidden.
DROP POLICY IF EXISTS attorney_profiles_broker_select ON public.attorney_profiles;

CREATE POLICY attorney_profiles_broker_select
  ON public.attorney_profiles
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND public.broker_owns_attorney(user_id)
  );

NOTIFY pgrst, 'reload schema';
