/*
  # Fix Public Post Reading for Anon Users (No JWT)

  ## Problem
  The SELECT policy for public posts currently checks auth.uid() IS NOT NULL,
  which blocks unauthenticated users from viewing public posts.

  Public posts with visibility='public' and status='published' should be
  readable by ANYONE, even without authentication.

  ## Solution
  Update the SELECT policy to allow reading public posts without JWT.
  Keep the separate policy for users to read their own posts.
*/

-- Drop the existing public posts policy
DROP POLICY IF EXISTS "Public posts are readable by all users" ON posts;

-- Create new policy: Public posts readable without authentication
CREATE POLICY "Public published posts readable by anyone"
  ON posts FOR SELECT
  TO public
  USING (visibility = 'public' AND status = 'published');

-- Keep the policy for users to read their own posts (requires JWT)
DROP POLICY IF EXISTS "Users can read own posts" ON posts;
CREATE POLICY "Users can read own posts"
  ON posts FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- Update related tables to allow reading metadata for public posts
-- These should NOT require auth.uid() for public posts

-- POST_META: Readable for public posts without JWT
DROP POLICY IF EXISTS "Post meta readable with post" ON post_meta;
CREATE POLICY "Post meta readable for public posts"
  ON post_meta FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE visibility = 'public' AND status = 'published'
    )
    OR (
      auth.uid() IS NOT NULL AND
      post_id IN (
        SELECT id FROM posts
        WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

-- POST_SUBJECTS: Readable for public posts without JWT
DROP POLICY IF EXISTS "Post subjects readable with post" ON post_subjects;
CREATE POLICY "Post subjects readable for public posts"
  ON post_subjects FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE visibility = 'public' AND status = 'published'
    )
    OR (
      auth.uid() IS NOT NULL AND
      post_id IN (
        SELECT id FROM posts
        WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

-- POST_STYLES: Readable for public posts without JWT
DROP POLICY IF EXISTS "Post styles readable with post" ON post_styles;
CREATE POLICY "Post styles readable for public posts"
  ON post_styles FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE visibility = 'public' AND status = 'published'
    )
    OR (
      auth.uid() IS NOT NULL AND
      post_id IN (
        SELECT id FROM posts
        WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

-- POST_TAGS: Readable for public posts without JWT
DROP POLICY IF EXISTS "Post tags readable with post" ON post_tags;
CREATE POLICY "Post tags readable for public posts"
  ON post_tags FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE visibility = 'public' AND status = 'published'
    )
    OR (
      auth.uid() IS NOT NULL AND
      post_id IN (
        SELECT id FROM posts
        WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

-- SREF_CODES: Readable for public posts without JWT
DROP POLICY IF EXISTS "SREF codes readable with post" ON sref_codes;
CREATE POLICY "SREF codes readable for public posts"
  ON sref_codes FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE visibility = 'public' AND status = 'published'
    )
    OR (
      auth.uid() IS NOT NULL AND
      post_id IN (
        SELECT id FROM posts
        WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

-- Verify the policies
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN length(qual) > 60 THEN substring(qual from 1 for 60) || '...'
    ELSE qual
  END as qual_summary
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('posts', 'post_meta', 'post_subjects', 'post_styles', 'post_tags', 'sref_codes')
  AND cmd = 'SELECT'
ORDER BY tablename, policyname;
