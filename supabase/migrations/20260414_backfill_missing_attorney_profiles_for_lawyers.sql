-- Ensure lawyer app_users always have a matching attorney_profiles row,
-- regardless of whether the write came from a Vercel API route, a Supabase
-- Edge Function, or a manual SQL operation.
create or replace function public.ensure_attorney_profile_for_lawyer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.attorney_profiles (
    user_id,
    full_name,
    primary_email
  )
  values (
    new.user_id,
    nullif(trim(coalesce(new.display_name, '')), ''),
    nullif(lower(trim(coalesce(new.email, ''))), '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists app_users_ensure_attorney_profile on public.app_users;

create trigger app_users_ensure_attorney_profile
  after insert or update of role, email, display_name
  on public.app_users
  for each row
  when (new.role = 'lawyer')
  execute function public.ensure_attorney_profile_for_lawyer();

-- Backfill attorney_profiles rows for lawyer accounts that predate
-- automatic profile creation.
insert into public.attorney_profiles (
  user_id,
  full_name,
  primary_email
)
select
  app_users.user_id,
  nullif(trim(app_users.display_name), ''),
  nullif(lower(trim(app_users.email)), '')
from public.app_users
left join public.attorney_profiles
  on attorney_profiles.user_id = app_users.user_id
where app_users.role = 'lawyer'
  and attorney_profiles.user_id is null
on conflict (user_id) do nothing;
