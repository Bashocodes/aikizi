/*
  # Fix Profile RLS SELECT Policy

  This migration ensures profiles can be properly queried during account setup.

  1. Problem
    - Worker cannot detect existing profiles due to RLS blocking SELECT
    - This causes duplicate INSERT attempts that fail with pkey constraint error
    - Users get stuck in a loop unable to complete account setup

  2. Solution
    - Ensure SELECT policy allows users to see their own profile
    - Verify INSERT policy is correct
    - Make policies work consistently with worker's auth pattern

  3. Security
    - Users can only see their own profile (unless public)
    - Admins can see all profiles
    - INSERT restricted to own user_id
*/

-- Drop and recreate SELECT policies to ensure they work correctly
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON profiles;

-- Allow users to see their own profile (critical for account setup)
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Allow viewing public profiles
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Ensure INSERT policy is correct (should already exist from migration 011)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Verify RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
