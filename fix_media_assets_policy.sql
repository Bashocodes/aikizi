-- Fix media_assets INSERT policy
-- The issue: WITH CHECK (true) might not work with RLS + JWT auth
-- Solution: Explicitly allow authenticated role

-- Drop the existing policy if it exists
DROP POLICY IF EXISTS "Authenticated users can insert media assets" ON media_assets;

-- Create a new policy that explicitly checks for authenticated role
CREATE POLICY "Authenticated users can insert media assets"
  ON media_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also add an UPDATE policy in case it's needed
DROP POLICY IF EXISTS "Authenticated users can update media assets" ON media_assets;
CREATE POLICY "Authenticated users can update media assets"
  ON media_assets
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify the policy was created
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'media_assets'
ORDER BY policyname;
