create or replace function public.team_member_is_valid_time(value text)
returns boolean
language sql
immutable
as $$
  select value ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
$$;

create or replace function public.team_member_slots_are_valid(slots jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  slot jsonb;
  previous_end text := null;
begin
  if jsonb_typeof(slots) <> 'array' then
    return false;
  end if;

  for slot in select value from jsonb_array_elements(slots)
  loop
    if jsonb_typeof(slot) <> 'object' then
      return false;
    end if;

    if not (slot ? 'start' and slot ? 'end') then
      return false;
    end if;

    if not public.team_member_is_valid_time(slot->>'start')
      or not public.team_member_is_valid_time(slot->>'end')
      or slot->>'start' >= slot->>'end' then
      return false;
    end if;

    if previous_end is not null and slot->>'start' < previous_end then
      return false;
    end if;

    previous_end := slot->>'end';
  end loop;

  return true;
end;
$$;

create or replace function public.team_member_weekly_availability_is_valid(schedule jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  day_key text;
  day_value jsonb;
  enabled boolean;
  has_enabled_day boolean := false;
begin
  if jsonb_typeof(schedule) <> 'object' then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(schedule) as key
    where key not in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  ) then
    return false;
  end if;

  foreach day_key in array array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  loop
    if not (schedule ? day_key) then
      return false;
    end if;

    day_value := schedule -> day_key;
    if jsonb_typeof(day_value) <> 'object' then
      return false;
    end if;

    if jsonb_typeof(day_value->'enabled') is distinct from 'boolean' then
      return false;
    end if;

    if jsonb_typeof(day_value->'slots') is distinct from 'array' then
      return false;
    end if;

    enabled := (day_value->>'enabled')::boolean;

    if enabled then
      has_enabled_day := true;

      if jsonb_array_length(day_value->'slots') = 0 then
        return false;
      end if;

      if not public.team_member_slots_are_valid(day_value->'slots') then
        return false;
      end if;
    elsif jsonb_array_length(day_value->'slots') <> 0 then
      return false;
    end if;
  end loop;

  return has_enabled_day;
end;
$$;

create or replace function public.team_member_holiday_hours_are_valid(overrides jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  entry jsonb;
  holiday_date text;
  is_closed boolean;
  seen_dates text[] := '{}';
begin
  if jsonb_typeof(overrides) <> 'array' then
    return false;
  end if;

  for entry in select value from jsonb_array_elements(overrides)
  loop
    if jsonb_typeof(entry) <> 'object' then
      return false;
    end if;

    holiday_date := coalesce(entry->>'date', '');
    if holiday_date !~ '^\d{4}-\d{2}-\d{2}$' then
      return false;
    end if;

    begin
      perform holiday_date::date;
    exception when others then
      return false;
    end;

    if holiday_date = any(seen_dates) then
      return false;
    end if;

    seen_dates := array_append(seen_dates, holiday_date);

    if entry ? 'label' and jsonb_typeof(entry->'label') not in ('string', 'null') then
      return false;
    end if;

    if jsonb_typeof(entry->'is_closed') is distinct from 'boolean' then
      return false;
    end if;

    if jsonb_typeof(entry->'slots') is distinct from 'array' then
      return false;
    end if;

    is_closed := (entry->>'is_closed')::boolean;

    if is_closed then
      if jsonb_array_length(entry->'slots') <> 0 then
        return false;
      end if;
    else
      if jsonb_array_length(entry->'slots') = 0 then
        return false;
      end if;

      if not public.team_member_slots_are_valid(entry->'slots') then
        return false;
      end if;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.team_member_schedule_from_shift(legacy_shift text)
returns jsonb
language plpgsql
immutable
as $$
declare
  working_slots jsonb;
begin
  working_slots := case coalesce(legacy_shift, 'full_day')
    when 'morning' then jsonb_build_array(jsonb_build_object('start', '08:00', 'end', '12:00'))
    when 'afternoon' then jsonb_build_array(jsonb_build_object('start', '12:00', 'end', '17:00'))
    when 'evening' then jsonb_build_array(jsonb_build_object('start', '17:00', 'end', '20:00'))
    else jsonb_build_array(jsonb_build_object('start', '09:00', 'end', '17:00'))
  end;

  return jsonb_build_object(
    'monday', jsonb_build_object('enabled', true, 'slots', working_slots),
    'tuesday', jsonb_build_object('enabled', true, 'slots', working_slots),
    'wednesday', jsonb_build_object('enabled', true, 'slots', working_slots),
    'thursday', jsonb_build_object('enabled', true, 'slots', working_slots),
    'friday', jsonb_build_object('enabled', true, 'slots', working_slots),
    'saturday', jsonb_build_object('enabled', false, 'slots', '[]'::jsonb),
    'sunday', jsonb_build_object('enabled', false, 'slots', '[]'::jsonb)
  );
end;
$$;

create or replace function public.team_member_legacy_shift_from_schedule(schedule jsonb)
returns text
language plpgsql
immutable
as $$
declare
  day_key text;
  slot jsonb;
  earliest_start text := null;
  latest_end text := null;
begin
  if schedule is null or not public.team_member_weekly_availability_is_valid(schedule) then
    return 'full_day';
  end if;

  foreach day_key in array array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  loop
    for slot in select value from jsonb_array_elements(schedule -> day_key -> 'slots')
    loop
      if earliest_start is null or slot->>'start' < earliest_start then
        earliest_start := slot->>'start';
      end if;

      if latest_end is null or slot->>'end' > latest_end then
        latest_end := slot->>'end';
      end if;
    end loop;
  end loop;

  if earliest_start is null or latest_end is null then
    return 'full_day';
  end if;

  if latest_end <= '12:30' then
    return 'morning';
  end if;

  if earliest_start >= '17:00' then
    return 'evening';
  end if;

  if earliest_start >= '12:00' and latest_end <= '18:30' then
    return 'afternoon';
  end if;

  return 'full_day';
end;
$$;

alter table public.team_members
  add column if not exists weekly_availability jsonb,
  add column if not exists holiday_hours jsonb;

update public.team_members
set weekly_availability = coalesce(weekly_availability, public.team_member_schedule_from_shift(shift_availability)),
    holiday_hours = coalesce(holiday_hours, '[]'::jsonb)
where weekly_availability is null
   or holiday_hours is null;

alter table public.team_members
  alter column weekly_availability set default public.team_member_schedule_from_shift('full_day'),
  alter column weekly_availability set not null,
  alter column holiday_hours set default '[]'::jsonb,
  alter column holiday_hours set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_weekly_availability_valid'
      and conrelid = 'public.team_members'::regclass
  ) then
    alter table public.team_members
      add constraint team_members_weekly_availability_valid
      check (public.team_member_weekly_availability_is_valid(weekly_availability));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_holiday_hours_valid'
      and conrelid = 'public.team_members'::regclass
  ) then
    alter table public.team_members
      add constraint team_members_holiday_hours_valid
      check (public.team_member_holiday_hours_are_valid(holiday_hours));
  end if;
end;
$$;

create or replace function public.update_team_members_updated_at()
returns trigger as $$
begin
  if new.weekly_availability is null then
    new.weekly_availability := public.team_member_schedule_from_shift(coalesce(new.shift_availability, 'full_day'));
  elsif tg_op = 'UPDATE'
    and new.shift_availability is distinct from old.shift_availability
    and new.weekly_availability is not distinct from old.weekly_availability then
    -- Preserve compatibility for callers still updating only the legacy shift field.
    new.weekly_availability := public.team_member_schedule_from_shift(coalesce(new.shift_availability, 'full_day'));
  end if;

  if new.holiday_hours is null then
    new.holiday_hours := '[]'::jsonb;
  end if;

  new.shift_availability := public.team_member_legacy_shift_from_schedule(new.weekly_availability);
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_team_members_updated_at on public.team_members;

create trigger trg_team_members_updated_at
  before insert or update on public.team_members
  for each row execute function public.update_team_members_updated_at();

notify pgrst, 'reload schema';
