-- Team members table: allows attorneys to manage their firm staff
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  position text not null check (position in ('accounting', 'marketing', 'invoicing', 'intake_team', 'other')),
  position_other text,
  constraint team_members_position_other_valid check (
    (position = 'other' and nullif(btrim(position_other), '') is not null)
    or (position <> 'other' and position_other is null)
  ),
  shift_availability text not null default 'full_day' check (shift_availability in ('morning', 'afternoon', 'evening', 'full_day')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookups by attorney
create index if not exists idx_team_members_lawyer_id_created_at on public.team_members(lawyer_id, created_at);

-- RLS policies
alter table public.team_members enable row level security;

drop policy if exists "Admins and super_admins have full access to team_members" on public.team_members;
drop policy if exists "Lawyers can manage their own team members" on public.team_members;
drop policy if exists team_members_admin_all on public.team_members;
drop policy if exists team_members_lawyer_all on public.team_members;

create policy team_members_admin_all
  on public.team_members for all
  using (
    exists (
      select 1 from public.app_users
      where app_users.user_id = auth.uid()
      and app_users.role in ('super_admin', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.app_users
      where app_users.user_id = auth.uid()
      and app_users.role in ('super_admin', 'admin')
    )
  );

create policy team_members_lawyer_all
  on public.team_members for all
  using (
    lawyer_id = auth.uid()
    and exists (
      select 1 from public.app_users
      where app_users.user_id = auth.uid()
      and app_users.role = 'lawyer'
    )
  )
  with check (
    lawyer_id = auth.uid()
    and exists (
      select 1 from public.app_users
      where app_users.user_id = auth.uid()
      and app_users.role = 'lawyer'
    )
  );

-- Auto-update updated_at on row change
create or replace function public.update_team_members_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_team_members_updated_at on public.team_members;

create trigger trg_team_members_updated_at
  before update on public.team_members
  for each row execute function public.update_team_members_updated_at();

notify pgrst, 'reload schema';
