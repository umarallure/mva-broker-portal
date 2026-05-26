-- Seed Launch Forward as the first broker account and migrate its broker-managed
-- attorneys from the legacy lawyer_requirements records into broker_attorneys.
--
-- Requires the auth.users/app_users broker account to already exist:
--   c3540551-cc77-4644-b946-bdc9ce8d792f / launchforward@accidentpayments.com

INSERT INTO public.broker_profiles (
  user_id,
  full_name,
  company_name,
  languages,
  primary_email,
  preferred_contact
)
VALUES (
  'c3540551-cc77-4644-b946-bdc9ce8d792f',
  'Launch Forward',
  'Launch Forward',
  ARRAY['English']::text[],
  'launchforward@accidentpayments.com',
  'email'
)
ON CONFLICT (user_id) DO UPDATE
SET
  full_name = COALESCE(public.broker_profiles.full_name, EXCLUDED.full_name),
  company_name = COALESCE(public.broker_profiles.company_name, EXCLUDED.company_name),
  languages = CASE
    WHEN cardinality(public.broker_profiles.languages) = 0 THEN EXCLUDED.languages
    ELSE public.broker_profiles.languages
  END,
  primary_email = COALESCE(public.broker_profiles.primary_email, EXCLUDED.primary_email),
  preferred_contact = COALESCE(public.broker_profiles.preferred_contact, EXCLUDED.preferred_contact)
WHERE
  public.broker_profiles.full_name IS NULL
  OR public.broker_profiles.company_name IS NULL
  OR cardinality(public.broker_profiles.languages) = 0
  OR public.broker_profiles.primary_email IS NULL
  OR public.broker_profiles.preferred_contact IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.broker_attorneys
    WHERE id IN (
      '36047a30-e220-411c-9fa9-13af257085fa',
      '55cae776-e7cf-4335-b960-a64682f73ae6',
      '9c3a2d09-697d-4cb1-a0fc-d5b340032e48',
      'b17a8eb5-0140-4b56-bfa9-4e8794b594f2',
      'dbc01ba5-21d7-4fbf-8340-da8f4f3d1bf9'
    )
      AND broker_id <> 'c3540551-cc77-4644-b946-bdc9ce8d792f'
  ) THEN
    RAISE EXCEPTION 'Launch Forward broker attorney seed UUID collision with another broker';
  END IF;
END;
$$;

WITH legacy_attorneys AS (
  SELECT *
  FROM (
    VALUES
      (
        '36047a30-e220-411c-9fa9-13af257085fa'::uuid,
        'McDonald Worly'::text,
        '6month'::text,
        '["TX", "NC", "AZ", "NY", "GA", "SC", "WI", "FL", "AK", "AR", "IL", "CO", "CT"]'::jsonb,
        '3463883553'::text
      ),
      (
        '55cae776-e7cf-4335-b960-a64682f73ae6'::uuid,
        'Lerner and Rowe'::text,
        '12month'::text,
        '["AZ", "WA", "NM", "NV"]'::jsonb,
        '+16073001696'::text
      ),
      (
        '9c3a2d09-697d-4cb1-a0fc-d5b340032e48'::uuid,
        'The Advocates'::text,
        '12month'::text,
        '["AZ", "CA", "IA", "MT", "NV", "ND", "WY", "UT"]'::jsonb,
        NULL::text
      ),
      (
        'b17a8eb5-0140-4b56-bfa9-4e8794b594f2'::uuid,
        'Turnbull, Moak & Pendergrass'::text,
        '12month'::text,
        '[]'::jsonb,
        '+1 (404) 348-4511'::text
      ),
      (
        'dbc01ba5-21d7-4fbf-8340-da8f4f3d1bf9'::uuid,
        'Beverly Law'::text,
        '12month'::text,
        '[]'::jsonb,
        '+18774272752'::text
      )
  ) AS rows(id, attorney_name, legacy_sol, states, did_number)
),
mapped_attorneys AS (
  SELECT
    id,
    'c3540551-cc77-4644-b946-bdc9ce8d792f'::uuid AS broker_id,
    attorney_name,
    NULLIF(btrim(did_number), '') AS direct_phone,
    CASE legacy_sol
      WHEN '3month' THEN '3_months'
      WHEN '6month' THEN '6_months'
      WHEN '12month' THEN '12_months'
      ELSE NULL
    END AS mapped_sol,
    ARRAY(
      SELECT jsonb_array_elements_text(states)
    )::text[] AS coverage_states
  FROM legacy_attorneys
)
INSERT INTO public.broker_attorneys (
  id,
  broker_id,
  attorney_name,
  languages,
  direct_phone,
  preferred_contact,
  transfer_standard_types,
  transfer_sol_option,
  coverage_states,
  coverage_sol_criteria,
  coverage_languages
)
SELECT
  id,
  broker_id,
  attorney_name,
  ARRAY['English']::text[],
  direct_phone,
  CASE WHEN direct_phone IS NULL THEN 'email' ELSE 'phone' END,
  CASE WHEN mapped_sol IS NULL THEN '{}'::text[] ELSE ARRAY['sol']::text[] END,
  mapped_sol,
  coverage_states,
  COALESCE(mapped_sol, 'no_criteria'),
  ARRAY['English']::text[]
FROM mapped_attorneys
ON CONFLICT (id) DO UPDATE
SET
  broker_id = EXCLUDED.broker_id,
  attorney_name = EXCLUDED.attorney_name,
  direct_phone = COALESCE(public.broker_attorneys.direct_phone, EXCLUDED.direct_phone),
  preferred_contact = COALESCE(public.broker_attorneys.preferred_contact, EXCLUDED.preferred_contact),
  transfer_standard_types = CASE
    WHEN cardinality(public.broker_attorneys.transfer_standard_types) = 0 THEN EXCLUDED.transfer_standard_types
    ELSE public.broker_attorneys.transfer_standard_types
  END,
  transfer_sol_option = COALESCE(public.broker_attorneys.transfer_sol_option, EXCLUDED.transfer_sol_option),
  coverage_states = CASE
    WHEN cardinality(public.broker_attorneys.coverage_states) = 0 THEN EXCLUDED.coverage_states
    ELSE public.broker_attorneys.coverage_states
  END,
  coverage_sol_criteria = CASE
    WHEN public.broker_attorneys.coverage_sol_criteria = 'no_criteria' THEN EXCLUDED.coverage_sol_criteria
    ELSE public.broker_attorneys.coverage_sol_criteria
  END,
  coverage_languages = CASE
    WHEN cardinality(public.broker_attorneys.coverage_languages) = 0 THEN EXCLUDED.coverage_languages
    ELSE public.broker_attorneys.coverage_languages
  END;

NOTIFY pgrst, 'reload schema';
