-- Allow broker payment proofs from broker workspaces and super_admins.
-- Regular admins can review proof records/files, but cannot upload or mark paid.

CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
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
      AND au.role = 'super_admin'
  )
$$;

REVOKE ALL ON FUNCTION public.current_user_is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_super_admin() TO authenticated;

DROP POLICY IF EXISTS invoice_payment_proofs_admin_all ON public.invoice_payment_proofs;
DROP POLICY IF EXISTS invoice_payment_proofs_admin_select ON public.invoice_payment_proofs;

CREATE POLICY invoice_payment_proofs_admin_select
  ON public.invoice_payment_proofs FOR SELECT TO authenticated
  USING (public.current_user_is_invoice_admin());

DROP POLICY IF EXISTS invoice_payment_proofs_storage_admin_all ON storage.objects;
DROP POLICY IF EXISTS invoice_payment_proofs_storage_admin_select ON storage.objects;
DROP POLICY IF EXISTS invoice_payment_proofs_storage_super_admin_insert ON storage.objects;
DROP POLICY IF EXISTS invoice_payment_proofs_storage_super_admin_delete ON storage.objects;

CREATE POLICY invoice_payment_proofs_storage_admin_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-payment-proofs'
    AND public.current_user_is_invoice_admin()
  );

CREATE POLICY invoice_payment_proofs_storage_super_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-payment-proofs'
    AND public.current_user_is_super_admin()
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.invoice_type = 'broker'
        AND i.broker_id::text = (storage.foldername(name))[1]
        AND i.id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY invoice_payment_proofs_storage_super_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-payment-proofs'
    AND public.current_user_is_super_admin()
    AND NOT EXISTS (
      SELECT 1
      FROM public.invoice_payment_proofs ipp
      WHERE ipp.proof_path = name
    )
  );

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
  caller_is_super_admin boolean := public.current_user_is_super_admin();
  invoice_row public.invoices%rowtype;
  updated_invoice public.invoices%rowtype;
BEGIN
  IF NOT caller_is_super_admin
    AND (workspace_broker_id IS NULL OR NOT public.current_user_has_broker_section('invoicing'))
  THEN
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

  SELECT *
  INTO invoice_row
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.invoice_type = 'broker'
    AND (
      caller_is_super_admin
      OR i.broker_id = workspace_broker_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker invoice not found'
      USING errcode = 'P0002';
  END IF;

  IF split_part(p_proof_path, '/', 1) <> invoice_row.broker_id::text
    OR split_part(p_proof_path, '/', 2) <> invoice_row.id::text
  THEN
    RAISE EXCEPTION 'Payment proof path is outside the broker invoice workspace'
      USING errcode = '42501';
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
    invoice_row.broker_id,
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

NOTIFY pgrst, 'reload schema';
