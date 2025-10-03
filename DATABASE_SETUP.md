# AIKIZI Database Setup Guide

The Supabase database connection is available but requires the schema to be created. Follow these steps to set up the database:

## Database Schema Creation

You'll need to run the following SQL migrations in your Supabase SQL Editor to create all required tables, indexes, and Row Level Security policies.

### Step 1: Create Users and Authentication Tables

```sql
/*
  # Initial User and Authentication Schema

  1. New Tables
    - users (id, auth_id, role, created_at)
    - profiles (user_id, handle, display_name, avatar_url, bio, is_public)
    - plans (id, name, tokens_granted)
    - entitlements (user_id, plan_id, tokens_balance)
    - transactions (id, user_id, kind, amount, ref, created_at)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users

  3. Indexes
    - Index on users.auth_id, profiles.handle, transactions.user_id
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz DEFAULT now()
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  bio text,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create plans table
CREATE TABLE IF NOT EXISTS plans (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  tokens_granted int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create entitlements table
CREATE TABLE IF NOT EXISTS entitlements (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id int REFERENCES plans(id),
  tokens_balance int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount int NOT NULL,
  ref jsonb,
  created_at timestamptz DEFAULT now()
);

-- Insert default plans
INSERT INTO plans (name, tokens_granted)
VALUES ('free', 1000), ('pro', 10000)
ON CONFLICT (name) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid()::text = auth_id OR EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin'
  ));

-- Profiles policies
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

CREATE POLICY "Public profiles are readable by all authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Plans policies
CREATE POLICY "Plans are readable by all authenticated users"
  ON plans FOR SELECT
  TO authenticated
  USING (true);

-- Entitlements policies
CREATE POLICY "Users can read own entitlements"
  ON entitlements FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );

-- Transactions policies
CREATE POLICY "Users can read own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin')
  );
```

### Step 2: Create Media and Posts Tables

```sql
/*
  # Media and Posts Schema

  1. New Tables
    - media_assets (id, provider, public_id, width, height, bytes, variants)
    - posts (id, owner_id, title, slug, image_id, visibility, status)
    - post_meta (post_id, prompt_full, prompt_short, mj_version, model_used, alt_text)
    - post_subjects (post_id, subject_slug)
    - post_styles (post_id, style_triplet, artist_oneword, style_tags)
    - post_tags (post_id, tag)
    - sref_codes (post_id, locked, price_tokens, code_encrypted)
    - sref_unlocks (user_id, post_id)
    - bookmarks (user_id, post_id)
    - likes (user_id, post_id)

  2. Security
    - Enable RLS on all tables
    - Posts readable by all authenticated (if public)
    - Only owner can modify their posts

  3. Indexes
    - GIN indexes on post_subjects, post_styles, post_tags
    - BTREE unique index on posts.slug
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
CREATE POLICY "Public posts are readable by all authenticated users"
  ON posts FOR SELECT
  TO authenticated
  USING (visibility = 'public' AND status = 'published');

CREATE POLICY "Users can read own posts"
  ON posts FOR SELECT
  TO authenticated
  USING (owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Post_meta policies
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
CREATE POLICY "Users can read own SREF unlocks"
  ON sref_unlocks FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Bookmarks policies
CREATE POLICY "Users can manage own bookmarks"
  ON bookmarks FOR ALL
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Likes policies
CREATE POLICY "Users can manage own likes"
  ON likes FOR ALL
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Media assets policies
CREATE POLICY "Media assets readable by all authenticated users"
  ON media_assets FOR SELECT
  TO authenticated
  USING (true);
```

### Step 3: Create Decodes and Audit Tables

```sql
/*
  # Decodes and Audit Schema

  1. New Tables
    - decodes (id, user_id, input_media_id, model, raw_json, normalized_json, cost_tokens, private)
    - audit_logs (id, actor_id, action, target)

  2. Security
    - Decodes readable only by owner
    - Audit logs readable by admins

  3. Indexes
    - Index on decodes.user_id
*/

-- Create decodes table
CREATE TABLE IF NOT EXISTS decodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  input_media_id uuid REFERENCES media_assets(id),
  model text NOT NULL,
  raw_json jsonb NOT NULL,
  normalized_json jsonb NOT NULL,
  cost_tokens int NOT NULL,
  private boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_decodes_user_id ON decodes(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);

-- Enable RLS
ALTER TABLE decodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Decodes policies
CREATE POLICY "Users can read own decodes"
  ON decodes FOR SELECT
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));

-- Audit logs policies
CREATE POLICY "Admins can read all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin'));
```

### Step 4: Configure Google OAuth

1. Go to Authentication > Providers in your Supabase dashboard
2. Enable Google provider
3. Add your Google OAuth Client ID and Secret
4. Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`

### Step 5: Create Initial User Function (Optional)

This function auto-creates user records when someone signs in:

```sql
-- Function to create user record on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_id, role)
  VALUES (new.id, 'viewer');

  INSERT INTO public.profiles (user_id, handle, is_public)
  VALUES (
    (SELECT id FROM public.users WHERE auth_id = new.id),
    COALESCE(new.raw_user_meta_data->>'handle', 'user' || substr(new.id::text, 1, 8)),
    false
  );

  INSERT INTO public.entitlements (user_id, plan_id, tokens_balance)
  VALUES (
    (SELECT id FROM public.users WHERE auth_id = new.id),
    (SELECT id FROM public.plans WHERE name = 'free'),
    1000
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function on user sign up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Verification

After running all migrations, verify:

1. All tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
2. RLS is enabled on all tables: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;`
3. Plans are seeded: `SELECT * FROM plans;`

## Next Steps

Once the database is set up:
1. Configure Google OAuth in Supabase dashboard
2. Add environment variables to Netlify (see netlify/functions/README.md)
3. Test authentication flow by signing in
4. Verify token grants work correctly
