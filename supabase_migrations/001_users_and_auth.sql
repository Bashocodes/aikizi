/*
  # Initial User and Authentication Schema

  This migration creates the core user authentication and authorization tables.

  1. New Tables
    - `users` - Core user records linked to auth.users
    - `profiles` - User profile information (handle, display name, avatar, bio)
    - `plans` - Subscription plans (free, pro)
    - `entitlements` - User plan assignments and token balances
    - `transactions` - Token transaction history

  2. Security
    - Enable RLS on all tables
    - Users can read their own data
    - Admins can read all data
    - Public profiles are readable by all authenticated users

  3. Indexes
    - Index on users.auth_id for fast auth lookups
    - Index on profiles.handle for profile page lookups
    - Index on transactions.user_id for transaction history
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz DEFAULT now()
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  bio text,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create plans table
CREATE TABLE IF NOT EXISTS plans (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  tokens_granted int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create entitlements table
CREATE TABLE IF NOT EXISTS entitlements (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id int REFERENCES plans(id),
  tokens_balance int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount int NOT NULL,
  ref jsonb,
  created_at timestamptz DEFAULT now()
);

-- Insert default plans
INSERT INTO plans (name, tokens_granted)
VALUES ('free', 1000), ('pro', 10000)
ON CONFLICT (name) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid()::text = auth_id OR EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin'
  ));

-- Profiles policies
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

DROP POLICY IF EXISTS "Public profiles are readable by all authenticated users" ON profiles;
CREATE POLICY "Public profiles are readable by all authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Plans policies
DROP POLICY IF EXISTS "Plans are readable by all authenticated users" ON plans;
CREATE POLICY "Plans are readable by all authenticated users"
  ON plans FOR SELECT
  TO authenticated
  USING (true);

-- Entitlements policies
DROP POLICY IF EXISTS "Users can read own entitlements" ON entitlements;
CREATE POLICY "Users can read own entitlements"
  ON entitlements FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Transactions policies
DROP POLICY IF EXISTS "Users can read own transactions" ON transactions;
CREATE POLICY "Users can read own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );
