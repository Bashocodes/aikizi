/*
  # Fix All RLS Policies for Anon Role with JWT

  ## Problem
  When using createClient() with ANON_KEY + JWT in Authorization header:
  - Supabase validates the JWT and auth.uid() works correctly
  - BUT the Postgres role is still 'anon', not 'authenticated'
  - Policies with TO authenticated don't apply to these requests

  ## Solution
  Change all policies from:
    TO authenticated -> TO public (or check auth.uid() IS NOT NULL)

  This allows the anon role with a valid JWT to perform operations.

  ## Tables Updated
  - media_assets
  - posts
  - post_meta
  - post_subjects
  - post_styles
  - post_tags
  - sref_codes
  - sref_unlocks
  - bookmarks
  - likes
*/

-- ============================================================================
-- MEDIA_ASSETS
-- ============================================================================

DROP POLICY IF EXISTS "Media assets readable by all authenticated users" ON media_assets;
CREATE POLICY "Media assets readable by all users"
  ON media_assets FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert media assets" ON media_assets;
CREATE POLICY "Users with valid JWT can insert media assets"
  ON media_assets FOR INSERT
  TO public
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update media assets" ON media_assets;
CREATE POLICY "Users with valid JWT can update media assets"
  ON media_assets FOR UPDATE
  TO public
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- POSTS
-- ============================================================================

DROP POLICY IF EXISTS "Public posts are readable by all authenticated users" ON posts;
CREATE POLICY "Public posts are readable by all users"
  ON posts FOR SELECT
  TO public
  USING (visibility = 'public' AND status = 'published');

DROP POLICY IF EXISTS "Users can read own posts" ON posts;
CREATE POLICY "Users can read own posts"
  ON posts FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Users can insert own posts" ON posts;
CREATE POLICY "Users can insert own posts"
  ON posts FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Users can update own posts" ON posts;
CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Users can delete own posts" ON posts;
CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- ============================================================================
-- POST_META
-- ============================================================================

DROP POLICY IF EXISTS "Post meta readable with post" ON post_meta;
CREATE POLICY "Post meta readable with post"
  ON post_meta FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR (
        auth.uid() IS NOT NULL AND
        owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert post meta for own posts" ON post_meta;
CREATE POLICY "Users can insert post meta for own posts"
  ON post_meta FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can update post meta for own posts" ON post_meta;
CREATE POLICY "Users can update post meta for own posts"
  ON post_meta FOR UPDATE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can delete post meta for own posts" ON post_meta;
CREATE POLICY "Users can delete post meta for own posts"
  ON post_meta FOR DELETE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- ============================================================================
-- POST_SUBJECTS
-- ============================================================================

DROP POLICY IF EXISTS "Post subjects readable with post" ON post_subjects;
CREATE POLICY "Post subjects readable with post"
  ON post_subjects FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR (
        auth.uid() IS NOT NULL AND
        owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert post subjects for own posts" ON post_subjects;
CREATE POLICY "Users can insert post subjects for own posts"
  ON post_subjects FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can delete post subjects for own posts" ON post_subjects;
CREATE POLICY "Users can delete post subjects for own posts"
  ON post_subjects FOR DELETE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- ============================================================================
-- POST_STYLES
-- ============================================================================

DROP POLICY IF EXISTS "Post styles readable with post" ON post_styles;
CREATE POLICY "Post styles readable with post"
  ON post_styles FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR (
        auth.uid() IS NOT NULL AND
        owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert post styles for own posts" ON post_styles;
CREATE POLICY "Users can insert post styles for own posts"
  ON post_styles FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can delete post styles for own posts" ON post_styles;
CREATE POLICY "Users can delete post styles for own posts"
  ON post_styles FOR DELETE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- ============================================================================
-- POST_TAGS
-- ============================================================================

DROP POLICY IF EXISTS "Post tags readable with post" ON post_tags;
CREATE POLICY "Post tags readable with post"
  ON post_tags FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR (
        auth.uid() IS NOT NULL AND
        owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert post tags for own posts" ON post_tags;
CREATE POLICY "Users can insert post tags for own posts"
  ON post_tags FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can delete post tags for own posts" ON post_tags;
CREATE POLICY "Users can delete post tags for own posts"
  ON post_tags FOR DELETE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- ============================================================================
-- SREF_CODES
-- ============================================================================

DROP POLICY IF EXISTS "SREF codes readable with post" ON sref_codes;
CREATE POLICY "SREF codes readable with post"
  ON sref_codes FOR SELECT
  TO public
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR (
        auth.uid() IS NOT NULL AND
        owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert sref codes for own posts" ON sref_codes;
CREATE POLICY "Users can insert sref codes for own posts"
  ON sref_codes FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Users can update sref codes for own posts" ON sref_codes;
CREATE POLICY "Users can update sref codes for own posts"
  ON sref_codes FOR UPDATE
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    post_id IN (
      SELECT id FROM posts
      WHERE owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- ============================================================================
-- SREF_UNLOCKS
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own SREF unlocks" ON sref_unlocks;
CREATE POLICY "Users can read own SREF unlocks"
  ON sref_unlocks FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Users can insert own sref unlocks" ON sref_unlocks;
CREATE POLICY "Users can insert own sref unlocks"
  ON sref_unlocks FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- ============================================================================
-- BOOKMARKS
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own bookmarks" ON bookmarks;
CREATE POLICY "Users can manage own bookmarks"
  ON bookmarks FOR ALL
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- ============================================================================
-- LIKES
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own likes" ON likes;
CREATE POLICY "Users can manage own likes"
  ON likes FOR ALL
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Verify all policies were updated
SELECT
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('media_assets', 'posts', 'post_meta', 'post_subjects',
                    'post_styles', 'post_tags', 'sref_codes', 'sref_unlocks',
                    'bookmarks', 'likes')
ORDER BY tablename, cmd, policyname;
