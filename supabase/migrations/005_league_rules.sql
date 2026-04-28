-- ── League rule templates ────────────────────────────────────────────────────
-- Reusable rule sets (e.g. Beach Volleyball, Court Volleyball) that can be
-- selected per league. Selecting a template pre-fills the league's editable
-- rules_content; the content is then stored per-league so admins can
-- customise without altering the shared template.

create table if not exists public.league_rule_templates (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  title           text        not null,
  content         text        not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists league_rule_templates_org_idx
  on public.league_rule_templates(organization_id);

alter table public.league_rule_templates enable row level security;

create policy "rule_templates_read" on public.league_rule_templates
  for select using (organization_id = current_org_id());

create policy "rule_templates_admin_write" on public.league_rule_templates
  for all using (
    organization_id = current_org_id()
    and exists (
      select 1 from public.org_members
      where org_members.organization_id = current_org_id()
        and org_members.user_id = auth.uid()
        and org_members.role in ('org_admin', 'league_admin')
    )
  );

create policy "rule_templates_service_all" on public.league_rule_templates
  for all using (auth.role() = 'service_role');

-- ── Add rules columns to leagues ─────────────────────────────────────────────

alter table public.leagues
  add column if not exists rule_template_id uuid
    references public.league_rule_templates(id) on delete set null,
  add column if not exists rules_content text;
