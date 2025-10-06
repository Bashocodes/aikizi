/*
  # Fix Profile INSERT Policy

  This migration fixes the RLS policy blocking profile creation during account setup.

  1. Problem
    - Profile INSERT policy is rejecting new profile creation
    - Error: "new row violates row-level security policy for table 'profiles'"
    - Worker API cannot create profiles even with valid auth token

  2. Solution
    - Update INSERT policy to properly allow profile creation
    - Ensure the policy correctly matches user_id to auth.uid() via users table
    - Add fallback to allow authenticated users to create their own profile

  3. Security
    - Users can only insert their own profile (user_id must match their internal user ID)
    - Policy validates via users.auth_id lookup
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Create improved INSERT policy that allows profile creation
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()::text
    )
  );

-- Ensure the profiles table has RLS enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
