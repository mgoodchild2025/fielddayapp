-- Org-owned Stripe API keys (Option B: each org uses their own Stripe account)
create table if not exists public.org_payment_settings (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  stripe_secret_key     text,
  stripe_webhook_secret text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id)
);

alter table public.org_payment_settings enable row level security;

drop policy if exists "Org admins manage payment settings" on public.org_payment_settings;
create policy "Org admins manage payment settings" on public.org_payment_settings
  for all
  using (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = org_payment_settings.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );
