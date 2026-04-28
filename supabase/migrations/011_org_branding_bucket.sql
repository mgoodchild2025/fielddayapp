-- Storage bucket for org branding images (logos, hero images, etc.)
-- Writes go through server actions using the service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-branding',
  'org-branding',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Public read
drop policy if exists "org_branding_public_read" on storage.objects;
create policy "org_branding_public_read"
  on storage.objects for select
  using (bucket_id = 'org-branding');

-- Service role writes
drop policy if exists "org_branding_service_insert" on storage.objects;
create policy "org_branding_service_insert"
  on storage.objects for insert
  with check (bucket_id = 'org-branding' and auth.role() = 'service_role');

drop policy if exists "org_branding_service_update" on storage.objects;
create policy "org_branding_service_update"
  on storage.objects for update
  using (bucket_id = 'org-branding' and auth.role() = 'service_role');

drop policy if exists "org_branding_service_delete" on storage.objects;
create policy "org_branding_service_delete"
  on storage.objects for delete
  using (bucket_id = 'org-branding' and auth.role() = 'service_role');
