-- Broker attorney SOL standards only support fixed 3/6/12 month windows.
-- Preserve schema compatibility for already-applied environments by removing
-- the retired custom SOL column and tightening the option check.

ALTER TABLE public.broker_attorneys
  DROP CONSTRAINT IF EXISTS broker_attorneys_transfer_sol_option_check;

UPDATE public.broker_attorneys
SET
  transfer_sol_option = NULL,
  transfer_standard_types = array_remove(transfer_standard_types, 'sol')
WHERE transfer_sol_option = 'other';

ALTER TABLE public.broker_attorneys
  ADD CONSTRAINT broker_attorneys_transfer_sol_option_check
  CHECK (
    transfer_sol_option IS NULL
    OR transfer_sol_option = ANY (ARRAY['3_months', '6_months', '12_months']::text[])
  );

ALTER TABLE public.broker_attorneys
  DROP COLUMN IF EXISTS transfer_sol_other;

NOTIFY pgrst, 'reload schema';
