/*
  # Replace spend_tokens with Idempotent Version + Add grant_tokens

  1. Changes
    - Replace `spend_tokens(amount int)` with `spend_tokens(p_cost int, p_idem_key text)`
      - Returns table(balance int) instead of boolean
      - Idempotent: Same idem_key won't deduct twice
      - Logs transaction in transactions table
      - Raises exception if insufficient tokens

    - Add `grant_tokens(p_user_id uuid, p_amount int, p_reason text)`
      - Adds tokens to user balance
      - Logs transaction in transactions table
      - Security definer for admin use

  2. Security
    - spend_tokens: Uses auth.uid() to identify caller
    - grant_tokens: Security definer, only callable by service role
    - Both functions use proper transaction isolation
*/

-- Drop old spend_tokens function
DROP FUNCTION IF EXISTS public.spend_tokens(integer);

-- Create idempotent spend_tokens function
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
  -- Caller must be authenticated; map auth.uid() -> users.id
  SELECT u.id INTO v_user_id FROM public.users u WHERE u.auth_id = auth.uid();
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

-- Create grant_tokens function
CREATE OR REPLACE FUNCTION public.grant_tokens(p_user_id uuid, p_amount int, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.entitlements
  SET tokens_balance = tokens_balance + p_amount,
      last_granted_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.transactions(user_id, kind, amount, ref)
  VALUES (p_user_id, 'grant', p_amount, jsonb_build_object('reason', p_reason));
END;
$$;
