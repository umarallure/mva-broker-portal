-- Broker profile data, parallel to attorney_profiles. Auto-provisioned by trigger
-- whenever an app_user receives role='broker'. Schema is intentionally minimal so
-- the broker portal can ship today and grow the table later without churn.

-- Helper used across broker RLS policies.
CREATE OR REPLACE FUNCTION public.current_user_is_broker()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE user_id = auth.uid()
      AND role = 'broker'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_broker() TO authenticated;

CREATE TABLE IF NOT EXISTS public.broker_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  company_name text,
  bio text,
  years_in_business integer,
  languages text[] NOT NULL DEFAULT '{}'::text[],
  primary_email text,
  personal_email text,
  direct_phone text,
  office_address text,
  website_url text,
  preferred_contact text CHECK (preferred_contact IN ('email', 'phone', 'text')),
  assistant_name text,
  assistant_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_profiles_company_name
  ON public.broker_profiles(company_name);

DROP TRIGGER IF EXISTS broker_profiles_set_updated_at ON public.broker_profiles;

CREATE TRIGGER broker_profiles_set_updated_at
  BEFORE UPDATE ON public.broker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Auto-create the broker_profile row when an app_user gets role='broker'.
-- Mirrors public.ensure_attorney_profile_for_lawyer for the lawyer role.
CREATE OR REPLACE FUNCTION public.ensure_broker_profile_for_broker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'broker' THEN
    INSERT INTO public.broker_profiles (user_id, full_name, primary_email)
    VALUES (NEW.user_id, NEW.display_name, NEW.email)
    ON CONFLICT (user_id) DO UPDATE
    SET
      full_name = COALESCE(public.broker_profiles.full_name, EXCLUDED.full_name),
      primary_email = COALESCE(public.broker_profiles.primary_email, EXCLUDED.primary_email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_ensure_broker_profile ON public.app_users;

CREATE TRIGGER app_users_ensure_broker_profile
  AFTER INSERT OR UPDATE OF role, email, display_name ON public.app_users
  FOR EACH ROW
  WHEN (NEW.role = 'broker')
  EXECUTE FUNCTION public.ensure_broker_profile_for_broker();

-- Backfill any pre-existing brokers (no-op until the role is assigned).
INSERT INTO public.broker_profiles (user_id, full_name, primary_email)
SELECT user_id, display_name, email
FROM public.app_users
WHERE role = 'broker'
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.broker_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_profiles_admin_all ON public.broker_profiles;
DROP POLICY IF EXISTS broker_profiles_self_all ON public.broker_profiles;

CREATE POLICY broker_profiles_admin_all
  ON public.broker_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY broker_profiles_self_all
  ON public.broker_profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.broker_profiles IS
  'Broker-side profile data. One row per app_user with role=broker, auto-created by trigger.';

NOTIFY pgrst, 'reload schema';
