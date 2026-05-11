-- New events should have the schedule hidden from players by default.
-- Change the column default from true → false so freshly created leagues
-- start in draft mode. Existing leagues are unaffected (their stored value
-- is already true, which preserves the current published behaviour).

ALTER TABLE public.leagues
  ALTER COLUMN schedule_published SET DEFAULT false;
