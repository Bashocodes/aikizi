## RLS Policy Fix: Anon Role with JWT

### Problem Identified

The post creation is failing even after adding INSERT policies because of how the Supabase client handles authentication:

**How It Works:**
1. We create a Supabase client using `createClient(url, ANON_KEY, { global: { headers: { Authorization: 'Bearer JWT' }}})`
2. The client uses the **ANON_KEY** which means Postgres sees the role as `anon`
3. The JWT is validated and `auth.uid()` works correctly
4. **BUT** policies with `TO authenticated` don't apply because the role is `anon`, not `authenticated`

**Error:**
```
new row violates row-level security policy for table "media_assets"
```

### Root Cause

All our RLS policies use `TO authenticated`:
```sql
CREATE POLICY "..." ON media_assets
  FOR INSERT
  TO authenticated  -- ❌ This doesn't match 'anon' role
  WITH CHECK (true);
```

When using ANON_KEY + JWT, the request comes from the `anon` role, so these policies don't apply!

### Solution

Change all policies from `TO authenticated` to `TO public` and verify JWT with `auth.uid() IS NOT NULL`:

```sql
CREATE POLICY "..." ON media_assets
  FOR INSERT
  TO public  -- ✅ Includes both anon and authenticated roles
  WITH CHECK (auth.uid() IS NOT NULL);  -- Still requires valid JWT
```

### How to Apply the Fix

#### Option 1: Supabase Dashboard (Recommended)

1. Open Supabase Dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
2. Copy the entire contents of `fix_all_rls_policies_for_anon_role.sql`
3. Paste into the SQL editor
4. Click "Run"
5. Verify the output shows all policies were created

#### Option 2: psql Command Line

```bash
psql "$SUPABASE_DB_URL" < fix_all_rls_policies_for_anon_role.sql
```

### What Gets Fixed

The migration updates RLS policies for all tables:

| Table | Changes |
|-------|---------|
| `media_assets` | SELECT, INSERT, UPDATE policies now work with anon+JWT |
| `posts` | SELECT, INSERT, UPDATE, DELETE policies now work with anon+JWT |
| `post_meta` | SELECT, INSERT, UPDATE, DELETE policies now work with anon+JWT |
| `post_subjects` | SELECT, INSERT, DELETE policies now work with anon+JWT |
| `post_styles` | SELECT, INSERT, DELETE policies now work with anon+JWT |
| `post_tags` | SELECT, INSERT, DELETE policies now work with anon+JWT |
| `sref_codes` | SELECT, INSERT, UPDATE policies now work with anon+JWT |
| `sref_unlocks` | SELECT, INSERT policies now work with anon+JWT |
| `bookmarks` | ALL operations now work with anon+JWT |
| `likes` | ALL operations now work with anon+JWT |

### Security Model

**Before:**
- Policies: `TO authenticated`
- Result: Requests with anon+JWT were blocked

**After:**
- Policies: `TO public WITH CHECK (auth.uid() IS NOT NULL)`
- Result: Any role (anon or authenticated) can perform operations IF they have a valid JWT
- Security: `auth.uid() IS NOT NULL` ensures JWT is present and valid
- Ownership: Policies still check `owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)`

### Verification

After applying the fix, test post creation:

```bash
curl -X POST https://aikizi.xyz/v1/posts/create \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "analysis_text": "{\"subjects\":[\"test\"]}",
    "title": "Test Post"
  }'
```

**Expected logs:**
```
[reqId] [createPost] userId=7a550b5c-... authJwt=true
[supa] Creating client with user token for RLS
[reqId] [createPost] Media asset created successfully
[reqId] [createPost] Post created: post-slug-here
[reqId] Response: 200
```

### Why This Happens

The Supabase JavaScript client has two ways to authenticate:

**Method 1: Session-based (true authenticated role)**
```javascript
const client = createClient(url, anonKey);
await client.auth.signInWithPassword({ email, password });
// Now queries use 'authenticated' role
```

**Method 2: Header-based (still anon role)**
```javascript
const client = createClient(url, anonKey, {
  global: { headers: { Authorization: 'Bearer JWT' }}
});
// Queries still use 'anon' role, but auth.uid() works
```

We use Method 2 in Cloudflare Workers because we can't maintain sessions. This means we need policies that work with the `anon` role.

### Alternative Solution (Not Recommended)

Instead of changing policies, we could use SERVICE_ROLE_KEY:

```javascript
// ❌ Not recommended - bypasses all RLS
const client = createClient(url, serviceRoleKey);
```

This bypasses RLS entirely, which is insecure. Our solution maintains RLS security while working with the anon role.

### Files in This Fix

- `fix_all_rls_policies_for_anon_role.sql` - Complete migration to fix all tables
- `FIX_RLS_FOR_ANON_ROLE.md` - This documentation
- `verify_rls_policies.sql` - Query to check current policies (diagnostic)
