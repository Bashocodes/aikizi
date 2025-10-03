/*
  # Media and Posts Schema

  This migration creates tables for media assets, posts, and all related metadata.

  1. New Tables
    - `media_assets` - Stores media files (images) with provider info and variants
    - `posts` - Main posts table with title, slug, visibility, status
    - `post_meta` - Post metadata (prompts, model info, alt text)
    - `post_subjects` - Post subject tags (many-to-many)
    - `post_styles` - Post style information (many-to-many)
    - `post_tags` - General post tags (many-to-many)
    - `sref_codes` - Style reference codes that can be locked/unlocked
    - `sref_unlocks` - Tracks which users unlocked which posts
    - `bookmarks` - User bookmarks of posts
    - `likes` - User likes of posts

  2. Security
    - Enable RLS on all tables
    - Public posts readable by all authenticated users
    - Users can read their own posts regardless of visibility
    - Post metadata readable with post access
    - Users can manage their own bookmarks and likes

  3. Indexes
    - Unique index on posts.slug for fast lookups
    - Indexes on post_subjects, post_styles, post_tags for filtering
*/

-- Create media_assets table
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  public_id text NOT NULL,
  width int NOT NULL,
  height int NOT NULL,
  bytes int NOT NULL,
  variants jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  image_id uuid REFERENCES media_assets(id),
  visibility text DEFAULT 'public',
  status text DEFAULT 'published',
  created_at timestamptz DEFAULT now()
);

-- Create post_meta table
CREATE TABLE IF NOT EXISTS post_meta (
  post_id uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  prompt_full text,
  prompt_short text,
  mj_version text,
  model_used text,
  alt_text text
);

-- Create post_subjects table
CREATE TABLE IF NOT EXISTS post_subjects (
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  subject_slug text NOT NULL,
  PRIMARY KEY (post_id, subject_slug)
);

-- Create post_styles table
CREATE TABLE IF NOT EXISTS post_styles (
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  style_triplet text NOT NULL,
  artist_oneword text,
  style_tags text[] DEFAULT '{}',
  PRIMARY KEY (post_id, style_triplet)
);

-- Create post_tags table
CREATE TABLE IF NOT EXISTS post_tags (
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  tag text NOT NULL,
  PRIMARY KEY (post_id, tag)
);

-- Create sref_codes table
CREATE TABLE IF NOT EXISTS sref_codes (
  post_id uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  locked boolean DEFAULT true,
  price_tokens int DEFAULT 1,
  code_encrypted text
);

-- Create sref_unlocks table
CREATE TABLE IF NOT EXISTS sref_unlocks (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- Create bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- Create likes table
CREATE TABLE IF NOT EXISTS likes (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_post_subjects_slug ON post_subjects(subject_slug);
CREATE INDEX IF NOT EXISTS idx_post_styles_triplet ON post_styles(style_triplet);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);

-- Enable RLS
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE sref_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sref_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Posts policies
DROP POLICY IF EXISTS "Public posts are readable by all authenticated users" ON posts;
CREATE POLICY "Public posts are readable by all authenticated users"
  ON posts FOR SELECT
  TO authenticated
  USING (visibility = 'public' AND status = 'published');

DROP POLICY IF EXISTS "Users can read own posts" ON posts;
CREATE POLICY "Users can read own posts"
  ON posts FOR SELECT
  TO authenticated
  USING (owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Post_meta policies
DROP POLICY IF EXISTS "Post meta readable with post" ON post_meta;
CREATE POLICY "Post meta readable with post"
  ON post_meta FOR SELECT
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post_subjects policies
DROP POLICY IF EXISTS "Post subjects readable with post" ON post_subjects;
CREATE POLICY "Post subjects readable with post"
  ON post_subjects FOR SELECT
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post_styles policies
DROP POLICY IF EXISTS "Post styles readable with post" ON post_styles;
CREATE POLICY "Post styles readable with post"
  ON post_styles FOR SELECT
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- Post_tags policies
DROP POLICY IF EXISTS "Post tags readable with post" ON post_tags;
CREATE POLICY "Post tags readable with post"
  ON post_tags FOR SELECT
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- SREF codes policies
DROP POLICY IF EXISTS "SREF codes readable with post" ON sref_codes;
CREATE POLICY "SREF codes readable with post"
  ON sref_codes FOR SELECT
  TO authenticated
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE (visibility = 'public' AND status = 'published')
      OR owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    )
  );

-- SREF unlocks policies
DROP POLICY IF EXISTS "Users can read own SREF unlocks" ON sref_unlocks;
CREATE POLICY "Users can read own SREF unlocks"
  ON sref_unlocks FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Bookmarks policies
DROP POLICY IF EXISTS "Users can manage own bookmarks" ON bookmarks;
CREATE POLICY "Users can manage own bookmarks"
  ON bookmarks FOR ALL
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Likes policies
DROP POLICY IF EXISTS "Users can manage own likes" ON likes;
CREATE POLICY "Users can manage own likes"
  ON likes FOR ALL
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Media assets policies
DROP POLICY IF EXISTS "Media assets readable by all authenticated users" ON media_assets;
CREATE POLICY "Media assets readable by all authenticated users"
  ON media_assets FOR SELECT
  TO authenticated
  USING (true);
