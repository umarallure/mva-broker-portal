-- Let broker My Cases read paid lead statuses while keeping paid records out of
-- broker status-update policies.

DROP POLICY IF EXISTS leads_broker_select ON public.leads;

CREATE POLICY leads_broker_select
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND is_active = true
    AND public.broker_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN (
      'attorney_review',
      'attorney_approved',
      'attorney_rejected',
      'qualified_payable',
      'paid_to_bpo',
      'paid_to_agency'
    )
  );

DROP POLICY IF EXISTS leads_broker_member_select ON public.leads;

CREATE POLICY leads_broker_member_select
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND public.broker_workspace_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN (
      'attorney_review',
      'attorney_approved',
      'attorney_rejected',
      'qualified_payable',
      'paid_to_bpo',
      'paid_to_agency'
    )
    AND (
      public.current_user_has_broker_section('dashboard')
      OR public.current_user_has_broker_section('cases')
      OR public.current_user_has_broker_section('invoicing')
      OR public.current_user_has_broker_section('task_assignment')
    )
  );

NOTIFY pgrst, 'reload schema';
