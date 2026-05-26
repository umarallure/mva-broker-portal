-- Broker attorney assignment bridge.
--
-- lawyer_requirements remains the closer/agent recommendation table. Broker
-- attorneys remain profile-only rows in broker_attorneys. This bridge lets the
-- closer portal continue recommending lawyer_requirements while writing durable
-- broker_attorney IDs to call results, daily deal flow, and leads.

CREATE TABLE IF NOT EXISTS public.broker_attorney_requirement_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  broker_attorney_id uuid NOT NULL,
  lawyer_requirement_id uuid NOT NULL REFERENCES public.lawyer_requirements(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_attorney_requirement_links_attorney_broker_fkey
    FOREIGN KEY (broker_attorney_id, broker_id)
    REFERENCES public.broker_attorneys(id, broker_id)
    ON DELETE CASCADE,
  CONSTRAINT broker_attorney_requirement_links_lawyer_requirement_key UNIQUE (lawyer_requirement_id),
  CONSTRAINT broker_attorney_requirement_links_attorney_requirement_key UNIQUE (broker_attorney_id, lawyer_requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_broker_attorney_requirement_links_broker
  ON public.broker_attorney_requirement_links(broker_id);

CREATE INDEX IF NOT EXISTS idx_broker_attorney_requirement_links_attorney
  ON public.broker_attorney_requirement_links(broker_attorney_id);

DROP TRIGGER IF EXISTS broker_attorney_requirement_links_set_updated_at
  ON public.broker_attorney_requirement_links;

CREATE TRIGGER broker_attorney_requirement_links_set_updated_at
  BEFORE UPDATE ON public.broker_attorney_requirement_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.broker_attorney_requirement_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_attorney_requirement_links_select ON public.broker_attorney_requirement_links;
DROP POLICY IF EXISTS broker_attorney_requirement_links_admin_all ON public.broker_attorney_requirement_links;

CREATE POLICY broker_attorney_requirement_links_select
  ON public.broker_attorney_requirement_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.app_users
      WHERE app_users.user_id = auth.uid()
    )
  );

CREATE POLICY broker_attorney_requirement_links_admin_all
  ON public.broker_attorney_requirement_links
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

ALTER TABLE public.call_results
  ADD COLUMN IF NOT EXISTS submitted_broker_attorney_id uuid NULL,
  ADD COLUMN IF NOT EXISTS submitted_broker_id uuid NULL;

ALTER TABLE public.daily_deal_flow
  ADD COLUMN IF NOT EXISTS submitted_broker_attorney_id uuid NULL,
  ADD COLUMN IF NOT EXISTS submitted_broker_id uuid NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_broker_attorney_id uuid NULL
  REFERENCES public.broker_attorneys(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_results_submitted_broker_attorney
  ON public.call_results(submitted_broker_attorney_id);

CREATE INDEX IF NOT EXISTS idx_call_results_submitted_broker
  ON public.call_results(submitted_broker_id);

CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_submitted_broker_attorney
  ON public.daily_deal_flow(submitted_broker_attorney_id);

CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_submitted_broker
  ON public.daily_deal_flow(submitted_broker_id);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_broker_attorney_id
  ON public.leads(assigned_broker_attorney_id);

DO $$
BEGIN
  ALTER TABLE public.call_results
    ADD CONSTRAINT call_results_submitted_broker_attorney_fkey
    FOREIGN KEY (submitted_broker_attorney_id)
    REFERENCES public.broker_attorneys(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.call_results
    ADD CONSTRAINT call_results_submitted_broker_id_fkey
    FOREIGN KEY (submitted_broker_id)
    REFERENCES public.broker_profiles(user_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.call_results
    ADD CONSTRAINT call_results_submitted_broker_attorney_broker_fkey
    FOREIGN KEY (submitted_broker_attorney_id, submitted_broker_id)
    REFERENCES public.broker_attorneys(id, broker_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.daily_deal_flow
    ADD CONSTRAINT daily_deal_flow_submitted_broker_attorney_fkey
    FOREIGN KEY (submitted_broker_attorney_id)
    REFERENCES public.broker_attorneys(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.daily_deal_flow
    ADD CONSTRAINT daily_deal_flow_submitted_broker_id_fkey
    FOREIGN KEY (submitted_broker_id)
    REFERENCES public.broker_profiles(user_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.daily_deal_flow
    ADD CONSTRAINT daily_deal_flow_submitted_broker_attorney_broker_fkey
    FOREIGN KEY (submitted_broker_attorney_id, submitted_broker_id)
    REFERENCES public.broker_attorneys(id, broker_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_broker_retainer_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_status = ANY (
    ARRAY[
      'attorney_review',
      'attorney_approved',
      'attorney_rejected',
      'qualified_payable'
    ]::text[]
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.sync_lead_broker_attorney_assignment(
  p_submission_id text,
  p_broker_attorney_id uuid,
  p_broker_id uuid,
  p_status text,
  p_submitted_attorney_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_broker_attorney_id uuid;
BEGIN
  IF p_submission_id IS NULL OR btrim(p_submission_id) = '' THEN
    RETURN;
  END IF;

  IF p_broker_attorney_id IS NULL THEN
    RETURN;
  END IF;

  IF lower(btrim(coalesce(p_submitted_attorney_status, ''))) = 'nocoverage' THEN
    RETURN;
  END IF;

  IF NOT public.is_broker_retainer_status(p_status) THEN
    RETURN;
  END IF;

  SELECT ba.id
  INTO resolved_broker_attorney_id
  FROM public.broker_attorneys ba
  WHERE ba.id = p_broker_attorney_id
    AND (
      p_broker_id IS NULL
      OR ba.broker_id = p_broker_id
    )
  LIMIT 1;

  IF resolved_broker_attorney_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.leads l
  SET assigned_broker_attorney_id = resolved_broker_attorney_id
  WHERE l.submission_id = p_submission_id
    AND l.assigned_broker_attorney_id IS DISTINCT FROM resolved_broker_attorney_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_broker_retainer_status(text) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_lead_broker_attorney_assignment(text, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_lead_broker_attorney_assignment(text, uuid, uuid, text, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.handle_call_results_broker_attorney_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_lead_broker_attorney_assignment(
    NEW.submission_id,
    NEW.submitted_broker_attorney_id,
    NEW.submitted_broker_id,
    NEW.status,
    NEW.submitted_attorney_status
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_daily_deal_flow_broker_attorney_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_lead_broker_attorney_assignment(
    NEW.submission_id,
    NEW.submitted_broker_attorney_id,
    NEW.submitted_broker_id,
    NEW.status,
    NEW.submitted_attorney_status
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_results_broker_attorney_sync ON public.call_results;

CREATE TRIGGER trg_call_results_broker_attorney_sync
  AFTER INSERT OR UPDATE OF
    submission_id,
    status,
    submitted_attorney_status,
    submitted_broker_attorney_id,
    submitted_broker_id
  ON public.call_results
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_call_results_broker_attorney_sync();

DROP TRIGGER IF EXISTS trg_daily_deal_flow_broker_attorney_sync ON public.daily_deal_flow;

CREATE TRIGGER trg_daily_deal_flow_broker_attorney_sync
  AFTER INSERT OR UPDATE OF
    submission_id,
    status,
    submitted_attorney_status,
    submitted_broker_attorney_id,
    submitted_broker_id
  ON public.daily_deal_flow
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_daily_deal_flow_broker_attorney_sync();

DO $$
DECLARE
  launch_forward_broker_id constant uuid := 'c3540551-cc77-4644-b946-bdc9ce8d792f';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.broker_attorney_requirement_links l
    WHERE l.lawyer_requirement_id IN (
      '36047a30-e220-411c-9fa9-13af257085fa',
      '55cae776-e7cf-4335-b960-a64682f73ae6',
      '9c3a2d09-697d-4cb1-a0fc-d5b340032e48',
      'b17a8eb5-0140-4b56-bfa9-4e8794b594f2',
      'dbc01ba5-21d7-4fbf-8340-da8f4f3d1bf9'
    )
    AND (
      l.broker_id <> launch_forward_broker_id
      OR l.broker_attorney_id <> l.lawyer_requirement_id
    )
  ) THEN
    RAISE EXCEPTION 'Launch Forward lawyer requirement link collision detected.';
  END IF;
END;
$$;

INSERT INTO public.broker_attorney_requirement_links (
  broker_id,
  broker_attorney_id,
  lawyer_requirement_id
)
VALUES
  (
    'c3540551-cc77-4644-b946-bdc9ce8d792f',
    '36047a30-e220-411c-9fa9-13af257085fa',
    '36047a30-e220-411c-9fa9-13af257085fa'
  ),
  (
    'c3540551-cc77-4644-b946-bdc9ce8d792f',
    '55cae776-e7cf-4335-b960-a64682f73ae6',
    '55cae776-e7cf-4335-b960-a64682f73ae6'
  ),
  (
    'c3540551-cc77-4644-b946-bdc9ce8d792f',
    '9c3a2d09-697d-4cb1-a0fc-d5b340032e48',
    '9c3a2d09-697d-4cb1-a0fc-d5b340032e48'
  ),
  (
    'c3540551-cc77-4644-b946-bdc9ce8d792f',
    'b17a8eb5-0140-4b56-bfa9-4e8794b594f2',
    'b17a8eb5-0140-4b56-bfa9-4e8794b594f2'
  ),
  (
    'c3540551-cc77-4644-b946-bdc9ce8d792f',
    'dbc01ba5-21d7-4fbf-8340-da8f4f3d1bf9',
    'dbc01ba5-21d7-4fbf-8340-da8f4f3d1bf9'
  )
ON CONFLICT (lawyer_requirement_id) DO UPDATE
SET
  broker_id = EXCLUDED.broker_id,
  broker_attorney_id = EXCLUDED.broker_attorney_id,
  updated_at = now();

WITH attorney_map(attorney_name, broker_attorney_id) AS (
  VALUES
    ('McDonald Worly', '36047a30-e220-411c-9fa9-13af257085fa'::uuid),
    ('Lerner and Rowe', '55cae776-e7cf-4335-b960-a64682f73ae6'::uuid),
    ('The Advocates', '9c3a2d09-697d-4cb1-a0fc-d5b340032e48'::uuid),
    ('Turnbull, Moak & Pendergrass', 'b17a8eb5-0140-4b56-bfa9-4e8794b594f2'::uuid),
    ('Beverly Law', 'dbc01ba5-21d7-4fbf-8340-da8f4f3d1bf9'::uuid)
)
UPDATE public.call_results cr
SET
  submitted_broker_attorney_id = attorney_map.broker_attorney_id,
  submitted_broker_id = 'c3540551-cc77-4644-b946-bdc9ce8d792f'::uuid
FROM attorney_map
WHERE cr.submitted_broker_attorney_id IS NULL
  AND lower(btrim(cr.submitted_attorney)) = lower(attorney_map.attorney_name)
  AND public.is_broker_retainer_status(cr.status)
  AND lower(btrim(coalesce(cr.submitted_attorney_status, ''))) <> 'nocoverage';

WITH attorney_map(attorney_name, broker_attorney_id) AS (
  VALUES
    ('McDonald Worly', '36047a30-e220-411c-9fa9-13af257085fa'::uuid),
    ('Lerner and Rowe', '55cae776-e7cf-4335-b960-a64682f73ae6'::uuid),
    ('The Advocates', '9c3a2d09-697d-4cb1-a0fc-d5b340032e48'::uuid),
    ('Turnbull, Moak & Pendergrass', 'b17a8eb5-0140-4b56-bfa9-4e8794b594f2'::uuid),
    ('Beverly Law', 'dbc01ba5-21d7-4fbf-8340-da8f4f3d1bf9'::uuid)
)
UPDATE public.daily_deal_flow ddf
SET
  submitted_broker_attorney_id = attorney_map.broker_attorney_id,
  submitted_broker_id = 'c3540551-cc77-4644-b946-bdc9ce8d792f'::uuid
FROM attorney_map
WHERE ddf.submitted_broker_attorney_id IS NULL
  AND lower(btrim(ddf.submitted_attorney)) = lower(attorney_map.attorney_name)
  AND public.is_broker_retainer_status(ddf.status)
  AND lower(btrim(coalesce(ddf.submitted_attorney_status, ''))) <> 'nocoverage';

WITH broker_submission_candidates AS (
  SELECT
    cr.submission_id,
    cr.submitted_broker_attorney_id,
    cr.submitted_broker_id,
    cr.status,
    cr.submitted_attorney_status,
    cr.updated_at,
    cr.created_at
  FROM public.call_results cr
  WHERE cr.submitted_broker_attorney_id IS NOT NULL

  UNION ALL

  SELECT
    ddf.submission_id,
    ddf.submitted_broker_attorney_id,
    ddf.submitted_broker_id,
    ddf.status,
    ddf.submitted_attorney_status,
    ddf.updated_at,
    ddf.created_at
  FROM public.daily_deal_flow ddf
  WHERE ddf.submitted_broker_attorney_id IS NOT NULL
),
ranked AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY submission_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM broker_submission_candidates
  WHERE public.is_broker_retainer_status(status)
    AND lower(btrim(coalesce(submitted_attorney_status, ''))) <> 'nocoverage'
)
UPDATE public.leads l
SET assigned_broker_attorney_id = ranked.submitted_broker_attorney_id
FROM ranked
WHERE ranked.rn = 1
  AND ranked.submission_id = l.submission_id
  AND l.assigned_broker_attorney_id IS DISTINCT FROM ranked.submitted_broker_attorney_id;

COMMENT ON TABLE public.broker_attorney_requirement_links IS
  'Maps closer recommendation lawyer_requirements rows to canonical broker_attorneys rows.';

COMMENT ON COLUMN public.call_results.submitted_broker_attorney_id IS
  'Canonical broker_attorneys.id selected during broker fulfillment. submitted_attorney remains display text.';

COMMENT ON COLUMN public.daily_deal_flow.submitted_broker_attorney_id IS
  'Canonical broker_attorneys.id selected during broker fulfillment. submitted_attorney remains display text.';

NOTIFY pgrst, 'reload schema';
