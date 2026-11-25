-- Players who added a card (bio) photo but never a profile photo: use the
-- card photo as their profile photo. New uploads do this in uploadBioPhoto
-- (lib/avatar-fallback.ts); this fills in everyone from before. Only empty
-- profile photos are touched. A player with cards in several orgs gets the
-- most recently updated card photo.
UPDATE public.profiles p
SET avatar_url = b.hero_photo_url
FROM (
  SELECT DISTINCT ON (user_id) user_id, hero_photo_url
  FROM public.player_bios
  WHERE hero_photo_url IS NOT NULL AND btrim(hero_photo_url) <> ''
  ORDER BY user_id, updated_at DESC NULLS LAST
) b
WHERE p.id = b.user_id
  AND (p.avatar_url IS NULL OR btrim(p.avatar_url) = '');
