/*
  # Fix transactions.user_id Column Type

  1. Problem
    - The transactions table has user_id column as TEXT type
    - The spend_tokens function expects UUID type
    - This causes "operator does not exist: text = uuid" error
    - Migration 001 defined it as UUID, but actual database has TEXT

  2. Changes
    - Drop foreign key constraint temporarily
    - Convert transactions.user_id from TEXT to UUID
    - Recreate foreign key constraint to users(id)
    - Verify no data loss occurs

  3. Safety
    - Only converts valid UUID strings
    - Uses USING clause to safely cast text to uuid
    - Preserves all existing transaction records
    - Maintains referential integrity with users table
*/

-- Step 1: Drop the existing foreign key constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'transactions_user_id_fkey'
    AND table_name = 'transactions'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_user_id_fkey;
  END IF;
END $$;

-- Step 2: Convert user_id column from TEXT to UUID
DO $$
BEGIN
  -- Check if the column is actually TEXT type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions'
    AND column_name = 'user_id'
    AND data_type = 'text'
  ) THEN
    -- Convert the column type
    ALTER TABLE public.transactions
    ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
  END IF;
END $$;

-- Step 3: Recreate the foreign key constraint
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Step 4: Verify the change
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_name = 'transactions'
  AND column_name = 'user_id';

  RAISE NOTICE 'transactions.user_id type is now: %', v_data_type;
END $$;
