-- =============================================
-- Migration 012: RLS policies for stripe_connect_accounts
-- =============================================

-- Org admins can read their own org's connect account
drop policy if exists "org_admins_read_connect_account" on public.stripe_connect_accounts;
create policy "org_admins_read_connect_account"
  on public.stripe_connect_accounts for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = stripe_connect_accounts.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );

-- Org admins can insert their own org's connect account
drop policy if exists "org_admins_insert_connect_account" on public.stripe_connect_accounts;
create policy "org_admins_insert_connect_account"
  on public.stripe_connect_accounts for insert
  with check (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = stripe_connect_accounts.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role = 'org_admin'
    )
  );

-- Org admins can update their own org's connect account
drop policy if exists "org_admins_update_connect_account" on public.stripe_connect_accounts;
create policy "org_admins_update_connect_account"
  on public.stripe_connect_accounts for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = stripe_connect_accounts.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role = 'org_admin'
    )
  );

-- Org admins can delete (disconnect) their own org's connect account
drop policy if exists "org_admins_delete_connect_account" on public.stripe_connect_accounts;
create policy "org_admins_delete_connect_account"
  on public.stripe_connect_accounts for delete
  using (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = stripe_connect_accounts.organization_id
        and org_members.user_id = auth.uid()
        and org_members.role = 'org_admin'
    )
  );
