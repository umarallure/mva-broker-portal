-- Product Guide: dynamic sections and topics managed by admin/super_admin

create table if not exists public.product_guide_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (nullif(btrim(title), '') is not null),
  icon text not null default 'i-lucide-book-open',
  sort_order int not null default 0,
  created_by uuid references public.app_users(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_guide_topics (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.product_guide_sections(id) on delete cascade,
  title text not null check (nullif(btrim(title), '') is not null),
  overview text not null check (nullif(btrim(overview), '') is not null),
  description text,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  sort_order int not null default 0,
  created_by uuid references public.app_users(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_guide_topics_media_consistency check (
    (media_url is null and media_type is null)
    or (media_url is not null and media_type in ('image', 'video'))
  )
);

create index if not exists idx_product_guide_topics_section
  on public.product_guide_topics(section_id);

create index if not exists idx_product_guide_sections_sort
  on public.product_guide_sections(sort_order);

create index if not exists idx_product_guide_topics_sort
  on public.product_guide_topics(sort_order);

alter table public.product_guide_sections enable row level security;
alter table public.product_guide_topics enable row level security;

drop policy if exists product_guide_sections_select on public.product_guide_sections;
drop policy if exists product_guide_sections_insert on public.product_guide_sections;
drop policy if exists product_guide_sections_update on public.product_guide_sections;
drop policy if exists product_guide_sections_delete on public.product_guide_sections;

drop policy if exists product_guide_topics_select on public.product_guide_topics;
drop policy if exists product_guide_topics_insert on public.product_guide_topics;
drop policy if exists product_guide_topics_update on public.product_guide_topics;
drop policy if exists product_guide_topics_delete on public.product_guide_topics;

create policy product_guide_sections_select
  on public.product_guide_sections for select
  to authenticated
  using (true);

create policy product_guide_topics_select
  on public.product_guide_topics for select
  to authenticated
  using (true);

create policy product_guide_sections_insert
  on public.product_guide_sections for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create policy product_guide_sections_update
  on public.product_guide_sections for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create policy product_guide_sections_delete
  on public.product_guide_sections for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create policy product_guide_topics_insert
  on public.product_guide_topics for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create policy product_guide_topics_update
  on public.product_guide_topics for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create policy product_guide_topics_delete
  on public.product_guide_topics for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-guide-media',
  'product-guide-media',
  true,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_guide_media_select on storage.objects;
drop policy if exists product_guide_media_insert on storage.objects;
drop policy if exists product_guide_media_update on storage.objects;
drop policy if exists product_guide_media_delete on storage.objects;

create policy product_guide_media_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-guide-media');

create policy product_guide_media_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-guide-media'
    and exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create policy product_guide_media_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-guide-media'
    and exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'product-guide-media'
    and exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create policy product_guide_media_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-guide-media'
    and exists (
      select 1
      from public.app_users
      where app_users.user_id = auth.uid()
        and app_users.role in ('admin', 'super_admin')
    )
  );

create or replace function public.update_product_guide_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_product_guide_sections_updated_at on public.product_guide_sections;
drop trigger if exists trg_product_guide_topics_updated_at on public.product_guide_topics;

create trigger trg_product_guide_sections_updated_at
  before update on public.product_guide_sections
  for each row execute function public.update_product_guide_updated_at();

create trigger trg_product_guide_topics_updated_at
  before update on public.product_guide_topics
  for each row execute function public.update_product_guide_updated_at();

notify pgrst, 'reload schema';
