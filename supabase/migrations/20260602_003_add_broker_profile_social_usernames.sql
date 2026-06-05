-- Add optional social profile usernames to broker public profiles.
ALTER TABLE public.broker_profiles
  ADD COLUMN IF NOT EXISTS linkedin_username text,
  ADD COLUMN IF NOT EXISTS instagram_username text,
  ADD COLUMN IF NOT EXISTS facebook_username text;

NOTIFY pgrst, 'reload schema';
