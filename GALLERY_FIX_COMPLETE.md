# Gallery Display Fix - Complete Guide

## Status: Post Creation ✅ | Gallery Display ❌ → ✅

### What Was Fixed

#### Problem 1: Post Creation (RESOLVED)
- RLS policies were blocking INSERT operations
- Fixed by changing `TO authenticated` → `TO public` with `auth.uid() IS NOT NULL` checks
- **Result:** Posts now create successfully ✅

#### Problem 2: Gallery Display (NEEDS FIX)
- Public posts not showing in Explore page gallery
- `getPublicPosts` returns count: 0 even though posts exist
- **Cause:** SELECT policy requires `auth.uid() IS NOT NULL`, but gallery loads without JWT

### Root Cause Analysis

The Explore page fetches posts using:
```javascript
const response = await api.get('/posts/public');
```

This creates an **anon client WITHOUT a JWT**:
```javascript
const sb = supa(env); // No JWT passed
```

Current SELECT policy:
```sql
CREATE POLICY "Public posts are readable by all users"
  ON posts FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL AND  -- ❌ This blocks unauthenticated users!
    visibility = 'public' AND status = 'published'
  );
```

The `auth.uid() IS NOT NULL` check fails because there's no JWT, so the query returns 0 posts.

### The Solution

We need TWO separate SELECT policies for posts:

1. **Public Posts** - Readable by ANYONE (no JWT required)
2. **Own Posts** - Readable by owner (JWT required)

```sql
-- Policy 1: Public posts (no auth needed)
CREATE POLICY "Public published posts readable by anyone"
  ON posts FOR SELECT
  TO public
  USING (visibility = 'public' AND status = 'published');

-- Policy 2: Own posts (auth needed)
CREATE POLICY "Users can read own posts"
  ON posts FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL AND
    owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );
```

### How to Apply

1. Go to Supabase Dashboard SQL Editor
2. Copy contents of `fix_public_post_reading.sql`
3. Paste and run
4. Refresh the Explore page

### What Gets Updated

| Table | Change |
|-------|--------|
| `posts` | Split SELECT into 2 policies (public + own) |
| `post_meta` | Allow reading for public posts without JWT |
| `post_subjects` | Allow reading for public posts without JWT |
| `post_styles` | Allow reading for public posts without JWT |
| `post_tags` | Allow reading for public posts without JWT |
| `sref_codes` | Allow reading for public posts without JWT |

### Expected Behavior After Fix

**Unauthenticated Users:**
- ✅ Can view Explore page gallery
- ✅ Can see all public posts
- ✅ Can view post details (image + analysis)
- ❌ Cannot create posts (still requires JWT)

**Authenticated Users:**
- ✅ Can view Explore page gallery
- ✅ Can see all public posts + their own posts
- ✅ Can create new posts
- ✅ Can edit/delete their own posts

### Verification Steps

After applying the SQL:

1. **Open Explore page without logging in**
   - Should see gallery with posts
   - Count should be > 0

2. **Check browser console**
   ```
   Posts loaded: { count: 1 }  // or however many posts exist
   ```

3. **Click on a post**
   - Should show full image
   - Should show analysis/details

4. **Check worker logs**
   ```
   [getPublicPosts] Enriched query success, count: 1
   ```

### Security Model

**Before:**
- Public posts: Blocked for unauthenticated users ❌
- Own posts: Accessible with JWT ✅

**After:**
- Public posts: Accessible to everyone ✅
- Own posts: Accessible with JWT ✅
- Private posts: Never accessible without ownership ✅

### Files in This Fix

- `fix_public_post_reading.sql` - SQL migration to fix gallery display
- `GALLERY_FIX_COMPLETE.md` - This documentation
- `fix_all_rls_policies_for_anon_role.sql` - Previous fix for post creation

### Summary

1. ✅ Applied `fix_all_rls_policies_for_anon_role.sql` - Fixed post creation
2. ⏳ Apply `fix_public_post_reading.sql` - Will fix gallery display
3. ✅ Build passed

Once step 2 is complete, the full flow will work:
- Decode image → Create post → Post appears in gallery → Click to view details
