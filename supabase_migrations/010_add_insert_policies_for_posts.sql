/*
  # Add INSERT/UPDATE/DELETE Policies for Posts and Media

  This migration adds missing write policies for authenticated users to create and manage
  their own posts, media assets, and related data.

  ## Changes

  1. Media Assets
    - Add INSERT policy: Authenticated users can create media assets

  2. Posts
    - Add INSERT policy: Users can create posts they own
    - Add UPDATE policy: Users can update their own posts
    - Add DELETE policy: Users can delete their own posts

  3. Post Metadata Tables
    - Add INSERT/UPDATE/DELETE policies for post_meta
    - Add INSERT/DELETE policies for post_subjects, post_styles, post_tags

  4. SREF Tables
    - Add INSERT/UPDATE policies for sref_codes
    - Add INSERT policy for sref_unlocks

  ## Security
  - All policies verify ownership through users.auth_id = auth.uid()
  - Media assets are globally insertable (CDN-backed, public readable)
  - Post metadata is scoped to post ownership
*/

-- Media Assets INSERT Policy
DROP POLICY IF EXISTS "Authenticated users can insert media assets" ON media_assets;
CREATE POLICY "Authenticated users can insert media assets"
  ON media_assets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Posts INSERT Policy
DROP POLICY IF EXISTS "Users can insert own posts" ON posts;
CREATE POLICY "Users can insert own posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Posts UPDATE Policy
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Posts DELETE Policy
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;
CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  TO authenticated
  USING (owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Post Meta INSERT Policy
DROP POLICY IF EXISTS "Users can insert post meta for own posts" ON post_meta;
CREATE POLICY "Users can insert post meta for own posts"
  ON post_meta FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Meta UPDATE Policy
DROP POLICY IF EXISTS "Users can update post meta for own posts" ON post_meta;
CREATE POLICY "Users can update post meta for own posts"
  ON post_meta FOR UPDATE
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Meta DELETE Policy
DROP POLICY IF EXISTS "Users can delete post meta for own posts" ON post_meta;
CREATE POLICY "Users can delete post meta for own posts"
  ON post_meta FOR DELETE
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Subjects INSERT Policy
DROP POLICY IF EXISTS "Users can insert post subjects for own posts" ON post_subjects;
CREATE POLICY "Users can insert post subjects for own posts"
  ON post_subjects FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Subjects DELETE Policy
DROP POLICY IF EXISTS "Users can delete post subjects for own posts" ON post_subjects;
CREATE POLICY "Users can delete post subjects for own posts"
  ON post_subjects FOR DELETE
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Styles INSERT Policy
DROP POLICY IF EXISTS "Users can insert post styles for own posts" ON post_styles;
CREATE POLICY "Users can insert post styles for own posts"
  ON post_styles FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Styles DELETE Policy
DROP POLICY IF EXISTS "Users can delete post styles for own posts" ON post_styles;
CREATE POLICY "Users can delete post styles for own posts"
  ON post_styles FOR DELETE
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Tags INSERT Policy
DROP POLICY IF EXISTS "Users can insert post tags for own posts" ON post_tags;
CREATE POLICY "Users can insert post tags for own posts"
  ON post_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post Tags DELETE Policy
DROP POLICY IF EXISTS "Users can delete post tags for own posts" ON post_tags;
CREATE POLICY "Users can delete post tags for own posts"
  ON post_tags FOR DELETE
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- SREF Codes INSERT Policy
DROP POLICY IF EXISTS "Users can insert sref codes for own posts" ON sref_codes;
CREATE POLICY "Users can insert sref codes for own posts"
  ON sref_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- SREF Codes UPDATE Policy
DROP POLICY IF EXISTS "Users can update sref codes for own posts" ON sref_codes;
CREATE POLICY "Users can update sref codes for own posts"
  ON sref_codes FOR UPDATE
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- SREF Unlocks INSERT Policy
DROP POLICY IF EXISTS "Users can insert own sref unlocks" ON sref_unlocks;
CREATE POLICY "Users can insert own sref unlocks"
  ON sref_unlocks FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
