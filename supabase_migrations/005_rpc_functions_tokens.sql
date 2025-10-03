/*
  # Add RPC Functions for Token Management

  1. New Functions
    - `get_balance()` - Returns the current user's token balance
      - Returns integer (token balance)
      - Uses auth.uid() for security
      - Returns 0 if no entitlement record exists

    - `spend_tokens(amount int)` - Decrements user's token balance
      - Accepts amount parameter (integer)
      - Returns boolean (true on success, false on insufficient balance)
      - Uses auth.uid() for security
      - Validates sufficient balance before deducting
      - Updates updated_at timestamp
      - Atomic operation to prevent race conditions

  2. Security
    - Both functions only operate on current user's data via auth.uid()
    - No risk of users accessing other users' balances or spending others' tokens
    - Proper error handling for missing entitlement records
*/

-- Function to get current user's token balance
CREATE OR REPLACE FUNCTION public.get_balance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_balance integer;
  internal_user_id uuid;
BEGIN
  -- Get the internal user_id from users table using auth.uid()
  SELECT id INTO internal_user_id
  FROM public.users
  WHERE auth_id = auth.uid();

  -- If user not found in users table, return 0
  IF internal_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Get token balance from entitlements
  SELECT tokens_balance INTO user_balance
  FROM public.entitlements
  WHERE user_id = internal_user_id;

  -- Return balance or 0 if no entitlement record exists
  RETURN COALESCE(user_balance, 0);
END;
$$;

-- Function to spend tokens (returns true on success, false on insufficient balance)
CREATE OR REPLACE FUNCTION public.spend_tokens(amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
  internal_user_id uuid;
BEGIN
  -- Validate amount is positive
  IF amount <= 0 THEN
    RETURN false;
  END IF;

  -- Get the internal user_id from users table using auth.uid()
  SELECT id INTO internal_user_id
  FROM public.users
  WHERE auth_id = auth.uid();

  -- If user not found, return false
  IF internal_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get current balance with row lock to prevent race conditions
  SELECT tokens_balance INTO current_balance
  FROM public.entitlements
  WHERE user_id = internal_user_id
  FOR UPDATE;

  -- If no entitlement record or insufficient balance, return false
  IF current_balance IS NULL OR current_balance < amount THEN
    RETURN false;
  END IF;

  -- Deduct tokens and update timestamp
  UPDATE public.entitlements
  SET
    tokens_balance = tokens_balance - amount,
    updated_at = now()
  WHERE user_id = internal_user_id;

  RETURN true;
END;
$$;
