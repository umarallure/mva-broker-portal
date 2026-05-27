-- Broker-attorney general coverage SOL criteria uses the same two windows as
-- transfer standards: 6-12 months and 12+ months.
ALTER TABLE public.broker_attorneys
  DROP CONSTRAINT IF EXISTS broker_attorneys_coverage_sol_criteria_check;

UPDATE public.broker_attorneys
SET coverage_sol_criteria = CASE
  WHEN coverage_sol_criteria = '12_plus_months' THEN '12_plus_months'
  WHEN coverage_sol_criteria = '6_12_months' THEN '6_12_months'
  ELSE '6_12_months'
END
WHERE coverage_sol_criteria IS DISTINCT FROM CASE
  WHEN coverage_sol_criteria = '12_plus_months' THEN '12_plus_months'
  WHEN coverage_sol_criteria = '6_12_months' THEN '6_12_months'
  ELSE '6_12_months'
END;

ALTER TABLE public.broker_attorneys
  ALTER COLUMN coverage_sol_criteria SET DEFAULT '6_12_months';

ALTER TABLE public.broker_attorneys
  ADD CONSTRAINT broker_attorneys_coverage_sol_criteria_check
  CHECK (coverage_sol_criteria = ANY (ARRAY['6_12_months', '12_plus_months']::text[]));

NOTIFY pgrst, 'reload schema';
