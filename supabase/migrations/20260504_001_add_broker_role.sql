-- Adds 'broker' to the allowed values of app_users.role.
-- Must run before any later migration that references the broker role.

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check CHECK (
    role IS NULL
    OR role = ANY (ARRAY[
      'super_admin',
      'admin',
      'lawyer',
      'agent',
      'accounts',
      'publisher_admin',
      'publisher_closer',
      'broker'
    ])
  );

NOTIFY pgrst, 'reload schema';
