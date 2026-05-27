-- Broker-attorney SOL standards now use two windows:
-- 6-12 months maps to lawyer_requirements.sol = 12month.
-- 12+ months maps to lawyer_requirements.sol = 24month.
CREATE OR REPLACE FUNCTION public.broker_attorneys_map_sol_to_requirement(p_sol text)
RETURNS public.sol_period
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    CASE p_sol
      WHEN '3_months'       THEN '12month'
      WHEN '6_months'       THEN '12month'
      WHEN '12_months'      THEN '12month'
      WHEN '6_12_months'    THEN '12month'
      WHEN '12_plus_months' THEN '24month'
      ELSE NULL
    END
  )::public.sol_period;
$$;

ALTER TABLE public.broker_attorneys
  DROP CONSTRAINT IF EXISTS broker_attorneys_transfer_sol_option_check;

UPDATE public.broker_attorneys
SET transfer_sol_option = CASE
  WHEN transfer_sol_option IN ('3_months', '6_months', '12_months') THEN '6_12_months'
  WHEN transfer_sol_option = '12_plus_months' THEN '12_plus_months'
  WHEN transfer_sol_option = '6_12_months' THEN '6_12_months'
  ELSE NULL
END
WHERE transfer_sol_option IS DISTINCT FROM CASE
  WHEN transfer_sol_option IN ('3_months', '6_months', '12_months') THEN '6_12_months'
  WHEN transfer_sol_option = '12_plus_months' THEN '12_plus_months'
  WHEN transfer_sol_option = '6_12_months' THEN '6_12_months'
  ELSE NULL
END;

ALTER TABLE public.broker_attorneys
  ADD CONSTRAINT broker_attorneys_transfer_sol_option_check
  CHECK (
    transfer_sol_option IS NULL
    OR transfer_sol_option = ANY (ARRAY['6_12_months', '12_plus_months']::text[])
  );

UPDATE public.lawyer_requirements lr
SET
  sol = public.broker_attorneys_map_sol_to_requirement(ba.transfer_sol_option),
  updated_at = now()
FROM public.broker_attorney_requirement_links link
JOIN public.broker_attorneys ba
  ON ba.id = link.broker_attorney_id
WHERE lr.id = link.lawyer_requirement_id
  AND lr.sol IS DISTINCT FROM public.broker_attorneys_map_sol_to_requirement(ba.transfer_sol_option);

NOTIFY pgrst, 'reload schema';
