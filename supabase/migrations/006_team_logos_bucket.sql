-- Create a public storage bucket for team logos.
-- Uploads are done via the service role (server-side), reads are public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-logos',
  'team-logos',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Public read
create policy "team_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'team-logos');

-- Service role can insert / update / delete (all writes go through server actions)
create policy "team_logos_service_write"
  on storage.objects for insert
  with check (bucket_id = 'team-logos' and auth.role() = 'service_role');

create policy "team_logos_service_update"
  on storage.objects for update
  using (bucket_id = 'team-logos' and auth.role() = 'service_role');

create policy "team_logos_service_delete"
  on storage.objects for delete
  using (bucket_id = 'team-logos' and auth.role() = 'service_role');
