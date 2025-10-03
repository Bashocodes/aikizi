/*
  # Decodes and Audit Schema

  This migration creates tables for image decoding results and audit logging.

  1. New Tables
    - `decodes` - Stores results from image analysis/decoding operations
    - `audit_logs` - System audit logs for admin tracking

  2. Security
    - Enable RLS on all tables
    - Users can only read their own decodes
    - Only admins can read audit logs

  3. Indexes
    - Index on decodes.user_id for user history lookups
    - Index on audit_logs.actor_id for actor history lookups
*/

-- Create decodes table
CREATE TABLE IF NOT EXISTS decodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  input_media_id uuid REFERENCES media_assets(id),
  model text NOT NULL,
  raw_json jsonb NOT NULL,
  normalized_json jsonb NOT NULL,
  cost_tokens int NOT NULL,
  private boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_decodes_user_id ON decodes(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);

-- Enable RLS
ALTER TABLE decodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Decodes policies
DROP POLICY IF EXISTS "Users can read own decodes" ON decodes;
CREATE POLICY "Users can read own decodes"
  ON decodes FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Audit logs policies
DROP POLICY IF EXISTS "Admins can read all audit logs" ON audit_logs;
CREATE POLICY "Admins can read all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin'));
