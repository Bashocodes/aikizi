# RLS Policy Fix for Post Creation

## Problem
Users cannot create posts because the `media_assets` table and related tables are missing INSERT/UPDATE/DELETE policies.

Error seen:
```
new row violates row-level security policy for table "media_assets"
```

## Root Cause
The migration `002_media_and_posts.sql` only created SELECT policies but not INSERT/UPDATE/DELETE policies for:
- `media_assets` - No INSERT policy
- `posts` - No INSERT/UPDATE/DELETE policies
- `post_meta`, `post_subjects`, `post_styles`, `post_tags` - No write policies
- `sref_codes` - No INSERT/UPDATE policies
- `sref_unlocks` - No INSERT policy

## Solution
A new migration file has been created: `supabase_migrations/010_add_insert_policies_for_posts.sql`

### To Apply the Migration

You need to run this SQL against your Supabase database. You have two options:

#### Option 1: Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql
2. Copy the contents of `supabase_migrations/010_add_insert_policies_for_posts.sql`
3. Paste into the SQL editor
4. Click "Run"

#### Option 2: Supabase CLI (if available)
```bash
# If you have supabase CLI installed locally
supabase db push
```

#### Option 3: psql (if you have direct database access)
```bash
psql "$SUPABASE_DB_URL" < supabase_migrations/010_add_insert_policies_for_posts.sql
```

## What the Migration Does

### 1. Media Assets
- ✅ Allows any authenticated user to insert media assets (CDN-backed, publicly readable)

### 2. Posts
- ✅ Users can INSERT posts they own
- ✅ Users can UPDATE their own posts
- ✅ Users can DELETE their own posts

### 3. Post Metadata
- ✅ Users can INSERT/UPDATE/DELETE `post_meta` for their own posts
- ✅ Users can INSERT/DELETE `post_subjects`, `post_styles`, `post_tags` for their own posts

### 4. SREF Codes
- ✅ Users can INSERT/UPDATE `sref_codes` for their own posts
- ✅ Users can INSERT `sref_unlocks` for themselves

## Verification

After applying the migration, test by creating a post:

```bash
# The /v1/posts/create endpoint should now work
curl -X POST https://aikizi.xyz/v1/posts/create \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Post",
    "imageUrl": "https://example.com/image.jpg",
    "prompt": "Test prompt"
  }'
```

Expected logs:
```
[reqId] [createPost] userId=... authJwt=true
[reqId] [createPost] Media asset created: ...
[reqId] [createPost] Post created: ...
[reqId] Response: 200
```

## Security Notes

All policies verify ownership through:
```sql
owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
```

This ensures:
- Users can only modify their own posts
- RLS uses the JWT's `sub` claim (via `auth.uid()`) to verify identity
- Post metadata is scoped to post ownership
