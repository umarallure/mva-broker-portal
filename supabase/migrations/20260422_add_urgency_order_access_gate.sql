-- Gate Urgency Order creation behind an explicit attorney permission.
-- Existing attorney profiles keep access; new profiles default to locked.
alter table public.attorney_profiles
  add column if not exists urgency_orders_enabled boolean;

update public.attorney_profiles
set urgency_orders_enabled = true
where urgency_orders_enabled is null;

alter table public.attorney_profiles
  alter column urgency_orders_enabled set default false;

alter table public.attorney_profiles
  alter column urgency_orders_enabled set not null;

create or replace function public.enforce_urgency_orders_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.attorney_profiles
    where user_id = new.lawyer_id
      and urgency_orders_enabled = true
  ) then
    raise exception
      'This account does not have permission to create urgency orders yet. Contact your account manager if you have any questions.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_enforce_urgency_orders_enabled on public.orders;

create trigger orders_enforce_urgency_orders_enabled
  before insert on public.orders
  for each row
  execute function public.enforce_urgency_orders_enabled();
