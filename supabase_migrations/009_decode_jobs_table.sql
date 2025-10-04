/*
  # Add decode_jobs table for async decode processing

  1. New Tables
    - `decode_jobs`
      - `id` (uuid, primary key) - Job identifier
      - `user_id` (uuid, foreign key) - User who requested the decode
      - `media_id` (uuid, nullable) - Reference to media table if applicable
      - `model` (text) - AI model used (gpt-5, gpt-5-mini, gemini-2.5-pro, gemini-2.5-flash)
      - `status` (text) - Job status: queued, running, completed, failed, canceled
      - `attempts` (int) - Number of processing attempts
      - `result_json` (jsonb, nullable) - Final normalized result
      - `error` (text, nullable) - Error message if failed
      - `created_at` (timestamptz) - When job was created
      - `updated_at` (timestamptz) - Last status update

  2. Security
    - Enable RLS on `decode_jobs` table
    - Users can only see their own jobs
    - Service role can manage all jobs

  3. Indexes
    - Index on (status, created_at) for worker queries
    - Index on user_id for user lookups
*/

-- Create decode_jobs table
CREATE TABLE IF NOT EXISTS decode_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id uuid,
  model text NOT NULL CHECK (model IN ('gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
  attempts int NOT NULL DEFAULT 0,
  result_json jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE decode_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own jobs
CREATE POLICY "Users can view own decode jobs"
  ON decode_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own jobs
CREATE POLICY "Users can create own decode jobs"
  ON decode_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_decode_jobs_status_created
  ON decode_jobs(status, created_at)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_decode_jobs_user_id
  ON decode_jobs(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_decode_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER decode_jobs_updated_at
  BEFORE UPDATE ON decode_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_decode_jobs_updated_at();
