/**
 * Migration 110: MFA support
 *
 * Adds:
 *  1. mfa_grace_until on profiles — tracks 14-day grace period for mandatory-MFA roles
 *  2. mfa_backup_codes table — hashed one-time recovery codes generated on TOTP enrollment
 *
 * Supabase manages TOTP factors natively in auth.mfa_factors.
 * We only need to store the grace period and backup codes ourselves.
 */

-- 1. Grace period column -------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_grace_until timestamptz;

-- 2. Backup codes table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  text        NOT NULL,   -- SHA-256 hex of uppercased code with dash removed
  used_at    timestamptz,            -- NULL = available, non-NULL = already used
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_id_idx
  ON public.mfa_backup_codes (user_id)
  WHERE used_at IS NULL;

-- All access goes through service role in server actions — no user-facing RLS policies needed.
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;
