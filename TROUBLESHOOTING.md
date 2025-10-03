# AIKIZI Troubleshooting Guide

## Problem: Published Posts Not Appearing on Explore Page

You mentioned: "I can't see the output after publishing and why is Supabase having all the data but from your end I don't see the integrated to the Supabase database"

This is a common issue with several possible causes. Let's diagnose and fix it step by step.

### Diagnosis: Where is the Data?

First, let's verify the data is actually in Supabase:

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Navigate to **Table Editor**
3. Check the `posts` table - do you see your published posts?
4. Check the `post_styles` table - do you see corresponding entries?
5. Check the `media_assets` table - do you see the images?

**If you see data in all these tables**, the publishing is working! The issue is with **displaying** the data, not saving it.

**If you DON'T see data**, the issue is with the publishing function itself.

---

## Solution 1: Missing Environment Variables (Most Common)

The Netlify functions need specific environment variables to connect to Supabase. Without them, publishing will fail silently.

### Check Environment Variables in Netlify

1. Go to your Netlify site dashboard
2. Navigate to **Site settings > Environment variables**
3. Verify these variables exist:
   - `VITE_SUPABASE_URL` - Should be `https://xxxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` - Should start with `eyJ`
   - `SUPABASE_SERVICE_ROLE` - Should start with `eyJ` (different from anon key!)
   - `GEMINI_API_KEY` - Your Google Gemini API key

### How to Add Missing Variables

1. In Netlify Dashboard, go to **Site settings > Environment variables**
2. Click "Add a variable"
3. Enter the key (e.g., `SUPABASE_SERVICE_ROLE`)
4. Enter the value (get from Supabase Dashboard > Settings > API)
5. Set scope to "All deploy contexts" or "Production"
6. Click "Create variable"
7. **Trigger a new deployment** after adding all variables

### Get Your Service Role Key

The `SUPABASE_SERVICE_ROLE` key is **critical** and different from the anon key:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings > API**
4. Scroll to "Project API keys"
5. Find **service_role** (NOT anon!)
6. Click "Reveal" and copy the full key
7. Add it to Netlify as `SUPABASE_SERVICE_ROLE`

**IMPORTANT**: Never expose the service role key in client-side code or commit it to Git!

---

## Solution 2: Row Level Security (RLS) Policies

Even if data is in Supabase, RLS policies might be blocking access.

### Check RLS Policies

1. Go to Supabase Dashboard > **Authentication > Policies**
2. Find the `posts` table
3. You should see these policies:
   - "Public posts are readable by all authenticated users"
   - "Users can read own posts"

### Test RLS Policies

Run this query in Supabase SQL Editor:

```sql
-- This should return posts visible to authenticated users
SELECT
  p.id,
  p.title,
  p.slug,
  p.visibility,
  p.status,
  ps.style_triplet,
  ma.variants
FROM posts p
LEFT JOIN post_styles ps ON ps.post_id = p.id
LEFT JOIN media_assets ma ON ma.id = p.image_id
WHERE p.visibility = 'public' AND p.status = 'published'
ORDER BY p.created_at DESC;
```

**If this returns no results**, you have one of these issues:
- No posts have been published with `visibility='public'` and `status='published'`
- Data is in the wrong format
- Foreign key relationships are broken

**If this returns results**, the data is fine and the issue is with the frontend query or RLS.

### Fix RLS Policy If Needed

If you're missing the policy, add it:

```sql
-- Allow all authenticated users to read public posts
CREATE POLICY "Public posts are readable by all authenticated users"
  ON posts FOR SELECT
  TO authenticated
  USING (visibility = 'public' AND status = 'published');

-- Same for related tables
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

CREATE POLICY "Media assets readable by all authenticated users"
  ON media_assets FOR SELECT
  TO authenticated
  USING (true);
```

---

## Solution 3: User Role Not Set to Publisher

To publish posts, your user must have the `publisher` or `admin` role.

### Check Your User Role

```sql
-- Replace 'your-email@example.com' with your actual email
SELECT u.id, u.role, au.email
FROM users u
JOIN auth.users au ON au.id::text = u.auth_id
WHERE au.email = 'your-email@example.com';
```

**If role is 'viewer'**, update it:

```sql
-- Replace 'your-email@example.com' with your actual email
UPDATE users
SET role = 'publisher'
WHERE auth_id IN (
  SELECT id::text FROM auth.users WHERE email = 'your-email@example.com'
);
```

---

## Solution 4: Frontend Query Issues

The ExplorePage might be using an incorrect query format.

### Check Browser Console

1. Open your deployed site
2. Press F12 to open Developer Tools
3. Go to the Console tab
4. Navigate to the Explore page
5. Look for these log messages:
   - "Fetching posts from Supabase..."
   - "Supabase response: ..."

**If you see errors**, they'll tell you exactly what's wrong.

### Common Query Errors

**Error**: "relation 'media_assets' does not exist"
- **Cause**: Foreign key hint is wrong
- **Fix**: Already fixed in the updated code

**Error**: "permission denied for table posts"
- **Cause**: RLS policy blocking access
- **Fix**: See Solution 2 above

**Error**: "null value in column 'image_id'"
- **Cause**: Media asset wasn't created properly
- **Fix**: Check the publish function logs in Netlify

---

## Solution 5: Debugging the Publish Flow

Let's trace the entire publishing flow:

### Step 1: Check Function Logs in Netlify

1. Go to Netlify Dashboard > **Functions**
2. Click on `publish-post`
3. Click on **Logs** tab
4. Look for error messages when you publish

**Common errors you might see**:
- "Missing required environment variables" → Go to Solution 1
- "User not found" → Your user record wasn't created properly
- "Only publishers can create posts" → Go to Solution 3
- "Failed to create media asset" → Database issue, check RLS on media_assets

### Step 2: Test the Publish Function Directly

You can test the function using curl:

```bash
# Get your access token from browser localStorage
# Then run:
curl -X POST https://your-site.netlify.app/.netlify/functions/publish-post \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "title": "Test Post",
    "slug": "test-post-123",
    "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "style_triplet": "Test • Style • Triplet",
    "style_tags": [],
    "subjects": ["test"],
    "tags": ["test"]
  }'
```

---

## Solution 6: Database Schema Verification

Ensure your database schema matches the expected structure:

```sql
-- Check that all required tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check that RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Check foreign key relationships
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

---

## Quick Checklist

Use this checklist to diagnose the issue:

- [ ] Environment variables set in Netlify (especially `SUPABASE_SERVICE_ROLE`)
- [ ] User has publisher or admin role
- [ ] RLS policies allow reading public posts
- [ ] RLS policies allow reading post_styles for public posts
- [ ] RLS policies allow reading media_assets
- [ ] Database schema matches DATABASE_SETUP.md
- [ ] Foreign key relationships are correct
- [ ] Posts table has entries with visibility='public' and status='published'
- [ ] Browser console shows no errors
- [ ] Netlify function logs show no errors

---

## Still Having Issues?

If you've tried all the above and still can't see posts:

1. **Check the exact error message** in:
   - Browser console (F12 > Console)
   - Netlify function logs
   - Supabase logs (Dashboard > Logs)

2. **Verify the data flow**:
   - Open browser DevTools > Network tab
   - Try publishing a post
   - Check the request to `/.netlify/functions/publish-post`
   - Check the response - is it successful (200) or error (500)?
   - Navigate to Explore page
   - Check the Supabase query in Network tab
   - Look at the response - does it have data?

3. **Test authentication**:
   ```sql
   -- Check if you're properly authenticated
   SELECT auth.uid(), current_user;
   ```

4. **Create a test post directly in Supabase**:
   - Go to Table Editor > posts
   - Click "Insert row"
   - Fill in all required fields manually
   - Check if it appears on Explore page
   - If YES: Publishing function is the issue
   - If NO: Frontend query or RLS is the issue

---

## Contact for Help

If you're still stuck, gather this information:

1. Screenshot of Netlify environment variables (hide the actual values!)
2. Screenshot of Supabase Table Editor showing posts table
3. Screenshot of browser console errors
4. Screenshot of Netlify function logs
5. Result of the SQL query in "Test RLS Policies" section

This will help diagnose the exact issue.
