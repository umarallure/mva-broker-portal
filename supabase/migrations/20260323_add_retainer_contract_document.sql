alter table public.attorney_profiles
  add column if not exists retainer_contract_document_path text null,
  add column if not exists retainer_contract_document_name text null,
  add column if not exists retainer_contract_document_mime_type text null,
  add column if not exists retainer_contract_document_size_bytes integer null,
  add column if not exists retainer_contract_document_uploaded_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ap_retainer_contract_document_consistency'
  ) then
    alter table public.attorney_profiles
      add constraint ap_retainer_contract_document_consistency
      check (
        (
          retainer_contract_document_path is null
          and retainer_contract_document_name is null
          and retainer_contract_document_mime_type is null
          and retainer_contract_document_size_bytes is null
          and retainer_contract_document_uploaded_at is null
        )
        or (
          retainer_contract_document_path is not null
          and retainer_contract_document_name is not null
          and retainer_contract_document_mime_type is not null
          and retainer_contract_document_size_bytes is not null
          and retainer_contract_document_size_bytes > 0
          and retainer_contract_document_uploaded_at is not null
        )
      );
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'retainer-contract-documents',
  'retainer-contract-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists retainer_contract_documents_select on storage.objects;
drop policy if exists retainer_contract_documents_insert on storage.objects;
drop policy if exists retainer_contract_documents_update on storage.objects;
drop policy if exists retainer_contract_documents_delete on storage.objects;

create policy retainer_contract_documents_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'retainer-contract-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.app_users
        where app_users.user_id = auth.uid()
          and app_users.role in ('super_admin', 'admin')
      )
    )
  );

create policy retainer_contract_documents_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'retainer-contract-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.app_users
        where app_users.user_id = auth.uid()
          and app_users.role in ('super_admin', 'admin')
      )
    )
  );

create policy retainer_contract_documents_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'retainer-contract-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.app_users
        where app_users.user_id = auth.uid()
          and app_users.role in ('super_admin', 'admin')
      )
    )
  )
  with check (
    bucket_id = 'retainer-contract-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.app_users
        where app_users.user_id = auth.uid()
          and app_users.role in ('super_admin', 'admin')
      )
    )
  );

create policy retainer_contract_documents_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'retainer-contract-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.app_users
        where app_users.user_id = auth.uid()
          and app_users.role in ('super_admin', 'admin')
      )
    )
  );

notify pgrst, 'reload schema';
