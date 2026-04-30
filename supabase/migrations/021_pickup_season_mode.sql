-- Allow pickup events to opt into season-wide registration + payment
-- instead of the default per-session join model.
alter table public.leagues
  add column if not exists registration_mode text not null default 'session'
    check (registration_mode in ('session', 'season'));
