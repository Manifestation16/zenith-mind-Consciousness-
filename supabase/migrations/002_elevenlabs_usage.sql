-- ============================================================
-- ZENITH MIND — ElevenLabs Usage Logging & Rate Limiting
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. USAGE LOGS TABLE (audit trail + rate limit source)
CREATE TABLE IF NOT EXISTS elevenlabs_usage (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL CHECK (endpoint IN ('sound-generation', 'text-to-speech')),
  status     INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE elevenlabs_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage (for quota display)
CREATE POLICY "Users read own usage"
  ON elevenlabs_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role (Edge Function) can insert
-- No INSERT policy for anon/authenticated — writes happen server-side only

-- Fast lookup: user's recent requests
CREATE INDEX IF NOT EXISTS el_usage_user_time_idx
  ON elevenlabs_usage(user_id, created_at DESC);

-- Note: A partial index with NOW() is not allowed (immutable requirement).
-- The composite index above (user_id, created_at DESC) handles rate-limit
-- queries efficiently — PostgreSQL scans only the user's rows and stops
-- after crossing the 1-hour boundary.


-- 2. RATE LIMITS TABLE (configurable per tier)
CREATE TABLE IF NOT EXISTS rate_limits (
  tier       TEXT PRIMARY KEY,
  hourly_max INTEGER NOT NULL,
  daily_max  INTEGER NOT NULL
);

-- Seed default limits
INSERT INTO rate_limits (tier, hourly_max, daily_max) VALUES
  ('free',           30,   200),
  ('transcendence', 100,  1000),
  ('illumination',  300,  5000)
ON CONFLICT (tier) DO UPDATE SET
  hourly_max = EXCLUDED.hourly_max,
  daily_max  = EXCLUDED.daily_max;


-- 3. Add index on profiles.tier for fast joins in the Edge Function
CREATE INDEX IF NOT EXISTS profiles_tier_idx
  ON profiles(tier);
