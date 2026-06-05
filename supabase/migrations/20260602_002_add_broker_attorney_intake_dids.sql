-- Keep intake routing on the broker-attorney profile while supporting an
-- All States fallback plus state-specific DID overrides.
ALTER TABLE public.broker_attorneys
  ADD COLUMN IF NOT EXISTS intake_dids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Preserve data if the earlier child-table draft was applied before this
-- profile-column migration replaced it.
DO $$
BEGIN
  IF to_regclass('public.broker_attorney_intake_dids') IS NOT NULL THEN
    UPDATE public.broker_attorneys AS attorney
    SET intake_dids = legacy.entries
    FROM (
      SELECT
        broker_attorney_id,
        jsonb_agg(
          jsonb_build_object(
            'state', state,
            'did_number', did_number,
            'contact_name', contact_name,
            'availability_notes', availability_notes
          )
          ORDER BY state
        ) AS entries
      FROM public.broker_attorney_intake_dids
      GROUP BY broker_attorney_id
    ) AS legacy
    WHERE attorney.id = legacy.broker_attorney_id
      AND attorney.intake_dids = '[]'::jsonb;
  END IF;
END;
$$;
