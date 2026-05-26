-- Broker attorneys are profile-only rows owned by a broker account.
-- They do not create auth users and they do not depend on attorney_profiles or
-- lawyer_requirements.

CREATE TABLE IF NOT EXISTS public.broker_attorneys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  attorney_name text NOT NULL,
  firm_name text,
  bio text,
  years_experience integer,
  languages text[] NOT NULL DEFAULT ARRAY['English']::text[],
  primary_email text,
  personal_email text,
  direct_phone text,
  office_address text,
  website_url text,
  preferred_contact text,
  assistant_name text,
  assistant_email text,
  transfer_standard_types text[] NOT NULL DEFAULT '{}'::text[],
  transfer_sol_option text,
  transfer_sol_other text,
  transfer_injury_types text[] NOT NULL DEFAULT '{}'::text[],
  transfer_injury_other text,
  coverage_states text[] NOT NULL DEFAULT '{}'::text[],
  coverage_case_category text NOT NULL DEFAULT 'Consumer Cases',
  coverage_sol_criteria text NOT NULL DEFAULT 'no_criteria',
  coverage_liability_status text NOT NULL DEFAULT 'clear_only',
  coverage_insurance_status text NOT NULL DEFAULT 'insured_only',
  coverage_medical_treatment text NOT NULL DEFAULT 'ongoing',
  coverage_languages text[] NOT NULL DEFAULT ARRAY['English']::text[],
  coverage_no_prior_attorney boolean NOT NULL DEFAULT true,
  coverage_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_attorneys_id_broker_id_key UNIQUE (id, broker_id),
  CONSTRAINT broker_attorneys_name_not_blank CHECK (length(btrim(attorney_name)) > 0),
  CONSTRAINT broker_attorneys_years_experience_check CHECK (
    years_experience IS NULL OR years_experience >= 0
  ),
  CONSTRAINT broker_attorneys_languages_check CHECK (
    languages <@ ARRAY['English', 'Spanish']::text[]
  ),
  CONSTRAINT broker_attorneys_preferred_contact_check CHECK (
    preferred_contact IS NULL
    OR preferred_contact = ANY (ARRAY['email', 'phone', 'text']::text[])
  ),
  CONSTRAINT broker_attorneys_transfer_standard_types_check CHECK (
    transfer_standard_types <@ ARRAY['sol', 'injury_type']::text[]
  ),
  CONSTRAINT broker_attorneys_transfer_sol_option_check CHECK (
    transfer_sol_option IS NULL
    OR transfer_sol_option = ANY (ARRAY['3_months', '6_months', '12_months', 'other']::text[])
  ),
  CONSTRAINT broker_attorneys_transfer_injury_types_check CHECK (
    transfer_injury_types <@ ARRAY[
      'Auto Accidents',
      'Truck Accidents',
      'Motorcycle Accidents',
      'Pedestrian Accidents',
      'Slip and Fall',
      'Medical Malpractice',
      'Nursing Home Abuse',
      'Birth Injuries',
      'Workplace Injuries',
      'Construction Accidents',
      'Dog Bites',
      'Defective Products',
      'Toxic Exposure',
      'Brain Injuries',
      'Spinal Cord Injuries',
      'Burn Injuries',
      'Wrongful Death',
      'Other'
    ]::text[]
  ),
  CONSTRAINT broker_attorneys_coverage_case_category_check CHECK (
    coverage_case_category = ANY (
      ARRAY['Consumer Cases', 'Consumer and Commercial Cases']::text[]
    )
  ),
  CONSTRAINT broker_attorneys_coverage_sol_criteria_check CHECK (
    coverage_sol_criteria = ANY (
      ARRAY['no_criteria', '3_months', '6_months', '12_months']::text[]
    )
  ),
  CONSTRAINT broker_attorneys_coverage_liability_status_check CHECK (
    coverage_liability_status = ANY (ARRAY['clear_only', 'disputed_ok']::text[])
  ),
  CONSTRAINT broker_attorneys_coverage_insurance_status_check CHECK (
    coverage_insurance_status = ANY (ARRAY['insured_only', 'uninsured_ok']::text[])
  ),
  CONSTRAINT broker_attorneys_coverage_medical_treatment_check CHECK (
    coverage_medical_treatment = ANY (
      ARRAY['no_medical', 'ongoing', 'proof_of_medical_treatment']::text[]
    )
  ),
  CONSTRAINT broker_attorneys_coverage_languages_check CHECK (
    coverage_languages <@ ARRAY['English', 'Spanish']::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_broker_attorneys_broker_name
  ON public.broker_attorneys(broker_id, attorney_name);

CREATE INDEX IF NOT EXISTS idx_broker_attorneys_coverage_states
  ON public.broker_attorneys USING gin (coverage_states);

DROP TRIGGER IF EXISTS broker_attorneys_set_updated_at ON public.broker_attorneys;

CREATE TRIGGER broker_attorneys_set_updated_at
  BEFORE UPDATE ON public.broker_attorneys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.broker_attorneys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_attorneys_admin_all ON public.broker_attorneys;
DROP POLICY IF EXISTS broker_attorneys_broker_select ON public.broker_attorneys;
DROP POLICY IF EXISTS broker_attorneys_broker_insert ON public.broker_attorneys;
DROP POLICY IF EXISTS broker_attorneys_broker_update ON public.broker_attorneys;
DROP POLICY IF EXISTS broker_attorneys_broker_delete ON public.broker_attorneys;

CREATE POLICY broker_attorneys_admin_all
  ON public.broker_attorneys
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY broker_attorneys_broker_select
  ON public.broker_attorneys
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND broker_id = auth.uid()
  );

CREATE POLICY broker_attorneys_broker_insert
  ON public.broker_attorneys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_is_broker()
    AND broker_id = auth.uid()
  );

CREATE POLICY broker_attorneys_broker_update
  ON public.broker_attorneys
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND broker_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_is_broker()
    AND broker_id = auth.uid()
  );

CREATE POLICY broker_attorneys_broker_delete
  ON public.broker_attorneys
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND broker_id = auth.uid()
  );

-- Broker invoices are broker-account invoices, not attorney-profile invoices.
ALTER TABLE public.invoices
  ALTER COLUMN lawyer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS broker_id uuid NULL REFERENCES public.broker_profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type = ANY (ARRAY['lawyer', 'publisher', 'broker']::text[]));

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_broker_owner_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_broker_owner_check
  CHECK (
    invoice_type <> 'broker'
    OR (
      broker_id IS NOT NULL
      AND lawyer_id IS NULL
      AND lead_vendor_id IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_invoices_broker_id
  ON public.invoices USING btree (broker_id);

CREATE INDEX IF NOT EXISTS idx_invoices_type_broker
  ON public.invoices USING btree (invoice_type, broker_id);

DROP POLICY IF EXISTS invoices_broker_all ON public.invoices;

CREATE POLICY invoices_broker_all
  ON public.invoices
  FOR ALL
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND invoice_type = 'broker'
    AND broker_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_is_broker()
    AND invoice_type = 'broker'
    AND broker_id = auth.uid()
  );

-- Broker-scoped leads point directly to broker_attorneys.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_broker_attorney_id uuid NULL
  REFERENCES public.broker_attorneys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_broker_attorney_id
  ON public.leads USING btree (assigned_broker_attorney_id);

CREATE OR REPLACE FUNCTION public.broker_owns_broker_attorney(p_broker_attorney_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_broker_attorney_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.broker_attorneys ba
    WHERE ba.id = p_broker_attorney_id
      AND ba.broker_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.broker_owns_broker_attorney(uuid) TO authenticated;

DROP POLICY IF EXISTS leads_broker_select ON public.leads;
DROP POLICY IF EXISTS leads_broker_update ON public.leads;

CREATE POLICY leads_broker_select
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND is_active = true
    AND public.broker_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected', 'qualified_payable')
  );

CREATE POLICY leads_broker_update
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND is_active = true
    AND public.broker_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected', 'qualified_payable')
  )
  WITH CHECK (
    public.current_user_is_broker()
    AND is_active = true
    AND public.broker_owns_broker_attorney(assigned_broker_attorney_id)
    AND status IN ('attorney_review', 'attorney_approved', 'attorney_rejected', 'qualified_payable')
  );

-- Remove legacy broker paths that scoped through authenticated attorneys.
DROP POLICY IF EXISTS attorney_profiles_broker_select ON public.attorney_profiles;
DROP FUNCTION IF EXISTS public.broker_owns_attorney(uuid);
DROP FUNCTION IF EXISTS public.broker_owns_lawyer_requirement(uuid);

-- Broker-attorney retainer documents are keyed to broker_attorneys and scoped
-- by broker_id so broker attorneys never need authenticated access.
CREATE TABLE IF NOT EXISTS public.broker_attorney_retainer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  broker_attorney_id uuid NOT NULL,
  state text NOT NULL,
  document_path text NOT NULL,
  document_name text NOT NULL,
  document_mime_type text NOT NULL,
  document_size_bytes integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_attorney_retainer_documents_attorney_broker_fkey
    FOREIGN KEY (broker_attorney_id, broker_id)
    REFERENCES public.broker_attorneys(id, broker_id)
    ON DELETE CASCADE,
  CONSTRAINT broker_attorney_retainer_documents_unique_state UNIQUE (broker_attorney_id, state),
  CONSTRAINT broker_attorney_retainer_documents_state_check CHECK (state ~ '^[A-Z]{2}$'),
  CONSTRAINT broker_attorney_retainer_documents_mime_type_check CHECK (
    document_mime_type = ANY (
      ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]::text[]
    )
  ),
  CONSTRAINT broker_attorney_retainer_documents_size_check CHECK (document_size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_broker_attorney_retainer_documents_broker
  ON public.broker_attorney_retainer_documents(broker_id);

CREATE INDEX IF NOT EXISTS idx_broker_attorney_retainer_documents_attorney
  ON public.broker_attorney_retainer_documents(broker_attorney_id);

DROP TRIGGER IF EXISTS broker_attorney_retainer_documents_set_updated_at
  ON public.broker_attorney_retainer_documents;

CREATE TRIGGER broker_attorney_retainer_documents_set_updated_at
  BEFORE UPDATE ON public.broker_attorney_retainer_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.broker_attorney_retainer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_attorney_retainer_documents_admin_all
  ON public.broker_attorney_retainer_documents;
DROP POLICY IF EXISTS broker_attorney_retainer_documents_broker_all
  ON public.broker_attorney_retainer_documents;

CREATE POLICY broker_attorney_retainer_documents_admin_all
  ON public.broker_attorney_retainer_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY broker_attorney_retainer_documents_broker_all
  ON public.broker_attorney_retainer_documents
  FOR ALL
  TO authenticated
  USING (
    public.current_user_is_broker()
    AND broker_id = auth.uid()
    AND public.broker_owns_broker_attorney(broker_attorney_id)
  )
  WITH CHECK (
    public.current_user_is_broker()
    AND broker_id = auth.uid()
    AND public.broker_owns_broker_attorney(broker_attorney_id)
  );

NOTIFY pgrst, 'reload schema';
