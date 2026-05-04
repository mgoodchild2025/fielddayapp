-- Event metadata: days of week, skill level, and officiated status
-- All columns nullable so existing events are unaffected.

alter table public.leagues
  add column if not exists days_of_week  text[]
    check (
      days_of_week is null or
      days_of_week <@ array['mon','tue','wed','thu','fri','sat','sun']
    ),
  add column if not exists skill_level   text
    check (skill_level in ('recreational','intermediate','competitive')),
  add column if not exists officiated    text
    check (officiated in ('self_officiated','referee'));

comment on column public.leagues.days_of_week is
  'Days this event runs. Informational metadata — does not auto-generate schedule.';
comment on column public.leagues.skill_level is
  'recreational | intermediate | competitive';
comment on column public.leagues.officiated is
  'self_officiated | referee';
