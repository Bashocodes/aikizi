/*
  # Fix All RLS Policies for Account Setup

  1. Problem
    - Worker cannot create entitlements due to RLS WITH CHECK failure
    - Profile SELECT blocked preventing duplicate detection
    - Token spending using direct UPDATE bypasses SECURITY DEFINER functions

  2. Solution
    - Ensure entitlements INSERT policy properly allows user to create own entitlements
    - Verify profiles policies work for account setup flow
    - Document that token spending MUST use spend_tokens() RPC, not direct UPDATE

  3. Security
    - Users can only create/update their own records
    - All token operations MUST go through SECURITY DEFINER RPC functions
    - Admins have full access
*/

-- ============================================
-- ENTITLEMENTS POLICIES
-- ============================================

-- Allow users to see their own entitlements (for balance checks)
DROP POLICY IF EXISTS "Users can view own entitlements" ON entitlements;
CREATE POLICY "Users can view own entitlements"
  ON entitlements FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Allow users to create their own entitlements (for account setup)
DROP POLICY IF EXISTS "Users can insert own entitlements" ON entitlements;
CREATE POLICY "Users can insert own entitlements"
  ON entitlements FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Allow users to update their own entitlements
-- NOTE: Token spending should use spend_tokens() RPC function, not direct UPDATE
DROP POLICY IF EXISTS "Users can update own entitlements" ON entitlements;
CREATE POLICY "Users can update own entitlements"
  ON entitlements FOR UPDATE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  )
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Verify RLS is enabled
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES POLICIES (re-verify from migration 016)
-- ============================================

-- Allow users to see their own profile (critical for account setup)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Allow viewing public profiles
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Allow users to insert their own profile (for account setup)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Verify RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS POLICIES
-- ============================================

-- Allow users to see their own user record
DROP POLICY IF EXISTS "Users can view own user record" ON users;
CREATE POLICY "Users can view own user record"
  ON users FOR SELECT
  TO authenticated
  USING (
    auth_id = auth.uid()::text
    OR role = 'admin'
  );

-- Allow users to insert their own user record (for account setup)
DROP POLICY IF EXISTS "Users can insert own user record" ON users;
CREATE POLICY "Users can insert own user record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    auth_id = auth.uid()::text
  );

-- Verify RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
