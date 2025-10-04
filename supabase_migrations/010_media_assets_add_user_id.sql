/*
  # Add user_id to media_assets for ownership tracking

  1. Schema Changes
    - Add `user_id` column to `media_assets` (references users.id)
    - Add `deleted_at` column for soft deletes
    - Rename `public_id` to `cf_image_id` for clarity
    - Make width, height, bytes nullable (populated after upload)
    - Add index on (user_id, created_at) for efficient user history queries

  2. Security Updates
    - Drop existing "readable by all" policy
    - Add policies for users to manage only their own media assets
    - SELECT: Users can view their own assets
    - INSERT: Users can create assets under their own user_id
    - UPDATE: Users can update their own assets
    - DELETE: Users can delete their own assets

  3. Notes
    - Existing media_assets without user_id will be kept but inaccessible
    - New uploads will always have user_id set
*/

-- Add new columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_assets' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE media_assets ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_assets' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE media_assets ADD COLUMN deleted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_assets' AND column_name = 'cf_image_id'
  ) THEN
    ALTER TABLE media_assets ADD COLUMN cf_image_id text;
    -- Copy existing public_id values to cf_image_id if needed
    UPDATE media_assets SET cf_image_id = public_id WHERE cf_image_id IS NULL;
  END IF;
END $$;

-- Make dimensions nullable (populated after upload completes)
ALTER TABLE media_assets ALTER COLUMN width DROP NOT NULL;
ALTER TABLE media_assets ALTER COLUMN height DROP NOT NULL;
ALTER TABLE media_assets ALTER COLUMN bytes DROP NOT NULL;

-- Add index for user history queries
CREATE INDEX IF NOT EXISTS idx_media_assets_user_created ON media_assets(user_id, created_at DESC);

-- Update RLS policies
DROP POLICY IF EXISTS "Media assets readable by all authenticated users" ON media_assets;

DROP POLICY IF EXISTS "Users can view own media assets" ON media_assets;
CREATE POLICY "Users can view own media assets"
  ON media_assets FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can create own media assets" ON media_assets;
CREATE POLICY "Users can create own media assets"
  ON media_assets FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can update own media assets" ON media_assets;
CREATE POLICY "Users can update own media assets"
  ON media_assets FOR UPDATE
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can delete own media assets" ON media_assets;
CREATE POLICY "Users can delete own media assets"
  ON media_assets FOR DELETE
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
