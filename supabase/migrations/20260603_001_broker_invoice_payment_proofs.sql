CREATE TABLE IF NOT EXISTS public.invoice_payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.app_users(user_id),
  proof_path text NOT NULL,
  proof_name text NOT NULL,
  proof_mime_type text NOT NULL,
  proof_size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payment_proofs_path_key UNIQUE (proof_path),
  CONSTRAINT invoice_payment_proofs_file_check CHECK (
    btrim(proof_path) <> ''
    AND btrim(proof_name) <> ''
    AND proof_mime_type = ANY (ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
    AND proof_size_bytes > 0
    AND proof_size_bytes <= 10485760
  )
);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_proofs_invoice_created
  ON public.invoice_payment_proofs(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_proofs_broker_created
  ON public.invoice_payment_proofs(broker_id, created_at DESC);

ALTER TABLE public.invoice_payment_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_payment_proofs_admin_all ON public.invoice_payment_proofs;
DROP POLICY IF EXISTS invoice_payment_proofs_broker_select ON public.invoice_payment_proofs;
DROP POLICY IF EXISTS invoice_payment_proofs_broker_insert ON public.invoice_payment_proofs;

CREATE POLICY invoice_payment_proofs_admin_all
  ON public.invoice_payment_proofs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY invoice_payment_proofs_broker_select
  ON public.invoice_payment_proofs FOR SELECT TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND public.current_user_has_broker_section('invoicing')
  );

CREATE POLICY invoice_payment_proofs_broker_insert
  ON public.invoice_payment_proofs FOR INSERT TO authenticated
  WITH CHECK (
    broker_id = public.current_user_broker_id()
    AND uploaded_by = auth.uid()
    AND public.current_user_has_broker_section('invoicing')
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.invoice_type = 'broker'
        AND i.broker_id = broker_id
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-payment-proofs',
  'invoice-payment-proofs',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS invoice_payment_proofs_storage_admin_all ON storage.objects;
DROP POLICY IF EXISTS invoice_payment_proofs_storage_select ON storage.objects;
DROP POLICY IF EXISTS invoice_payment_proofs_storage_insert ON storage.objects;
DROP POLICY IF EXISTS invoice_payment_proofs_storage_delete ON storage.objects;

CREATE POLICY invoice_payment_proofs_storage_admin_all
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'invoice-payment-proofs'
    AND EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'invoice-payment-proofs'
    AND EXISTS (
      SELECT 1
      FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND au.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY invoice_payment_proofs_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-payment-proofs'
    AND public.current_user_has_broker_section('invoicing')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
  );

CREATE POLICY invoice_payment_proofs_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-payment-proofs'
    AND public.current_user_has_broker_section('invoicing')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
  );

CREATE POLICY invoice_payment_proofs_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-payment-proofs'
    AND public.current_user_has_broker_section('invoicing')
    AND (storage.foldername(name))[1] = public.current_user_broker_id()::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.invoice_payment_proofs ipp
      WHERE ipp.proof_path = name
    )
  );

CREATE OR REPLACE FUNCTION public.invoices_broker_paid_proof_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.invoice_type = 'broker'
    AND NEW.invoice_type = 'broker'
    AND NEW.status = 'paid'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND coalesce(current_setting('app.broker_mark_invoice_paid_with_proof', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'Broker invoice payment proof is required before marking paid'
      USING errcode = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_broker_paid_proof_guard ON public.invoices;

CREATE TRIGGER trg_invoices_broker_paid_proof_guard
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_broker_paid_proof_guard();

CREATE OR REPLACE FUNCTION public.broker_mark_invoice_paid_with_proof(
  p_invoice_id uuid,
  p_proof_path text,
  p_proof_name text,
  p_proof_mime_type text,
  p_proof_size_bytes integer
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace_broker_id uuid := public.current_user_broker_id();
  invoice_row public.invoices%rowtype;
  updated_invoice public.invoices%rowtype;
BEGIN
  IF workspace_broker_id IS NULL OR NOT public.current_user_has_broker_section('invoicing') THEN
    RAISE EXCEPTION 'Broker invoicing access is required'
      USING errcode = '42501';
  END IF;

  IF btrim(coalesce(p_proof_path, '')) = ''
    OR btrim(coalesce(p_proof_name, '')) = ''
    OR p_proof_mime_type <> ALL (ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
    OR coalesce(p_proof_size_bytes, 0) <= 0
    OR p_proof_size_bytes > 10485760
  THEN
    RAISE EXCEPTION 'A valid payment proof image is required'
      USING errcode = '22023';
  END IF;

  IF split_part(p_proof_path, '/', 1) <> workspace_broker_id::text THEN
    RAISE EXCEPTION 'Payment proof path is outside the broker workspace'
      USING errcode = '42501';
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

  IF invoice_row.status <> 'in_review' THEN
    RAISE EXCEPTION 'Only pending broker invoices can be marked paid'
      USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects so
    WHERE so.bucket_id = 'invoice-payment-proofs'
      AND so.name = p_proof_path
  ) THEN
    RAISE EXCEPTION 'Uploaded payment proof was not found'
      USING errcode = 'P0002';
  END IF;

  INSERT INTO public.invoice_payment_proofs (
    invoice_id,
    broker_id,
    uploaded_by,
    proof_path,
    proof_name,
    proof_mime_type,
    proof_size_bytes
  )
  VALUES (
    invoice_row.id,
    workspace_broker_id,
    auth.uid(),
    btrim(p_proof_path),
    btrim(p_proof_name),
    p_proof_mime_type,
    p_proof_size_bytes
  );

  PERFORM set_config('app.broker_mark_invoice_paid_with_proof', 'on', true);

  UPDATE public.invoices i
  SET status = 'paid'
  WHERE i.id = invoice_row.id
  RETURNING * INTO updated_invoice;

  RETURN updated_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.broker_mark_invoice_paid_with_proof(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broker_mark_invoice_paid_with_proof(uuid, text, text, text, integer) TO authenticated;
