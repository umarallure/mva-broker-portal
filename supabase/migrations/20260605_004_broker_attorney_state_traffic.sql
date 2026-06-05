-- Adds UI-only per-state traffic metadata for broker attorney coverage.
-- coverage_states remains the canonical source of attorney coverage and
-- downstream lawyer_requirements sync.

ALTER TABLE public.broker_attorneys
  ADD COLUMN IF NOT EXISTS coverage_state_traffic jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.broker_attorneys_normalize_state_traffic(
  p_coverage_states text[],
  p_coverage_state_traffic jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw_state text;
  state_code text;
  traffic_value text;
  normalized jsonb := '{}'::jsonb;
  traffic_source jsonb := coalesce(p_coverage_state_traffic, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(traffic_source) IS DISTINCT FROM 'object' THEN
    traffic_source := '{}'::jsonb;
  END IF;

  FOREACH raw_state IN ARRAY coalesce(p_coverage_states, '{}'::text[]) LOOP
    state_code := upper(btrim(coalesce(raw_state, '')));

    IF state_code = '' OR normalized ? state_code THEN
      CONTINUE;
    END IF;

    traffic_value := lower(btrim(coalesce(
      traffic_source ->> state_code,
      traffic_source ->> raw_state,
      'moderate'
    )));

    IF traffic_value NOT IN ('high', 'moderate') THEN
      traffic_value := 'moderate';
    END IF;

    normalized := normalized || jsonb_build_object(state_code, traffic_value);
  END LOOP;

  RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.broker_attorneys_set_state_traffic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.coverage_state_traffic := public.broker_attorneys_normalize_state_traffic(
    NEW.coverage_states,
    NEW.coverage_state_traffic
  );

  RETURN NEW;
END;
$$;

UPDATE public.broker_attorneys
SET coverage_state_traffic = public.broker_attorneys_normalize_state_traffic(
  coverage_states,
  coverage_state_traffic
);

DROP TRIGGER IF EXISTS broker_attorneys_set_state_traffic
  ON public.broker_attorneys;

CREATE TRIGGER broker_attorneys_set_state_traffic
  BEFORE INSERT OR UPDATE OF coverage_states, coverage_state_traffic
  ON public.broker_attorneys
  FOR EACH ROW
  EXECUTE FUNCTION public.broker_attorneys_set_state_traffic();

CREATE OR REPLACE FUNCTION public.update_broker_attorney_coverage_with_traffic(
  p_broker_attorney_id uuid,
  p_coverage_states text[],
  p_coverage_state_traffic jsonb,
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
  normalized_states text[] := coalesce(p_coverage_states, '{}'::text[]);
BEGIN
  IF public.current_user_broker_id() IS NULL
    OR NOT (
      public.current_user_has_broker_section('order_map')
      OR public.current_user_has_broker_section('attorneys')
    )
  THEN
    RAISE EXCEPTION 'Broker order map access is required'
      USING errcode = '42501';
  END IF;

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
    AND ba.broker_id = public.current_user_broker_id()
  RETURNING * INTO updated_attorney;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Broker attorney not found'
      USING errcode = 'P0002';
  END IF;

  RETURN updated_attorney;
END;
$$;

REVOKE ALL ON FUNCTION public.update_broker_attorney_coverage_with_traffic(
  uuid, text[], jsonb, text, text, text, text, text, text[], boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_broker_attorney_coverage_with_traffic(
  uuid, text[], jsonb, text, text, text, text, text, text[], boolean, text
) TO authenticated;

COMMENT ON COLUMN public.broker_attorneys.coverage_state_traffic IS
  'UI-only per-state traffic metadata keyed by covered state code. Valid values are moderate and high; coverage_states remains canonical.';

COMMENT ON FUNCTION public.update_broker_attorney_coverage_with_traffic(
  uuid, text[], jsonb, text, text, text, text, text, text[], boolean, text
) IS
  'Updates broker attorney coverage and UI-only per-state traffic metadata in one broker-scoped operation.';

NOTIFY pgrst, 'reload schema';
