-- Create general_coverages table for attorney general coverage preferences
create table public.general_coverages (
  id uuid not null default gen_random_uuid(),
  attorney_id uuid not null,
  covered_states text[] not null default '{}',
  case_category text not null default 'Consumer Cases',
  injury_severity text[] not null default '{}',
  liability_status text not null default 'clear_only',
  insurance_status text not null default 'insured_only',
  medical_treatment text not null default 'ongoing',
  languages text[] not null default '{English}',
  no_prior_attorney boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint general_coverages_pkey primary key (id),
  constraint general_coverages_attorney_id_key unique (attorney_id),
  constraint general_coverages_attorney_id_fkey foreign key (attorney_id) references public.attorney_profiles (user_id) on delete cascade,
  constraint general_coverages_case_category_check check (case_category = 'Consumer Cases'),
  constraint general_coverages_liability_status_check check (
    liability_status = any (array['clear_only', 'disputed_ok'])
  ),
  constraint general_coverages_insurance_status_check check (
    insurance_status = any (array['insured_only', 'uninsured_ok'])
  ),
  constraint general_coverages_medical_treatment_check check (
    medical_treatment = any (array['no_medical', 'ongoing', 'proof_of_medical_treatment'])
  )
);

-- Indexes
create index idx_general_coverages_attorney_id on public.general_coverages using btree (attorney_id);
create index idx_general_coverages_covered_states on public.general_coverages using gin (covered_states);

-- Auto-update updated_at trigger
create or replace function update_general_coverages_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger general_coverages_updated_at
  before update on public.general_coverages
  for each row
  execute function update_general_coverages_updated_at();

-- Enable RLS
alter table public.general_coverages enable row level security;

-- RLS policies: attorneys can manage their own general coverages
create policy "Attorneys can view own general coverages"
  on public.general_coverages for select
  using (attorney_id = auth.uid());

create policy "Attorneys can insert own general coverages"
  on public.general_coverages for insert
  with check (attorney_id = auth.uid());

create policy "Attorneys can update own general coverages"
  on public.general_coverages for update
  using (attorney_id = auth.uid());

create policy "Attorneys can delete own general coverages"
  on public.general_coverages for delete
  using (attorney_id = auth.uid());
