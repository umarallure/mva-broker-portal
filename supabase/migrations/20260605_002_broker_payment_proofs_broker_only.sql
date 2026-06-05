-- Broker payment proofs are submitted by broker workspaces and super_admins.
-- Admins keep read access for review/audit, but cannot upload proof objects or
-- write payment proof metadata through client-side RLS.

DROP POLICY IF EXISTS invoice_payment_proofs_admin_all ON public.invoice_payment_proofs;
DROP POLICY IF EXISTS invoice_payment_proofs_admin_select ON public.invoice_payment_proofs;

CREATE POLICY invoice_payment_proofs_admin_select
  ON public.invoice_payment_proofs FOR SELECT TO authenticated
  USING (public.current_user_is_invoice_admin());

DROP POLICY IF EXISTS invoice_payment_proofs_storage_admin_all ON storage.objects;
DROP POLICY IF EXISTS invoice_payment_proofs_storage_admin_select ON storage.objects;

CREATE POLICY invoice_payment_proofs_storage_admin_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-payment-proofs'
    AND public.current_user_is_invoice_admin()
  );

NOTIFY pgrst, 'reload schema';
