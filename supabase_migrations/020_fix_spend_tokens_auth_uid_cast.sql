/*
  # Fix spend_tokens Function - Add auth.uid() Cast

  1. Problem
    - The spend_tokens function compares users.auth_id (text) with auth.uid() (uuid)
    - This causes "operator does not exist: text = uuid" error
    - Line 38: WHERE u.auth_id = auth.uid() needs casting

  2. Solution
    - Cast auth.uid() to text: auth.uid()::text
    - This matches the pattern used in all RLS policies
    - Ensures type compatibility between text and uuid

  3. Changes
    - Drop existing spend_tokens function
    - Recreate spend_tokens function with proper type casting
    - No data changes, only function definition update
*/

-- Drop existing spend_tokens function (handles parameter mismatch)
DROP FUNCTION IF EXISTS public.spend_tokens(integer, text);
DROP FUNCTION IF EXISTS public.spend_tokens(int, text);

-- Recreate spend_tokens function with auth.uid()::text cast
CREATE OR REPLACE FUNCTION public.spend_tokens(p_cost int, p_idem_key text)
RETURNS table(balance int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance int;
  v_dup int;
BEGIN
  -- Caller must be authenticated; map auth.uid()::text -> users.id
  -- FIXED: Added ::text cast to auth.uid() to match users.auth_id type
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.auth_id = auth.uid()::text;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Idempotency: if a txn with this key exists, return current balance
  SELECT count(*) INTO v_dup
  FROM public.transactions
  WHERE user_id = v_user_id
    AND ref->>'idem_key' = p_idem_key
    AND kind = 'spend';

  IF v_dup > 0 THEN
    SELECT tokens_balance INTO v_balance
    FROM public.entitlements
    WHERE user_id = v_user_id;
    RETURN QUERY SELECT v_balance;
    RETURN;
  END IF;

  -- Check & spend
  UPDATE public.entitlements
  SET tokens_balance = tokens_balance - p_cost, updated_at = now()
  WHERE user_id = v_user_id AND tokens_balance >= p_cost;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_tokens';
  END IF;

  -- Log transaction
  INSERT INTO public.transactions(user_id, kind, amount, ref)
  VALUES (v_user_id, 'spend', p_cost, jsonb_build_object('idem_key', p_idem_key));

  -- Return new balance
  SELECT tokens_balance INTO v_balance
  FROM public.entitlements
  WHERE user_id = v_user_id;
  RETURN QUERY SELECT v_balance;
END;
$$;
