-- Per-state broker attorney bids.
-- coverage_states remains canonical; this table stores the bid for each covered
-- state so future assignment/ranking can order eligible attorneys by bid.

CREATE OR REPLACE FUNCTION public.broker_attorneys_normalized_state_codes(
  p_coverage_states text[]
)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(state_code ORDER BY state_code), '{}'::text[])
  FROM (
    SELECT DISTINCT upper(btrim(coalesce(raw_state, ''))) AS state_code
    FROM unnest(coalesce(p_coverage_states, '{}'::text[])) AS raw_state
  ) normalized
  WHERE state_code <> '';
$$;

CREATE TABLE IF NOT EXISTS public.broker_attorney_state_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  broker_attorney_id uuid NOT NULL,
  state_code text NOT NULL,
  bid_amount_cents bigint NOT NULL DEFAULT 225000,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT broker_attorney_state_bids_attorney_state_key UNIQUE (broker_attorney_id, state_code),
  CONSTRAINT broker_attorney_state_bids_attorney_broker_fkey
    FOREIGN KEY (broker_attorney_id, broker_id)
    REFERENCES public.broker_attorneys(id, broker_id)
    ON DELETE CASCADE,
  CONSTRAINT broker_attorney_state_bids_state_code_check
    CHECK (state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT broker_attorney_state_bids_min_check
    CHECK (bid_amount_cents >= 225000 AND bid_amount_cents % 100 = 0)
);

CREATE INDEX IF NOT EXISTS idx_broker_attorney_state_bids_broker_attorney
  ON public.broker_attorney_state_bids(broker_id, broker_attorney_id);

CREATE INDEX IF NOT EXISTS idx_broker_attorney_state_bids_state_amount
  ON public.broker_attorney_state_bids(state_code, bid_amount_cents DESC);

DROP TRIGGER IF EXISTS broker_attorney_state_bids_set_updated_at
  ON public.broker_attorney_state_bids;

CREATE TRIGGER broker_attorney_state_bids_set_updated_at
  BEFORE UPDATE ON public.broker_attorney_state_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.broker_attorney_state_bids_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attorney_broker_id uuid;
  attorney_states text[];
BEGIN
  NEW.state_code := upper(btrim(coalesce(NEW.state_code, '')));

  IF NEW.state_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'State code must be a two-letter state abbreviation'
      USING errcode = '22023';
  END IF;

  IF NEW.bid_amount_cents < 225000 OR NEW.bid_amount_cents % 100 <> 0 THEN
    RAISE EXCEPTION 'State bids must be whole dollar amounts of at least $2,250'
      USING errcode = '22023';
  END IF;

  SELECT
    ba.broker_id,
    public.broker_attorneys_normalized_state_codes(ba.coverage_states)
  INTO attorney_broker_id, attorney_states
  FROM public.broker_attorneys ba
  WHERE ba.id = NEW.broker_attorney_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker attorney not found'
      USING errcode = 'P0002';
  END IF;

  IF NEW.broker_id IS DISTINCT FROM attorney_broker_id THEN
    RAISE EXCEPTION 'Broker attorney bid broker mismatch'
      USING errcode = '22023';
  END IF;

  IF NOT (NEW.state_code = ANY(attorney_states)) THEN
    RAISE EXCEPTION 'State bid must belong to a covered state'
      USING errcode = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broker_attorney_state_bids_validate
  ON public.broker_attorney_state_bids;

CREATE TRIGGER broker_attorney_state_bids_validate
  BEFORE INSERT OR UPDATE OF broker_id, broker_attorney_id, state_code, bid_amount_cents
  ON public.broker_attorney_state_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.broker_attorney_state_bids_validate();

INSERT INTO public.broker_attorney_state_bids (
  broker_id,
  broker_attorney_id,
  state_code,
  bid_amount_cents
)
SELECT
  ba.broker_id,
  ba.id,
  covered_state.state_code,
  225000
FROM public.broker_attorneys ba
CROSS JOIN LATERAL unnest(public.broker_attorneys_normalized_state_codes(ba.coverage_states))
  AS covered_state(state_code)
WHERE covered_state.state_code ~ '^[A-Z]{2}$'
ON CONFLICT (broker_attorney_id, state_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.broker_attorneys_sync_state_bids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_states text[] := public.broker_attorneys_normalized_state_codes(NEW.coverage_states);
BEGIN
  DELETE FROM public.broker_attorney_state_bids bid
  WHERE bid.broker_attorney_id = NEW.id
    AND NOT (bid.state_code = ANY(normalized_states));

  INSERT INTO public.broker_attorney_state_bids (
    broker_id,
    broker_attorney_id,
    state_code,
    bid_amount_cents
  )
  SELECT
    NEW.broker_id,
    NEW.id,
    covered_state.state_code,
    225000
  FROM unnest(normalized_states) AS covered_state(state_code)
  WHERE covered_state.state_code ~ '^[A-Z]{2}$'
  ON CONFLICT (broker_attorney_id, state_code) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broker_attorneys_sync_state_bids
  ON public.broker_attorneys;

CREATE TRIGGER broker_attorneys_sync_state_bids
  AFTER INSERT OR UPDATE OF broker_id, coverage_states
  ON public.broker_attorneys
  FOR EACH ROW
  EXECUTE FUNCTION public.broker_attorneys_sync_state_bids();

CREATE OR REPLACE FUNCTION public.broker_attorneys_normalize_state_bid_cents(
  p_coverage_states text[],
  p_coverage_state_bids jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw_state text;
  state_code text;
  raw_bid text;
  bid_value numeric;
  bid_cents bigint;
  normalized jsonb := '{}'::jsonb;
  bid_source jsonb := coalesce(p_coverage_state_bids, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(bid_source) IS DISTINCT FROM 'object' THEN
    bid_source := '{}'::jsonb;
  END IF;

  FOREACH raw_state IN ARRAY public.broker_attorneys_normalized_state_codes(p_coverage_states) LOOP
    state_code := upper(btrim(coalesce(raw_state, '')));

    IF state_code = '' OR normalized ? state_code THEN
      CONTINUE;
    END IF;

    raw_bid := nullif(btrim(coalesce(
      bid_source ->> state_code,
      bid_source ->> raw_state,
      '2250'
    )), '');

    IF raw_bid IS NULL THEN
      bid_value := 2250;
    ELSE
      BEGIN
        bid_value := raw_bid::numeric;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'State bids must be valid dollar amounts'
            USING errcode = '22023';
      END;
    END IF;

    IF bid_value <> trunc(bid_value) THEN
      RAISE EXCEPTION 'State bids must be whole dollar amounts'
        USING errcode = '22023';
    END IF;

    bid_cents := bid_value::bigint * 100;

    IF bid_cents < 225000 THEN
      RAISE EXCEPTION 'State bids must be at least $2,250'
        USING errcode = '22023';
    END IF;

    normalized := normalized || jsonb_build_object(state_code, bid_cents);
  END LOOP;

  RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_broker_attorney_coverage_with_bids(
  p_broker_attorney_id uuid,
  p_coverage_states text[],
  p_coverage_state_traffic jsonb,
  p_coverage_state_bids jsonb,
  p_coverage_case_category text,
  p_coverage_sol_criteria text,
  p_coverage_liability_status text,
  p_coverage_insurance_status text,
  p_coverage_medical_treatment text,
  p_coverage_languages text[],
  p_coverage_no_prior_attorney boolean,
  p_coverage_notes text
)
RETURNS public.broker_attorneys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_attorney public.broker_attorneys%rowtype;
  workspace_broker_id uuid := public.current_user_broker_id();
  normalized_states text[] := public.broker_attorneys_normalized_state_codes(p_coverage_states);
  normalized_bid_cents jsonb;
BEGIN
  IF workspace_broker_id IS NULL
    OR NOT (
      public.current_user_has_broker_section('order_map')
      OR public.current_user_has_broker_section('attorneys')
    )
  THEN
    RAISE EXCEPTION 'Broker order map access is required'
      USING errcode = '42501';
  END IF;

  normalized_bid_cents := public.broker_attorneys_normalize_state_bid_cents(
    normalized_states,
    coalesce(p_coverage_state_bids, '{}'::jsonb)
  );

  UPDATE public.broker_attorneys ba
  SET
    coverage_states = normalized_states,
    coverage_state_traffic = public.broker_attorneys_normalize_state_traffic(
      normalized_states,
      coalesce(p_coverage_state_traffic, '{}'::jsonb)
    ),
    coverage_case_category = p_coverage_case_category,
    coverage_sol_criteria = p_coverage_sol_criteria,
    coverage_liability_status = p_coverage_liability_status,
    coverage_insurance_status = p_coverage_insurance_status,
    coverage_medical_treatment = p_coverage_medical_treatment,
    coverage_languages = coalesce(p_coverage_languages, '{}'::text[]),
    coverage_no_prior_attorney = coalesce(p_coverage_no_prior_attorney, true),
    coverage_notes = nullif(btrim(coalesce(p_coverage_notes, '')), '')
  WHERE ba.id = p_broker_attorney_id
    AND ba.broker_id = workspace_broker_id
  RETURNING * INTO updated_attorney;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker attorney not found'
      USING errcode = 'P0002';
  END IF;

  DELETE FROM public.broker_attorney_state_bids bid
  WHERE bid.broker_attorney_id = p_broker_attorney_id
    AND NOT (bid.state_code = ANY(normalized_states));

  INSERT INTO public.broker_attorney_state_bids (
    broker_id,
    broker_attorney_id,
    state_code,
    bid_amount_cents
  )
  SELECT
    workspace_broker_id,
    p_broker_attorney_id,
    bid_row.key,
    bid_row.value::bigint
  FROM jsonb_each_text(normalized_bid_cents) AS bid_row(key, value)
  ON CONFLICT (broker_attorney_id, state_code) DO UPDATE
  SET
    broker_id = EXCLUDED.broker_id,
    bid_amount_cents = EXCLUDED.bid_amount_cents,
    updated_at = now();

  RETURN updated_attorney;
END;
$$;

REVOKE ALL ON FUNCTION public.update_broker_attorney_coverage_with_bids(
  uuid, text[], jsonb, jsonb, text, text, text, text, text, text[], boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_broker_attorney_coverage_with_bids(
  uuid, text[], jsonb, jsonb, text, text, text, text, text, text[], boolean, text
) TO authenticated;

ALTER TABLE public.broker_attorney_state_bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_attorney_state_bids_admin_all
  ON public.broker_attorney_state_bids;
DROP POLICY IF EXISTS broker_attorney_state_bids_broker_select
  ON public.broker_attorney_state_bids;
DROP POLICY IF EXISTS broker_attorney_state_bids_broker_insert
  ON public.broker_attorney_state_bids;
DROP POLICY IF EXISTS broker_attorney_state_bids_broker_update
  ON public.broker_attorney_state_bids;
DROP POLICY IF EXISTS broker_attorney_state_bids_broker_delete
  ON public.broker_attorney_state_bids;

CREATE POLICY broker_attorney_state_bids_admin_all
  ON public.broker_attorney_state_bids
  FOR ALL TO authenticated
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

CREATE POLICY broker_attorney_state_bids_broker_select
  ON public.broker_attorney_state_bids
  FOR SELECT TO authenticated
  USING (
    broker_id = public.current_user_broker_id()
    AND (
      public.current_user_has_broker_section('order_map')
      OR public.current_user_has_broker_section('attorneys')
    )
  );

GRANT SELECT
  ON public.broker_attorney_state_bids
  TO authenticated;

COMMENT ON TABLE public.broker_attorney_state_bids IS
  'Per-covered-state bid amounts for broker attorneys. Stored in cents; UI accepts whole USD dollars with a $2,250 minimum.';

COMMENT ON FUNCTION public.update_broker_attorney_coverage_with_bids(
  uuid, text[], jsonb, jsonb, text, text, text, text, text, text[], boolean, text
) IS
  'Updates broker attorney coverage, UI traffic metadata, and per-state whole-dollar bids in one broker-scoped operation.';

NOTIFY pgrst, 'reload schema';
