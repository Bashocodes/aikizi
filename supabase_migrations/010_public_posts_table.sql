/*
  # Public Posts Table for Decoded Images

  This migration creates a simplified table for publishing decoded images to the public gallery.

  1. New Tables
    - `public_posts` - Stores publicly shared decoded images with AI analysis
      - `id` (uuid, primary key) - Unique post identifier
      - `user_id` (uuid) - References users table, the post owner
      - `cf_image_id` (text) - Cloudflare Images ID for the uploaded image
      - `analysis` (text) - AI-generated analysis text from decode
      - `visibility` (text) - Defaults to 'public'
      - `created_at` (timestamptz) - Post creation timestamp

  2. Security
    - Enable RLS on public_posts table
    - Anyone authenticated can read posts with visibility='public'
    - Only the owner can insert their own posts
    - Only the owner can update/delete their own posts

  3. Indexes
    - Index on user_id for fast user profile queries
    - Index on created_at for recent posts sorting
    - Index on visibility for filtering public posts
*/

-- Create public_posts table
CREATE TABLE IF NOT EXISTS public_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cf_image_id text NOT NULL,
  analysis text,
  visibility text DEFAULT 'public',
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_public_posts_user_id ON public_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_public_posts_created_at ON public_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_posts_visibility ON public_posts(visibility);

-- Enable RLS
ALTER TABLE public_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Anyone can read public posts" ON public_posts;
CREATE POLICY "Anyone can read public posts"
  ON public_posts FOR SELECT
  TO authenticated
  USING (visibility = 'public');

DROP POLICY IF EXISTS "Users can read own posts" ON public_posts;
CREATE POLICY "Users can read own posts"
  ON public_posts FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can insert own posts" ON public_posts;
CREATE POLICY "Users can insert own posts"
  ON public_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can update own posts" ON public_posts;
CREATE POLICY "Users can update own posts"
  ON public_posts FOR UPDATE
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

DROP POLICY IF EXISTS "Users can delete own posts" ON public_posts;
CREATE POLICY "Users can delete own posts"
  ON public_posts FOR DELETE
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
