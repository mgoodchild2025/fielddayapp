-- Birthday shout-outs: an OPTIONAL month and day (no year — the app stopped
-- storing birthdates in 101, and a shout-out doesn't need an age). Set by the
-- player on their profile; null = not shared.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday_month smallint,
  ADD COLUMN IF NOT EXISTS birthday_day smallint;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_birthday_valid;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_birthday_valid CHECK (
  (birthday_month IS NULL AND birthday_day IS NULL)
  OR (
    birthday_month BETWEEN 1 AND 12
    AND birthday_day BETWEEN 1 AND
      CASE WHEN birthday_month = 2 THEN 29
           WHEN birthday_month IN (4, 6, 9, 11) THEN 30
           ELSE 31 END
  )
);
