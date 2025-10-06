/*
  # Token Refresh System

  This migration creates the infrastructure for monthly token refresh.
  Uses idempotency keys to prevent duplicate grants.

  1. New Tables
    - `token_refresh_log` - Tracks monthly token grants with idempotency
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `period_key` (text, format: YYYYMM, e.g., "202501")
      - `tokens_granted` (int)
      - `created_at` (timestamptz)
      - Unique constraint on (user_id, period_key) for idempotency

  2. New Functions
    - `refresh_monthly_tokens()` - Grants monthly tokens to eligible users
      - Checks if renews_at date has passed
      - Grants tokens based on plan (1000 for free, 10000 for pro)
      - Updates renews_at to same day next month
      - Logs grant in transactions and token_refresh_log
      - Uses period_key for idempotency (e.g., "202501" for January 2025)
      - Returns number of users who received tokens

  3. Security
    - RLS enabled on token_refresh_log table
    - Users can read their own refresh history
    - Only system can insert refresh logs
    - Function uses SECURITY DEFINER to bypass RLS
*/

-- Create token_refresh_log table
CREATE TABLE IF NOT EXISTS token_refresh_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  tokens_granted int NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add unique constraint for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_refresh_log_user_period
ON token_refresh_log(user_id, period_key);

-- Add index for user lookups
CREATE INDEX IF NOT EXISTS idx_token_refresh_log_user_id
ON token_refresh_log(user_id);

-- Enable RLS
ALTER TABLE token_refresh_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own refresh history
DROP POLICY IF EXISTS "Users can read own refresh log" ON token_refresh_log;
CREATE POLICY "Users can read own refresh log"
  ON token_refresh_log FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Create RPC function for monthly token refresh
CREATE OR REPLACE FUNCTION public.refresh_monthly_tokens()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  processed_count int := 0;
  user_record RECORD;
  tokens_to_grant int;
  current_period text;
BEGIN
  -- Generate period key in YYYYMM format
  current_period := to_char(now(), 'YYYYMM');

  -- Loop through all users whose renews_at date has passed
  FOR user_record IN
    SELECT
      e.user_id,
      e.plan_id,
      e.tokens_balance,
      e.renews_at,
      p.name as plan_name,
      p.tokens_granted
    FROM entitlements e
    JOIN plans p ON p.id = e.plan_id
    WHERE e.renews_at IS NOT NULL
      AND e.renews_at <= now()
  LOOP
    -- Determine tokens to grant based on plan
    tokens_to_grant := user_record.tokens_granted;

    -- Check if already granted for this period (idempotency)
    IF NOT EXISTS (
      SELECT 1 FROM token_refresh_log
      WHERE user_id = user_record.user_id
        AND period_key = current_period
    ) THEN
      -- Grant tokens
      UPDATE entitlements
      SET
        tokens_balance = tokens_balance + tokens_to_grant,
        renews_at = renews_at + interval '1 month',
        updated_at = now()
      WHERE user_id = user_record.user_id;

      -- Log transaction
      INSERT INTO transactions (user_id, kind, amount, ref)
      VALUES (
        user_record.user_id,
        'monthly_grant',
        tokens_to_grant,
        jsonb_build_object(
          'period', current_period,
          'plan', user_record.plan_name,
          'renews_at', user_record.renews_at + interval '1 month'
        )
      );

      -- Log in refresh log for idempotency
      INSERT INTO token_refresh_log (user_id, period_key, tokens_granted)
      VALUES (user_record.user_id, current_period, tokens_to_grant);

      processed_count := processed_count + 1;
    END IF;
  END LOOP;

  RETURN processed_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.refresh_monthly_tokens() TO authenticated;
