/*
  # Add renews_at Column to Entitlements

  This migration adds token renewal tracking to the entitlements table.
  This enables monthly token refresh functionality.

  1. Changes
    - Add `renews_at` column to track when next token grant is due
    - Set default to first day of next month for new records
    - Backfill existing records with calculated renewal dates
    - Add index for efficient cron job queries

  2. Token Refresh Logic
    - Free plan users get 1000 tokens monthly
    - Pro plan users get 10000 tokens monthly
    - Tokens refresh on same day each month (e.g., joined Jan 15 → refreshes 15th of each month)
    - Cron job runs daily to check and grant tokens to eligible users

  3. Security
    - RLS policies already exist for entitlements table
    - renews_at is read-only for users, managed by system
*/

-- Add renews_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entitlements' AND column_name = 'renews_at'
  ) THEN
    ALTER TABLE entitlements ADD COLUMN renews_at timestamptz;
  END IF;
END $$;

-- Backfill existing records: set renews_at to first day of next month based on created_at
UPDATE entitlements
SET renews_at = date_trunc('month', created_at) + interval '1 month'
WHERE renews_at IS NULL;

-- Set default for new records: first day of next month
ALTER TABLE entitlements
ALTER COLUMN renews_at SET DEFAULT (date_trunc('month', now()) + interval '1 month');

-- Create index for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_entitlements_renews_at ON entitlements(renews_at)
WHERE renews_at IS NOT NULL;
