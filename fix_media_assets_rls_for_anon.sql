-- Fix media_assets RLS policies for anon role with JWT
--
-- Issue: When using createClient with ANON_KEY + JWT in Authorization header,
-- Supabase treats the request as coming from 'anon' role, not 'authenticated'.
-- The JWT is validated and auth.uid() works, but the role is still 'anon'.
--
-- Solution: Change policies from TO authenticated -> TO anon, authenticated
-- OR use TO public (which includes both)

-- SELECT Policy (already exists, but let's make it work for anon too)
DROP POLICY IF EXISTS "Media assets readable by all authenticated users" ON media_assets;
CREATE POLICY "Media assets readable by all users"
  ON media_assets
  FOR SELECT
  TO public
  USING (true);

-- INSERT Policy - Allow anon role with valid JWT
DROP POLICY IF EXISTS "Authenticated users can insert media assets" ON media_assets;
CREATE POLICY "Users with valid JWT can insert media assets"
  ON media_assets
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE Policy - Allow anon role with valid JWT
DROP POLICY IF EXISTS "Authenticated users can update media assets" ON media_assets;
CREATE POLICY "Users with valid JWT can update media assets"
  ON media_assets
  FOR UPDATE
  TO public
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Verify policies
SELECT
  policyname,
  roles,
  cmd,
  CASE
    WHEN qual IS NULL THEN 'NULL'
    ELSE substring(qual from 1 for 50)
  END as qual_preview,
  CASE
    WHEN with_check IS NULL THEN 'NULL'
    ELSE substring(with_check from 1 for 50)
  END as with_check_preview
FROM pg_policies
WHERE tablename = 'media_assets'
ORDER BY cmd, policyname;
