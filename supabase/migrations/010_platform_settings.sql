-- Platform-wide settings (key/value store for super admin toggles)
create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table public.platform_settings enable row level security;

-- Only service role can read/write platform settings
drop policy if exists "Service role full access" on public.platform_settings;
create policy "Service role full access" on public.platform_settings
  for all to service_role using (true) with check (true);

-- Seed default: signups enabled
insert into public.platform_settings (key, value)
values ('signups_enabled', 'true')
on conflict (key) do nothing;
