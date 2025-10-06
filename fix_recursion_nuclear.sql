-- EMERGENCY FIX: Drop ALL policies on users table and recreate without recursion
-- Run this IMMEDIATELY in Supabase SQL Editor

-- Drop ALL existing policies on users table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.users';
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

-- Create simple, non-recursive SELECT policy
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid()::text);

-- Create simple INSERT policy
CREATE POLICY "System can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth_id = auth.uid()::text);

-- Verify RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Also fix profiles policies (drop all and recreate)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.profiles';
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Public profiles viewable"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_public = true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  )
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Fix entitlements policies (drop all and recreate)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'entitlements' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.entitlements';
        RAISE NOTICE 'Dropped policy: %', r.policyname;
    END LOOP;
END $$;

CREATE POLICY "Users can view own entitlements"
  ON entitlements FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can insert own entitlements"
  ON entitlements FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

CREATE POLICY "Users can update own entitlements"
  ON entitlements FOR UPDATE
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  )
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Verify RLS enabled on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

-- Show final policy count
SELECT
  'users' as table_name,
  count(*) as policy_count
FROM pg_policies
WHERE tablename = 'users' AND schemaname = 'public'
UNION ALL
SELECT
  'profiles',
  count(*)
FROM pg_policies
WHERE tablename = 'profiles' AND schemaname = 'public'
UNION ALL
SELECT
  'entitlements',
  count(*)
FROM pg_policies
WHERE tablename = 'entitlements' AND schemaname = 'public';
