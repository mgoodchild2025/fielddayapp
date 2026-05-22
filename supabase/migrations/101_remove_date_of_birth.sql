-- Remove date_of_birth from player_details.
-- Birthdates are no longer stored; age eligibility is determined at
-- the point of use (waiver signing) via a self-declared age question.
ALTER TABLE public.player_details DROP COLUMN IF EXISTS date_of_birth;
