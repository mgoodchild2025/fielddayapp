-- 155_sms_transactional_default_on.sql
-- Transactional SMS (game reminders, RSVP alerts, schedule changes) should be
-- ON by default with an opt-out, not opt-in. sms_opted_in previously defaulted
-- to false, which silently suppressed transactional SMS for everyone who didn't
-- manually tick the box. Flip the default and enable it for existing players.
--
-- Commercial SMS is unaffected: it is gated separately by the player_consents
-- 'marketing_sms' record (default off, explicit opt-in), so flipping this does
-- NOT start sending promotional messages. STOP replies still set sms_opted_in
-- to false (see app/api/sms/inbound), preserving the opt-out path.

ALTER TABLE public.profiles ALTER COLUMN sms_opted_in SET DEFAULT true;

UPDATE public.profiles SET sms_opted_in = true WHERE sms_opted_in IS NOT TRUE;
