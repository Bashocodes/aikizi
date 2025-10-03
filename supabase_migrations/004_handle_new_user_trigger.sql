/*
  # Handle New User Trigger Function

  THIS IS THE CRITICAL MIGRATION THAT FIXES THE GOOGLE SIGN-IN ERROR!

  This migration creates a trigger function that automatically creates user records
  when someone signs in with Google (or any OAuth provider).

  1. What It Does
    - When a new user signs in via auth.users, this trigger fires
    - Creates a record in the `users` table with auth_id from auth.users
    - Creates a profile with a unique handle
    - Creates an entitlement record with free plan and 1000 tokens

  2. Why It's Needed
    - Without this trigger, Google OAuth fails with "Database error saving new user"
    - The application expects a users table record for every authenticated user
    - This trigger bridges the gap between Supabase auth and your app's user model

  3. Security
    - Function runs with SECURITY DEFINER to bypass RLS policies
    - Only triggered automatically by Supabase on auth.users INSERT
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user record
  INSERT INTO public.users (auth_id, role)
  VALUES (new.id::text, 'viewer');

  -- Create profile with handle from metadata or generated handle
  INSERT INTO public.profiles (user_id, handle, display_name, is_public)
  VALUES (
    (SELECT id FROM public.users WHERE auth_id = new.id::text),
    COALESCE(
      new.raw_user_meta_data->>'handle',
      'user' || substr(new.id::text, 1, 8)
    ),
    COALESCE(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name'
    ),
    false
  );

  -- Create entitlement with free plan
  INSERT INTO public.entitlements (user_id, plan_id, tokens_balance)
  VALUES (
    (SELECT id FROM public.users WHERE auth_id = new.id::text),
    (SELECT id FROM public.plans WHERE name = 'free'),
    1000
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
