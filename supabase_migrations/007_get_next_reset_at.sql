/*
  # Add get_next_reset_at RPC Function

  1. New Function
    - `get_next_reset_at()` - Returns the next monthly token reset date for the current user
      - Returns timestamptz (next reset date)
      - Uses auth.uid() for security
      - Calculates next reset based on entitlement's next_grant_at field
      - Returns NULL if no entitlement record exists

  2. Security
    - Function only operates on current user's data via auth.uid()
    - SECURITY DEFINER ensures proper permission handling
    - No risk of users accessing other users' reset dates

  3. Usage
    - Called from frontend to display when user's tokens will reset
    - Helps users understand their token allocation cycle
*/

-- Function to get next token reset date for current user
CREATE OR REPLACE FUNCTION public.get_next_reset_at()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_reset timestamptz;
  internal_user_id uuid;
BEGIN
  -- Get the internal user_id from users table using auth.uid()
  SELECT id INTO internal_user_id
  FROM public.users
  WHERE auth_id = auth.uid();

  -- If user not found in users table, return NULL
  IF internal_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get next_grant_at from entitlements
  SELECT next_grant_at INTO next_reset
  FROM public.entitlements
  WHERE user_id = internal_user_id;

  -- Return next reset date or NULL if no entitlement record exists
  RETURN next_reset;
END;
$$;
