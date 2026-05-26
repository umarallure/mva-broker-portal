-- Broker disposition notes live on leads so the closer portal can read the
-- broker's reason without mixing it into intake additional_notes.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS broker_rejection_note text NULL,
  ADD COLUMN IF NOT EXISTS broker_rejection_note_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS broker_rejection_note_updated_by uuid NULL REFERENCES public.broker_profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_dropped_note text NULL,
  ADD COLUMN IF NOT EXISTS broker_dropped_note_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS broker_dropped_note_updated_by uuid NULL REFERENCES public.broker_profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_broker_rejection_note_not_blank,
  DROP CONSTRAINT IF EXISTS leads_broker_dropped_note_not_blank;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_broker_rejection_note_not_blank
    CHECK (broker_rejection_note IS NULL OR length(btrim(broker_rejection_note)) > 0),
  ADD CONSTRAINT leads_broker_dropped_note_not_blank
    CHECK (broker_dropped_note IS NULL OR length(btrim(broker_dropped_note)) > 0);

COMMENT ON COLUMN public.leads.broker_rejection_note IS
  'Broker-provided reason when a broker-owned lead is moved to attorney_rejected.';
COMMENT ON COLUMN public.leads.broker_dropped_note IS
  'Broker-provided reason when a broker invoice is moved to Dropped/chargeback.';

CREATE OR REPLACE FUNCTION public.leads_broker_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_broker() THEN
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

  IF NEW.broker_rejection_note IS NOT NULL AND length(NEW.broker_rejection_note) = 0 THEN
    RAISE EXCEPTION 'Broker rejection note cannot be blank';
  END IF;

  IF NEW.broker_dropped_note IS NOT NULL AND length(NEW.broker_dropped_note) = 0 THEN
    RAISE EXCEPTION 'Broker dropped note cannot be blank';
  END IF;

  IF NEW.status = 'attorney_rejected'
    AND (NEW.broker_rejection_note IS NULL OR length(btrim(NEW.broker_rejection_note)) = 0)
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
    NEW.broker_rejection_note_updated_by := auth.uid();
  END IF;

  IF NEW.broker_dropped_note IS DISTINCT FROM OLD.broker_dropped_note THEN
    NEW.broker_dropped_note_updated_at := now();
    NEW.broker_dropped_note_updated_by := auth.uid();
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
  actor_id uuid := auth.uid();
  trimmed_note text := btrim(coalesce(p_note, ''));
  invoice_row public.invoices%rowtype;
  updated_invoice public.invoices%rowtype;
  updated_lead_count integer := 0;
BEGIN
  IF actor_id IS NULL OR NOT public.current_user_is_broker() THEN
    RAISE EXCEPTION 'Only broker accounts can drop broker invoices'
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
    AND i.broker_id = actor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker invoice not found'
      USING errcode = 'P0002';
  END IF;

  IF coalesce(array_length(invoice_row.deal_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Broker invoice has no linked leads'
      USING errcode = '22023';
  END IF;

  WITH resolved_leads AS (
    -- Canonical path: broker invoice deal_ids store leads.id.
    SELECT DISTINCT l.id
    FROM public.leads l
    JOIN public.broker_attorneys ba
      ON ba.id = l.assigned_broker_attorney_id
     AND ba.broker_id = actor_id
    WHERE l.id = ANY(invoice_row.deal_ids)
      AND l.is_active = true

    UNION

    -- Compatibility path: old rows may have daily_deal_flow.id in deal_ids.
    SELECT DISTINCT l.id
    FROM public.daily_deal_flow ddf
    JOIN public.leads l
      ON l.submission_id = ddf.submission_id
    JOIN public.broker_attorneys ba
      ON ba.id = l.assigned_broker_attorney_id
     AND ba.broker_id = actor_id
    WHERE ddf.id = ANY(invoice_row.deal_ids)
      AND l.is_active = true
  ),
  updated_leads AS (
    UPDATE public.leads l
    SET broker_dropped_note = trimmed_note
    WHERE l.id IN (SELECT id FROM resolved_leads)
    RETURNING 1
  )
  SELECT count(*) INTO updated_lead_count
  FROM updated_leads;

  IF updated_lead_count = 0 THEN
    RAISE EXCEPTION 'No broker-owned leads were linked to this invoice'
      USING errcode = 'P0002';
  END IF;

  UPDATE public.invoices i
  SET status = 'chargeback'
  WHERE i.id = invoice_row.id
  RETURNING *
  INTO updated_invoice;

  RETURN updated_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.broker_drop_invoice_with_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_drop_invoice_with_note(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
