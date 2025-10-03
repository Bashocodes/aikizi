/*
  # Free Plan Bootstrap and Monthly Grants

  This migration implements auto-provisioning for all authenticated users with:
  - Free plan with 1,000 tokens on signup
  - Monthly +1,000 token grants
  - Token transaction history
  - Idempotent account creation

  1. Functions Added
    - ensure_account() - Idempotent account provisioning
    - get_transactions() - Fetch user's token transaction history
    - run_monthly_free_grant() - Grant monthly tokens to Free plan users
    - Updated get_balance() - Simplified to use auth.uid() directly
    - Updated spend_tokens() - Simplified and logs transactions

  2. Changes
    - Free plan is upserted with 1,000 tokens_granted
    - Transactions track 'welcome_grant', 'monthly_grant', 'spend', etc.
    - All functions use auth.uid() for security
    - Monthly grants are additive (+1,000/month)

  3. Security
    - All functions are SECURITY DEFINER
    - Granted to 'authenticated' role only
    - No direct table writes from client

  4. Manual Setup Required
    - After running this migration, set up a cron job in Supabase Dashboard:
      * Go to Database > Cron Jobs
      * Create job: SELECT public.run_monthly_free_grant();
      * Schedule: 0 0 1 * * (monthly at midnight on the 1st, UTC)
*/

-- Ensure Free plan exists with correct token grant
INSERT INTO public.plans (name, tokens_granted)
VALUES ('free', 1000)
ON CONFLICT (name) DO UPDATE
SET tokens_granted = EXCLUDED.tokens_granted;

-- Updated get_balance() - Simplified to use auth.uid() directly
CREATE OR REPLACE FUNCTION public.get_balance()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tokens_balance FROM public.entitlements WHERE user_id = auth.uid()),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_balance() TO authenticated;

-- Updated spend_tokens() - Simplified and logs transactions
CREATE OR REPLACE FUNCTION public.spend_tokens(p_amount int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance int;
BEGIN
  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RETURN false;
  END IF;

  -- Deduct tokens atomically with row lock
  UPDATE public.entitlements
  SET
    tokens_balance = tokens_balance - p_amount,
    updated_at = now()
  WHERE user_id = auth.uid()
    AND tokens_balance >= p_amount
  RETURNING tokens_balance INTO v_new_balance;

  -- If update failed, insufficient balance
  IF v_new_balance IS NULL THEN
    RETURN false;
  END IF;

  -- Log the transaction
  INSERT INTO public.transactions (user_id, kind, amount, ref)
  VALUES (
    auth.uid(),
    'spend',
    -p_amount,
    jsonb_build_object('reason', 'decode')
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.spend_tokens(int) TO authenticated;

-- New function: get_transactions() - Fetch user's token transaction history
CREATE OR REPLACE FUNCTION public.get_transactions(limit_count int DEFAULT 50)
RETURNS SETOF public.transactions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.transactions
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_transactions(int) TO authenticated;

-- New function: ensure_account() - Idempotent account provisioning
CREATE OR REPLACE FUNCTION public.ensure_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_free_plan int;
  v_has_grants boolean;
BEGIN
  -- Exit if not authenticated
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Get free plan ID
  SELECT id INTO v_free_plan
  FROM public.plans
  WHERE name = 'free'
  LIMIT 1;

  -- Get user email from auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  -- Create user record if it doesn't exist
  INSERT INTO public.users (id, auth_id, role)
  VALUES (v_uid, v_uid::text, 'viewer')
  ON CONFLICT (id) DO NOTHING;

  -- Create profile if it doesn't exist
  INSERT INTO public.profiles (user_id, handle, display_name, avatar_url, is_public)
  SELECT
    v_uid,
    COALESCE(
      (SELECT raw_user_meta_data->>'handle' FROM auth.users WHERE id = v_uid),
      'user' || substr(v_uid::text, 1, 8)
    ),
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_uid),
      (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = v_uid),
      split_part(v_email, '@', 1)
    ),
    (SELECT raw_user_meta_data->>'picture' FROM auth.users WHERE id = v_uid),
    false
  ON CONFLICT (user_id) DO NOTHING;

  -- Create entitlement record if it doesn't exist
  INSERT INTO public.entitlements (user_id, plan_id, tokens_balance)
  VALUES (v_uid, v_free_plan, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Check if user has already received grants
  SELECT EXISTS(
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_uid
      AND kind IN ('welcome_grant', 'monthly_grant')
  ) INTO v_has_grants;

  -- Grant welcome tokens only if user has never received any grants
  IF NOT v_has_grants THEN
    -- Insert welcome grant transaction
    INSERT INTO public.transactions (user_id, kind, amount, ref)
    VALUES (
      v_uid,
      'welcome_grant',
      1000,
      jsonb_build_object('reason', 'signup', 'plan', 'free')
    );

    -- Add welcome tokens to balance
    UPDATE public.entitlements
    SET
      tokens_balance = tokens_balance + 1000,
      updated_at = now()
    WHERE user_id = v_uid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_account() TO authenticated;

-- Function: run_monthly_free_grant() - Grant monthly tokens to Free plan users
CREATE OR REPLACE FUNCTION public.run_monthly_free_grant()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Find all Free plan users who haven't received a grant this month
  WITH eligible AS (
    SELECT e.user_id
    FROM public.entitlements e
    JOIN public.plans p ON p.id = e.plan_id AND p.name = 'free'
    LEFT JOIN public.transactions t
      ON t.user_id = e.user_id
      AND t.kind = 'monthly_grant'
      AND date_trunc('month', t.created_at) = date_trunc('month', now())
    WHERE t.id IS NULL
  ),
  updated AS (
    UPDATE public.entitlements e
    SET
      tokens_balance = tokens_balance + 1000,
      updated_at = now()
    WHERE e.user_id IN (SELECT user_id FROM eligible)
    RETURNING e.user_id
  )
  INSERT INTO public.transactions (user_id, kind, amount, ref)
  SELECT
    u.user_id,
    'monthly_grant',
    1000,
    jsonb_build_object('period', to_char(now(), 'YYYY-MM'), 'plan', 'free')
  FROM updated u;
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
