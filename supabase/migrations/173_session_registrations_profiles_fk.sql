-- Re-point session_registrations.user_id at public.profiles.
--
-- It referenced auth.users, which PostgREST cannot traverse for embeds — so
-- `profile:profiles!session_registrations_user_id_fkey(full_name)` (admin
-- check-in page, old join-button flow) errored at runtime and the list came
-- back empty. registrations.user_id already points at profiles; this brings
-- session_registrations in line. profiles.id = auth.users.id (1:1) and
-- cascades from auth.users through profiles, so delete semantics are kept.

ALTER TABLE public.session_registrations
  DROP CONSTRAINT IF EXISTS session_registrations_user_id_fkey;

ALTER TABLE public.session_registrations
  ADD CONSTRAINT session_registrations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
