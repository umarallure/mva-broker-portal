-- Broker-attorney accepted injury types now use broad case categories.
ALTER TABLE public.broker_attorneys
  DROP CONSTRAINT IF EXISTS broker_attorneys_transfer_injury_types_check;

UPDATE public.broker_attorneys
SET
  transfer_injury_types = CASE
    WHEN 'Consumer and Commercial Cases' = ANY (transfer_injury_types) THEN ARRAY['Consumer and Commercial Cases']::text[]
    WHEN 'Consumer Cases' = ANY (transfer_injury_types) THEN ARRAY['Consumer Cases']::text[]
    WHEN COALESCE(array_length(transfer_injury_types, 1), 0) > 0 THEN ARRAY['Consumer Cases']::text[]
    ELSE '{}'::text[]
  END,
  transfer_injury_other = NULL
WHERE NOT (transfer_injury_types <@ ARRAY['Consumer Cases', 'Consumer and Commercial Cases']::text[])
  OR COALESCE(array_length(transfer_injury_types, 1), 0) > 1
  OR transfer_injury_other IS NOT NULL;

ALTER TABLE public.broker_attorneys
  ADD CONSTRAINT broker_attorneys_transfer_injury_types_check
  CHECK (
    transfer_injury_types <@ ARRAY['Consumer Cases', 'Consumer and Commercial Cases']::text[]
    AND COALESCE(array_length(transfer_injury_types, 1), 0) <= 1
  );
