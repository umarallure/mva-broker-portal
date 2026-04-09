-- Add unique constraint on attorney_id to enforce one general coverage per attorney
-- and to support upsert via ON CONFLICT
alter table public.general_coverages
  add constraint general_coverages_attorney_id_key unique (attorney_id);
