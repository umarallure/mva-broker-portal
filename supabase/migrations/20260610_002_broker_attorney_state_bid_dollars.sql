-- Store per-state broker attorney bids as dollar amounts instead of cents.
-- The original bid migration used bid_amount_cents = 225000. This follow-up
-- keeps existing rows, converts them to bid_amount = 2250.00, and rewires the
-- validation/sync/RPC functions to use dollar values directly.

DROP TRIGGER IF EXISTS broker_attorney_state_bids_validate
  ON public.broker_attorney_state_bids;

ALTER TABLE public.broker_attorney_state_bids
  DROP CONSTRAINT IF EXISTS broker_attorney_state_bids_min_check;

DROP INDEX IF EXISTS public.idx_broker_attorney_state_bids_state_amount;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'broker_attorney_state_bids'
      AND column_name = 'bid_amount_cents'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'broker_attorney_state_bids'
      AND column_name = 'bid_amount'
  ) THEN
    ALTER TABLE public.broker_attorney_state_bids
      RENAME COLUMN bid_amount_cents TO bid_amount;
  END IF;
END;
$$;

DO $$
DECLARE
  column_data_type text;
  column_numeric_precision integer;
  column_numeric_scale integer;
BEGIN
  SELECT data_type, numeric_precision, numeric_scale
  INTO column_data_type, column_numeric_precision, column_numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'broker_attorney_state_bids'
    AND column_name = 'bid_amount';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'broker_attorney_state_bids.bid_amount column not found'
      USING errcode = '42703';
  END IF;

  IF column_data_type = 'bigint' THEN
    ALTER TABLE public.broker_attorney_state_bids
      ALTER COLUMN bid_amount TYPE numeric(12, 2)
      USING (bid_amount::numeric / 100)::numeric(12, 2);
  ELSIF column_data_type = 'numeric'
    AND (
      column_numeric_precision IS DISTINCT FROM 12
      OR column_numeric_scale IS DISTINCT FROM 2
    )
  THEN
    ALTER TABLE public.broker_attorney_state_bids
      ALTER COLUMN bid_amount TYPE numeric(12, 2)
      USING round(bid_amount::numeric, 2)::numeric(12, 2);
  END IF;
END;
$$;

ALTER TABLE public.broker_attorney_state_bids
  ALTER COLUMN bid_amount SET DEFAULT 2250.00,
  ALTER COLUMN bid_amount SET NOT NULL,
  ADD CONSTRAINT broker_attorney_state_bids_min_check
    CHECK (bid_amount >= 2250.00 AND bid_amount = trunc(bid_amount));

CREATE INDEX IF NOT EXISTS idx_broker_attorney_state_bids_state_amount
  ON public.broker_attorney_state_bids(state_code, bid_amount DESC);

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

  IF NEW.bid_amount IS NULL
    OR NEW.bid_amount < 2250.00
    OR NEW.bid_amount <> trunc(NEW.bid_amount)
  THEN
    RAISE EXCEPTION 'State bids must be whole dollar amounts of at least $2,250.00'
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

CREATE TRIGGER broker_attorney_state_bids_validate
  BEFORE INSERT OR UPDATE OF broker_id, broker_attorney_id, state_code, bid_amount
  ON public.broker_attorney_state_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.broker_attorney_state_bids_validate();

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
    bid_amount
  )
  SELECT
    NEW.broker_id,
    NEW.id,
    covered_state.state_code,
    2250.00
  FROM unnest(normalized_states) AS covered_state(state_code)
  WHERE covered_state.state_code ~ '^[A-Z]{2}$'
  ON CONFLICT (broker_attorney_id, state_code) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.broker_attorneys_normalize_state_bid_amounts(
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
  bid_amount numeric;
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

    raw_bid := NULL;

    SELECT nullif(btrim(source.value), '')
    INTO raw_bid
    FROM jsonb_each_text(bid_source) AS source(key, value)
    WHERE upper(btrim(source.key)) = state_code
    LIMIT 1;

    IF raw_bid IS NULL THEN
      bid_amount := 2250.00;
    ELSE
      BEGIN
        bid_amount := raw_bid::numeric;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'State bids must be valid dollar amounts'
            USING errcode = '22023';
      END;
    END IF;

    IF bid_amount <> trunc(bid_amount) THEN
      RAISE EXCEPTION 'State bids must be whole dollar amounts'
        USING errcode = '22023';
    END IF;

    IF bid_amount < 2250.00 THEN
      RAISE EXCEPTION 'State bids must be at least $2,250.00'
        USING errcode = '22023';
    END IF;

    normalized := normalized || jsonb_build_object(state_code, bid_amount);
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
  normalized_bid_amounts jsonb;
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

  normalized_bid_amounts := public.broker_attorneys_normalize_state_bid_amounts(
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
    bid_amount
  )
  SELECT
    workspace_broker_id,
    p_broker_attorney_id,
    bid_row.key,
    bid_row.value::numeric
  FROM jsonb_each_text(normalized_bid_amounts) AS bid_row(key, value)
  ON CONFLICT (broker_attorney_id, state_code) DO UPDATE
  SET
    broker_id = EXCLUDED.broker_id,
    bid_amount = EXCLUDED.bid_amount,
    updated_at = now();

  RETURN updated_attorney;
END;
$$;

DROP FUNCTION IF EXISTS public.broker_attorneys_normalize_state_bid_cents(text[], jsonb);

REVOKE ALL ON FUNCTION public.update_broker_attorney_coverage_with_bids(
  uuid, text[], jsonb, jsonb, text, text, text, text, text, text[], boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_broker_attorney_coverage_with_bids(
  uuid, text[], jsonb, jsonb, text, text, text, text, text, text[], boolean, text
) TO authenticated;

COMMENT ON TABLE public.broker_attorney_state_bids IS
  'Per-covered-state bid amounts for broker attorneys. Stored as numeric USD dollars with two decimals; UI accepts whole-dollar bids with a $2,250.00 minimum.';

COMMENT ON COLUMN public.broker_attorney_state_bids.bid_amount IS
  'USD bid amount for this covered state. Minimum 2250.00; whole-dollar values only.';

COMMENT ON FUNCTION public.broker_attorneys_normalize_state_bid_amounts(text[], jsonb) IS
  'Normalizes per-state bid JSON into USD dollar amounts keyed by two-letter state code.';

COMMENT ON FUNCTION public.update_broker_attorney_coverage_with_bids(
  uuid, text[], jsonb, jsonb, text, text, text, text, text, text[], boolean, text
) IS
  'Updates broker attorney coverage, UI traffic metadata, and per-state whole-dollar bids in one broker-scoped operation.';

NOTIFY pgrst, 'reload schema';
