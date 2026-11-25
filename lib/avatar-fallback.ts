/**
 * A player's bio (card) photo stands in for their profile photo when they
 * haven't set one: `uploadBioPhoto` writes it through to `profiles.avatar_url`
 * when the profile has no photo, or when the photo it has is an earlier copy
 * of the bio photo (same `<userId>/bio.*` file in the player-avatars bucket).
 * A photo the player uploaded as their profile photo (`<userId>/avatar.*`)
 * is never replaced. Pure and tested (avatar-fallback.test.ts).
 */
export function bioPhotoMayReplaceAvatar(currentAvatar: string | null | undefined, userId: string): boolean {
  const current = currentAvatar?.trim()
  if (!current) return true
  return isBioPhotoUrl(current, userId)
}

/** The player's own bio photo in our storage (`…/player-avatars/<userId>/bio.<ext>[?…]`). */
export function isBioPhotoUrl(url: string, userId: string): boolean {
  try {
    const path = new URL(url).pathname
    return path.includes(`/player-avatars/${userId}/bio.`)
  } catch {
    return false
  }
}
