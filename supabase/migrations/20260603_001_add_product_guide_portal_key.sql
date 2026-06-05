-- Product Guide: scope shared sections/topics by portal.
--
-- The broker and lawyer portals share one Supabase project, so they share the
-- product_guide_sections / product_guide_topics tables. Add a portal_key so each
-- portal manages its own guide independently. Existing rows belong to the lawyer
-- portal (the default), which keeps the lawyer portal's current inserts correct
-- without code changes; per-portal filtering happens in each app's lib layer.

alter table public.product_guide_sections
  add column if not exists portal_key text not null default 'lawyer';

alter table public.product_guide_topics
  add column if not exists portal_key text not null default 'lawyer';

-- guide_key uniqueness must be per-portal so both portals can reuse the same
-- key namespace (e.g. each can have a 'dashboard' section).
drop index if exists idx_product_guide_sections_guide_key;
drop index if exists idx_product_guide_topics_guide_key;

create unique index if not exists idx_product_guide_sections_portal_guide_key
  on public.product_guide_sections(portal_key, guide_key)
  where guide_key is not null;

create unique index if not exists idx_product_guide_topics_portal_guide_key
  on public.product_guide_topics(portal_key, guide_key)
  where guide_key is not null;

create index if not exists idx_product_guide_sections_portal
  on public.product_guide_sections(portal_key);

create index if not exists idx_product_guide_topics_portal
  on public.product_guide_topics(portal_key);

notify pgrst, 'reload schema';
