-- Add five new feature flags introduced after the initial plan_configs seed.
--
-- merchandise_shop  — standalone shop (not tied to registration); Pro+
-- game_substitutes  — captains invite game subs via email link; all plans
-- custom_nav_links  — up to 5 custom links in public nav; all plans
-- player_check_in   — QR-code check-in system for events/drop-ins; Pro+
-- media_gallery     — photo gallery + YouTube/Instagram media page; Pro+
--
-- Uses ON CONFLICT DO UPDATE so re-running is safe and corrects any
-- accidental wrong values from earlier manual inserts.

INSERT INTO public.plan_configs (tier, feature, enabled, limit_value) VALUES
-- ── Starter ───────────────────────────────────────────────────────────────────
('starter', 'merchandise_shop', false, null),
('starter', 'game_substitutes', true,  null),
('starter', 'custom_nav_links', true,  null),
('starter', 'player_check_in',  false, null),
('starter', 'media_gallery',    false, null),

-- ── Pro ───────────────────────────────────────────────────────────────────────
('pro', 'merchandise_shop', true,  null),
('pro', 'game_substitutes', true,  null),
('pro', 'custom_nav_links', true,  null),
('pro', 'player_check_in',  true,  null),
('pro', 'media_gallery',    true,  null),

-- ── Club ──────────────────────────────────────────────────────────────────────
('club', 'merchandise_shop', true,  null),
('club', 'game_substitutes', true,  null),
('club', 'custom_nav_links', true,  null),
('club', 'player_check_in',  true,  null),
('club', 'media_gallery',    true,  null),

-- ── Internal ──────────────────────────────────────────────────────────────────
('internal', 'merchandise_shop', true,  null),
('internal', 'game_substitutes', true,  null),
('internal', 'custom_nav_links', true,  null),
('internal', 'player_check_in',  true,  null),
('internal', 'media_gallery',    true,  null)

ON CONFLICT (tier, feature) DO UPDATE
  SET enabled     = EXCLUDED.enabled,
      limit_value = EXCLUDED.limit_value,
      updated_at  = now();
