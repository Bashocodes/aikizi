# Fix Profile Creation RLS Issue

## Problem
Users cannot sign up because profile creation is being blocked by RLS policies:
```
[FN ensure-account] Failed to create profile: new row violates row-level security policy for table "profiles"
```

## Root Cause
The INSERT policy on the `profiles` table requires that the `user_id` exists in the `users` table with a matching `auth_id = auth.uid()`. However, the check is failing.

## Solution

You need to apply these SQL commands in your Supabase SQL Editor:

### Step 1: Check Current Policies
```sql
-- View current policies on profiles table
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

### Step 2: Fix the Profile INSERT Policy

Run this SQL in Supabase SQL Editor:

```sql
-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Create new INSERT policy that allows profile creation
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()::text
    )
  );
```

### Step 3: Verify Migrations Are Applied

Make sure migrations 011, 012, 013, and 014 have been applied:

```sql
-- Check if migrations table exists and what has been applied
-- (This assumes you're tracking migrations)

-- Manually verify key policies exist:
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('users', 'profiles', 'entitlements', 'transactions')
ORDER BY tablename, cmd;
```

### Step 4: Test Account Creation

After applying the fix:

1. Sign out completely
2. Clear browser cache and cookies for aikizi.xyz
3. Sign in with Google again
4. Watch the wrangler tail logs

You should see:
```
[FN ensure-account] Profile created with handle: <handle>
[FN ensure-account] Entitlements created: user_id=... balance=1000
```

## If Still Failing

If the issue persists, the problem might be that migration 011 was never applied. Run migration 011 manually:

```sql
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

-- Profiles INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );
```

## Broken Account Cleanup

For users stuck in broken state (user exists but no profile), run:

```sql
-- Find broken accounts
SELECT u.id, u.auth_id, u.created_at, p.user_id as has_profile
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- You can manually create profiles for these users (replace values):
-- INSERT INTO profiles (user_id, handle, display_name, is_public)
-- VALUES (
--   '<user_id_from_above>',
--   'user<random>',
--   'User',
--   false
-- );
```

## Quick Fix for Existing Broken Accounts

For the specific broken accounts in your logs:
- `fba96d41-3cc4-4bd4-9ad4-59488e646626` (auth_id: 56f41d71-ecd6-4371-a9c8-c7aef131978d)
- `8552f042-1543-4fc3-a69e-e4985e1fca94` (auth_id: a99efd4a-cd2a-4df4-a8d0-0711180f7316)

You can manually create profiles for them:

```sql
-- First broken account
INSERT INTO profiles (user_id, handle, display_name, is_public)
VALUES (
  'fba96d41-3cc4-4bd4-9ad4-59488e646626',
  'user' || substr('fba96d41-3cc4-4bd4-9ad4-59488e646626'::text, 1, 8),
  'User',
  false
)
ON CONFLICT (user_id) DO NOTHING;

-- Create entitlements
INSERT INTO entitlements (user_id, plan_id, tokens_balance, renews_at)
SELECT
  'fba96d41-3cc4-4bd4-9ad4-59488e646626',
  (SELECT id FROM plans WHERE name = 'free'),
  1000,
  date_trunc('month', now()) + interval '1 month'
WHERE NOT EXISTS (
  SELECT 1 FROM entitlements WHERE user_id = 'fba96d41-3cc4-4bd4-9ad4-59488e646626'
);

-- Second broken account
INSERT INTO profiles (user_id, handle, display_name, is_public)
VALUES (
  '8552f042-1543-4fc3-a69e-e4985e1fca94',
  'user' || substr('8552f042-1543-4fc3-a69e-e4985e1fca94'::text, 1, 8),
  'User',
  false
)
ON CONFLICT (user_id) DO NOTHING;

-- Create entitlements
INSERT INTO entitlements (user_id, plan_id, tokens_balance, renews_at)
SELECT
  '8552f042-1543-4fc3-a69e-e4985e1fca94',
  (SELECT id FROM plans WHERE name = 'free'),
  1000,
  date_trunc('month', now()) + interval '1 month'
WHERE NOT EXISTS (
  SELECT 1 FROM entitlements WHERE user_id = '8552f042-1543-4fc3-a69e-e4985e1fca94'
);
```
