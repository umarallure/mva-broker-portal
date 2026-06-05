-- Broker invoice creation: keep broker invoices in public.invoices while
-- linking eligible leads directly so they cannot be invoiced twice.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS broker_invoice_id uuid NULL
  REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_broker_invoice_id
  ON public.leads(broker_invoice_id);

CREATE INDEX IF NOT EXISTS idx_leads_broker_invoice_eligible
  ON public.leads(assigned_broker_attorney_id, created_at)
  WHERE is_active = true
    AND status = 'qualified_payable'
    AND broker_invoice_id IS NULL;

DROP POLICY IF EXISTS broker_attorneys_broker_member_select ON public.broker_attorneys;

CREATE POLICY broker_attorneys_broker_member_select
  ON public.broker_attorneys FOR SELECT TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND (
      public.current_user_has_broker_section('dashboard')
      OR public.current_user_has_broker_section('order_map')
      OR public.current_user_has_broker_section('cases')
      OR public.current_user_has_broker_section('invoicing')
      OR public.current_user_has_broker_section('attorneys')
    )
  );

CREATE OR REPLACE FUNCTION public.leads_broker_invoice_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.broker_invoice_id IS DISTINCT FROM OLD.broker_invoice_id
    AND coalesce(current_setting('app.broker_invoice_link_write', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'Broker invoice links are managed by broker invoice RPCs'
      USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_broker_invoice_link_guard ON public.leads;

CREATE TRIGGER trg_leads_broker_invoice_link_guard
  BEFORE UPDATE OF broker_invoice_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_broker_invoice_link_guard();

CREATE OR REPLACE FUNCTION public.current_user_is_invoice_admin()
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
      AND au.role IN ('super_admin', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.assert_valid_broker_invoice_payload(
  p_broker_id uuid,
  p_lead_ids uuid[],
  p_date_range_start date,
  p_date_range_end date,
  p_items jsonb,
  p_subtotal numeric,
  p_tax_rate numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_due_date date
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_lead_ids uuid[];
  selected_count integer := 0;
BEGIN
  IF NOT public.current_user_is_invoice_admin() THEN
    RAISE EXCEPTION 'Only admins can create broker invoices'
      USING errcode = '42501';
  END IF;

  IF p_broker_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.broker_profiles bp
    WHERE bp.user_id = p_broker_id
  ) THEN
    RAISE EXCEPTION 'A valid broker is required'
      USING errcode = '22023';
  END IF;

  SELECT
    coalesce(array_agg(lead_id ORDER BY first_ord), ARRAY[]::uuid[]),
    count(*)
  INTO selected_lead_ids, selected_count
  FROM (
    SELECT lead_id, min(ord) AS first_ord
    FROM unnest(coalesce(p_lead_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS selected(lead_id, ord)
    WHERE lead_id IS NOT NULL
    GROUP BY lead_id
  ) deduped;

  IF selected_count = 0 THEN
    RAISE EXCEPTION 'Select at least one broker lead'
      USING errcode = '22023';
  END IF;

  IF p_date_range_start IS NULL OR p_date_range_end IS NULL OR p_date_range_start > p_date_range_end THEN
    RAISE EXCEPTION 'A valid invoice date range is required'
      USING errcode = '22023';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'A due date is required'
      USING errcode = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice line item is required'
      USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(
      description text,
      quantity numeric,
      unit_price numeric,
      amount numeric
    )
    WHERE btrim(coalesce(item.description, '')) = ''
      OR coalesce(item.quantity, 0) <= 0
      OR coalesce(item.unit_price, -1) < 0
      OR coalesce(item.amount, -1) < 0
  ) THEN
    RAISE EXCEPTION 'Invoice line items must include a description, quantity, and non-negative amount'
      USING errcode = '22023';
  END IF;

  IF coalesce(p_subtotal, -1) < 0
    OR coalesce(p_tax_rate, -1) < 0
    OR coalesce(p_tax_rate, 2) > 1
    OR coalesce(p_tax_amount, -1) < 0
    OR coalesce(p_total_amount, 0) <= 0
  THEN
    RAISE EXCEPTION 'Invoice totals must be valid and greater than zero'
      USING errcode = '22023';
  END IF;

  RETURN selected_lead_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_broker_invoice(
  p_broker_id uuid,
  p_lead_ids uuid[],
  p_date_range_start date,
  p_date_range_end date,
  p_items jsonb,
  p_subtotal numeric,
  p_tax_rate numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_due_date date,
  p_notes text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_lead_ids uuid[];
  selected_count integer := 0;
  valid_count integer := 0;
  updated_count integer := 0;
  invoice_row public.invoices%rowtype;
  invoice_number_value text := nullif(btrim(coalesce(p_invoice_number, '')), '');
  invoice_year text := to_char(now(), 'YYYY');
  next_seq integer := 1;
  attempt integer := 0;
BEGIN
  selected_lead_ids := public.assert_valid_broker_invoice_payload(
    p_broker_id,
    p_lead_ids,
    p_date_range_start,
    p_date_range_end,
    p_items,
    p_subtotal,
    p_tax_rate,
    p_tax_amount,
    p_total_amount,
    p_due_date
  );
  selected_count := cardinality(selected_lead_ids);

  SELECT count(*)
  INTO valid_count
  FROM public.leads l
  JOIN public.broker_attorneys ba
    ON ba.id = l.assigned_broker_attorney_id
   AND ba.broker_id = p_broker_id
  WHERE l.id = ANY(selected_lead_ids)
    AND l.is_active = true
    AND l.status = 'qualified_payable'
    AND l.broker_invoice_id IS NULL;

  IF valid_count <> selected_count THEN
    RAISE EXCEPTION 'Every selected lead must be active, qualified payable, uninvoiced, and assigned to the selected broker'
      USING errcode = '22023';
  END IF;

  IF invoice_number_value IS NULL THEN
    SELECT coalesce(max(substring(i.invoice_number from ('^INV-' || invoice_year || '-([0-9]+)$'))::integer), 0) + 1
    INTO next_seq
    FROM public.invoices i
    WHERE i.invoice_number LIKE ('INV-' || invoice_year || '-%');
  END IF;

  LOOP
    IF invoice_number_value IS NULL THEN
      invoice_number_value := 'INV-' || invoice_year || '-' || lpad((next_seq + attempt)::text, 4, '0');
    END IF;

    BEGIN
      INSERT INTO public.invoices (
        invoice_number,
        lawyer_id,
        lead_vendor_id,
        broker_id,
        invoice_type,
        created_by,
        date_range_start,
        date_range_end,
        deal_ids,
        items,
        subtotal,
        tax_rate,
        tax_amount,
        total_amount,
        status,
        notes,
        due_date
      )
      VALUES (
        invoice_number_value,
        NULL,
        NULL,
        p_broker_id,
        'broker',
        auth.uid(),
        p_date_range_start,
        p_date_range_end,
        selected_lead_ids,
        p_items,
        p_subtotal,
        p_tax_rate,
        p_tax_amount,
        p_total_amount,
        'in_review',
        nullif(btrim(coalesce(p_notes, '')), ''),
        p_due_date
      )
      RETURNING * INTO invoice_row;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF p_invoice_number IS NOT NULL THEN
        RAISE EXCEPTION 'Invoice number already exists'
          USING errcode = '23505';
      END IF;

      attempt := attempt + 1;
      invoice_number_value := NULL;
      IF attempt > 20 THEN
        RAISE EXCEPTION 'Unable to generate a unique invoice number'
          USING errcode = '23505';
      END IF;
    END;
  END LOOP;

  PERFORM set_config('app.broker_invoice_link_write', 'on', true);

  UPDATE public.leads l
  SET broker_invoice_id = invoice_row.id
  WHERE l.id = ANY(selected_lead_ids)
    AND l.broker_invoice_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> selected_count THEN
    RAISE EXCEPTION 'One or more selected leads were invoiced by another invoice'
      USING errcode = '40001';
  END IF;

  RETURN invoice_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_broker_invoice(
  p_invoice_id uuid,
  p_broker_id uuid,
  p_lead_ids uuid[],
  p_date_range_start date,
  p_date_range_end date,
  p_items jsonb,
  p_subtotal numeric,
  p_tax_rate numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_due_date date,
  p_notes text DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_lead_ids uuid[];
  selected_count integer := 0;
  valid_count integer := 0;
  updated_count integer := 0;
  invoice_row public.invoices%rowtype;
  updated_invoice public.invoices%rowtype;
BEGIN
  selected_lead_ids := public.assert_valid_broker_invoice_payload(
    p_broker_id,
    p_lead_ids,
    p_date_range_start,
    p_date_range_end,
    p_items,
    p_subtotal,
    p_tax_rate,
    p_tax_amount,
    p_total_amount,
    p_due_date
  );
  selected_count := cardinality(selected_lead_ids);

  SELECT *
  INTO invoice_row
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.invoice_type = 'broker'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker invoice not found'
      USING errcode = 'P0002';
  END IF;

  IF invoice_row.broker_id IS DISTINCT FROM p_broker_id THEN
    RAISE EXCEPTION 'Broker cannot be changed for an existing broker invoice'
      USING errcode = '22023';
  END IF;

  IF invoice_row.status <> 'in_review' THEN
    RAISE EXCEPTION 'Only pending broker invoices can be edited'
      USING errcode = '22023';
  END IF;

  SELECT count(*)
  INTO valid_count
  FROM public.leads l
  JOIN public.broker_attorneys ba
    ON ba.id = l.assigned_broker_attorney_id
   AND ba.broker_id = p_broker_id
  WHERE l.id = ANY(selected_lead_ids)
    AND l.is_active = true
    AND l.status = 'qualified_payable'
    AND (
      l.broker_invoice_id IS NULL
      OR l.broker_invoice_id = p_invoice_id
    );

  IF valid_count <> selected_count THEN
    RAISE EXCEPTION 'Every selected lead must be active, qualified payable, uninvoiced, and assigned to the selected broker'
      USING errcode = '22023';
  END IF;

  PERFORM set_config('app.broker_invoice_link_write', 'on', true);

  UPDATE public.leads l
  SET broker_invoice_id = NULL
  WHERE l.broker_invoice_id = p_invoice_id
    AND NOT (l.id = ANY(selected_lead_ids));

  UPDATE public.leads l
  SET broker_invoice_id = p_invoice_id
  WHERE l.id = ANY(selected_lead_ids)
    AND (
      l.broker_invoice_id IS NULL
      OR l.broker_invoice_id = p_invoice_id
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> selected_count THEN
    RAISE EXCEPTION 'One or more selected leads were invoiced by another invoice'
      USING errcode = '40001';
  END IF;

  UPDATE public.invoices i
  SET
    date_range_start = p_date_range_start,
    date_range_end = p_date_range_end,
    deal_ids = selected_lead_ids,
    items = p_items,
    subtotal = p_subtotal,
    tax_rate = p_tax_rate,
    tax_amount = p_tax_amount,
    total_amount = p_total_amount,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    due_date = p_due_date
  WHERE i.id = p_invoice_id
  RETURNING * INTO updated_invoice;

  RETURN updated_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_is_invoice_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_valid_broker_invoice_payload(
  uuid, uuid[], date, date, jsonb, numeric, numeric, numeric, numeric, date
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_broker_invoice(
  uuid, uuid[], date, date, jsonb, numeric, numeric, numeric, numeric, date, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_broker_invoice(
  uuid, uuid, uuid[], date, date, jsonb, numeric, numeric, numeric, numeric, date, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_is_invoice_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_broker_invoice(
  uuid, uuid[], date, date, jsonb, numeric, numeric, numeric, numeric, date, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_broker_invoice(
  uuid, uuid, uuid[], date, date, jsonb, numeric, numeric, numeric, numeric, date, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
