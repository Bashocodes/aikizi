/*
  # Fix Infinite Recursion in Users RLS Policy

  1. Problem
    - Migration 017 created users SELECT policy that checks role = 'admin'
    - This causes infinite recursion: to check role, must SELECT from users, which checks role...
    - All queries to users table now fail with "infinite recursion detected"

  2. Solution
    - Simplify users SELECT policy to ONLY check auth_id = auth.uid()
    - Remove admin check from users table policies (admins can use service role)
    - Admin operations should use service role key, not RLS

  3. Impact
    - Users can see only their own user record
    - No recursion issues
    - Account setup flow works correctly
*/

-- ============================================
-- FIX USERS TABLE POLICIES (Remove recursion)
-- ============================================

-- Allow users to see ONLY their own user record (no admin check to avoid recursion)
DROP POLICY IF EXISTS "Users can view own user record" ON users;
CREATE POLICY "Users can view own user record"
  ON users FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid()::text);

-- Allow users to insert their own user record (for account setup)
DROP POLICY IF EXISTS "Users can insert own user record" ON users;
CREATE POLICY "Users can insert own user record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth_id = auth.uid()::text);

-- Verify RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FIX PROFILES POLICIES (Remove recursion risk)
-- ============================================

-- Simplify profiles SELECT to avoid any recursion through users table
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Public profiles (separate policy, no recursion)
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- ============================================
-- FIX ENTITLEMENTS POLICIES (Remove recursion risk)
-- ============================================

-- Allow users to see their own entitlements
DROP POLICY IF EXISTS "Users can view own entitlements" ON entitlements;
CREATE POLICY "Users can view own entitlements"
  ON entitlements FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Allow users to create their own entitlements
DROP POLICY IF EXISTS "Users can insert own entitlements" ON entitlements;
CREATE POLICY "Users can insert own entitlements"
  ON entitlements FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Allow users to update their own entitlements
DROP POLICY IF EXISTS "Users can update own entitlements" ON entitlements;
CREATE POLICY "Users can update own entitlements"
  ON entitlements FOR UPDATE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  )
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );
