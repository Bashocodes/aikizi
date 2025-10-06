/*
  # Disable Database Trigger for Account Creation

  This migration removes the automatic database trigger that created accounts
  during OAuth sign-in. The worker API (/v1/ensure-account) is now the single
  source of truth for account creation.

  1. Changes
    - Drop the `on_auth_user_created` trigger
    - Drop the `handle_new_user()` function
    - Worker API now exclusively handles account creation

  2. Why This Change
    - Prevents race conditions between trigger and worker API
    - Eliminates partial account states from trigger failures
    - Provides better error handling and retry logic
    - Enables idempotent account creation
    - Single code path is easier to maintain and debug

  3. Impact
    - Existing accounts are not affected
    - New OAuth sign-ins will rely on worker API to create accounts
    - Frontend calls /v1/ensure-account after successful OAuth
*/

-- Drop the trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function
DROP FUNCTION IF EXISTS public.handle_new_user();
