/*
  # Fix Token Provisioning and Entitlements RLS

  This migration fixes critical issues with token provisioning for new users:

  1. Problems Fixed
    - Missing INSERT policies on entitlements and transactions tables
    - Missing UPDATE policies on entitlements for token spending
    - Worker API unable to create entitlements due to RLS blocking writes
    - New users not receiving their 1000 welcome tokens
    - Some users unable to spend tokens due to missing UPDATE policy

  2. New Policies Added
    - Entitlements INSERT: Allow system to create entitlements for new users
    - Entitlements UPDATE: Allow users to update their own token balance
    - Transactions INSERT: Allow system to log token transactions
    - Users INSERT: Allow system to create user records

  3. Security
    - INSERT policies restricted to the user's own records
    - UPDATE policies check ownership before allowing changes
    - All policies use auth.uid() for security
    - Admin role can bypass restrictions for management
*/

-- Users INSERT policy
DROP POLICY IF EXISTS "System can insert users" ON users;
CREATE POLICY "System can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth_id = auth.uid()::text);

-- Entitlements INSERT policy
DROP POLICY IF EXISTS "System can insert entitlements" ON entitlements;
CREATE POLICY "System can insert entitlements"
  ON entitlements FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Entitlements UPDATE policy
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

-- Transactions INSERT policy
DROP POLICY IF EXISTS "System can insert transactions" ON transactions;
CREATE POLICY "System can insert transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Profiles INSERT policy (if not exists)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );
