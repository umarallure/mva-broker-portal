-- Link broker-side lawyers to their owning broker. Reuses lawyer_requirements,
-- which already classifies each lawyer as internal_lawyer vs broker_lawyer via
-- lawyer_type. broker_id stays NULL for internal lawyers; for broker_lawyer it
-- points at the broker's auth.users row (the same row referenced by app_users).

ALTER TABLE public.lawyer_requirements
  ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.lawyer_requirements
    ADD CONSTRAINT lawyer_requirements_broker_id_type_check
    CHECK (
      broker_id IS NULL
      OR lawyer_type = 'broker_lawyer'
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_lawyer_requirements_broker_id
  ON public.lawyer_requirements(broker_id)
  WHERE broker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lawyer_requirements_broker_attorney
  ON public.lawyer_requirements(broker_id, attorney_id)
  WHERE lawyer_type = 'broker_lawyer';

COMMENT ON COLUMN public.lawyer_requirements.broker_id IS
  'When lawyer_type=broker_lawyer, the broker (auth.users.id) this lawyer belongs to. NULL for internal lawyers.';

NOTIFY pgrst, 'reload schema';
