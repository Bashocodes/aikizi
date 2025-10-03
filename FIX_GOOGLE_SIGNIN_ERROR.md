# FIX: Google Sign-In "Database Error Saving New User"

## THE PROBLEM

When you click "Sign in with Google" on https://www.aikizi.xyz, you get this error:
```
error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user
```

**Root Cause:** Your Supabase database is missing the trigger function that creates user records when someone authenticates. Without this trigger, Google OAuth fails.

---

## THE SOLUTION: Run These SQL Migrations

### Step 1: Open Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/qdknlxmksutvskhzjcca/sql/new

### Step 2: Run Migration Files (In Order)

Run each SQL file in the `supabase_migrations/` directory in your project:

#### ✅ Migration 1: Users and Authentication Tables
**File:** `supabase_migrations/001_users_and_auth.sql`

This creates:
- `users` table (links to auth.users)
- `profiles` table (user profiles)
- `plans` table (free and pro plans)
- `entitlements` table (user token balances)
- `transactions` table (token transaction history)
- All RLS policies for security

**How to run:**
1. Copy the entire contents of `001_users_and_auth.sql`
2. Paste into Supabase SQL Editor
3. Click "Run"
4. Verify: Should see "Success. No rows returned"

---

#### ✅ Migration 2: Media and Posts Tables
**File:** `supabase_migrations/002_media_and_posts.sql`

This creates:
- `media_assets` table (images)
- `posts` table (main posts)
- `post_meta`, `post_subjects`, `post_styles`, `post_tags` (post metadata)
- `sref_codes`, `sref_unlocks` (style reference codes)
- `bookmarks`, `likes` (user interactions)
- All RLS policies for posts

**How to run:**
1. Copy the entire contents of `002_media_and_posts.sql`
2. Paste into Supabase SQL Editor
3. Click "Run"
4. Verify: Should see "Success. No rows returned"

---

#### ✅ Migration 3: Decodes and Audit Tables
**File:** `supabase_migrations/003_decodes_and_audit.sql`

This creates:
- `decodes` table (image analysis results)
- `audit_logs` table (admin audit logs)
- RLS policies

**How to run:**
1. Copy the entire contents of `003_decodes_and_audit.sql`
2. Paste into Supabase SQL Editor
3. Click "Run"
4. Verify: Should see "Success. No rows returned"

---

#### 🔥 Migration 4: Handle New User Trigger (CRITICAL!)
**File:** `supabase_migrations/004_handle_new_user_trigger.sql`

**THIS IS THE MOST IMPORTANT MIGRATION - IT FIXES THE GOOGLE SIGN-IN ERROR!**

This creates:
- `handle_new_user()` function
- Trigger on `auth.users` table that fires when someone signs in
- Automatically creates user, profile, and entitlement records

**How to run:**
1. Copy the entire contents of `004_handle_new_user_trigger.sql`
2. Paste into Supabase SQL Editor
3. Click "Run"
4. Verify: Should see "Success. No rows returned"

---

### Step 3: Verify Database Setup

Run this query in Supabase SQL Editor to verify all tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see these tables:
- audit_logs
- bookmarks
- decodes
- entitlements
- likes
- media_assets
- plans
- post_meta
- post_styles
- post_subjects
- post_tags
- posts
- profiles
- sref_codes
- sref_unlocks
- transactions
- users

**Verify the trigger exists:**
```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

You should see: `on_auth_user_created` on `auth.users`

---

## NEXT: Configure Google OAuth

### Step 1: Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Go to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client ID"
5. Application type: "Web application"
6. Add these authorized redirect URIs:
   - `https://qdknlxmksutvskhzjcca.supabase.co/auth/v1/callback`
   - `http://localhost:5173/auth/v1/callback` (for local dev)
7. Copy the Client ID and Client Secret

### Step 2: Configure in Supabase

1. Go to: https://supabase.com/dashboard/project/qdknlxmksutvskhzjcca/auth/providers
2. Find "Google" provider
3. Enable it
4. Paste your Google Client ID
5. Paste your Google Client Secret
6. Click "Save"

### Step 3: Set Site URL

1. Go to: https://supabase.com/dashboard/project/qdknlxmksutvskhzjcca/auth/url-configuration
2. Set "Site URL" to: `https://www.aikizi.xyz`
3. Add redirect URLs:
   - `https://www.aikizi.xyz/explore`
   - `https://www.aikizi.xyz`
4. Click "Save"

---

## NEXT: Update Environment Variables

### Local Development (.env file)

Your `.env` file has been updated with placeholders. Get your actual keys:

1. Go to: https://supabase.com/dashboard/project/qdknlxmksutvskhzjcca/settings/api
2. Copy these values:
   - **Project URL** → Replace `VITE_SUPABASE_URL`
   - **anon public** key → Replace `VITE_SUPABASE_ANON_KEY`
   - **service_role** key → Replace `SUPABASE_SERVICE_ROLE` (keep secret!)

Your `.env` should look like:
```env
VITE_SUPABASE_URL=https://qdknlxmksutvskhzjcca.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Netlify Production Environment

1. Go to: https://app.netlify.com/sites/YOUR_SITE/settings/env
2. Delete ALL incorrectly named variables (anything with spaces or "Bolt Database")
3. Add THREE new environment variables:

**Variable 1:**
- Key: `VITE_SUPABASE_URL`
- Value: `https://qdknlxmksutvskhzjcca.supabase.co`
- Secret: No

**Variable 2:**
- Key: `VITE_SUPABASE_ANON_KEY`
- Value: [Paste your anon key from Supabase]
- Secret: No

**Variable 3:**
- Key: `SUPABASE_SERVICE_ROLE`
- Value: [Paste your service_role key from Supabase]
- Secret: **YES** (check the box!)

4. Click "Save"
5. Trigger a new deployment

---

## TEST THE FIX

### Test 1: Try Google Sign-In

1. Go to https://www.aikizi.xyz
2. Click "Sign in with Google"
3. Select your Google account
4. Should redirect to `/explore` page successfully
5. No more error in the URL!

### Test 2: Verify User Created

1. Go to Supabase SQL Editor
2. Run this query:
```sql
SELECT u.id, u.auth_id, u.role, p.handle, e.tokens_balance
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
LEFT JOIN entitlements e ON e.user_id = u.id;
```

3. You should see your user record with:
   - A unique ID
   - Your auth_id from Google
   - Role: 'viewer'
   - A handle (auto-generated)
   - Token balance: 1000

### Test 3: Check Auth State

1. Open browser console on https://www.aikizi.xyz
2. Check if you're logged in
3. Your profile data should be visible in the UI

---

## TROUBLESHOOTING

### Still Getting "Database Error"?

**Check 1: Verify trigger exists**
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```
Should return one row. If not, run migration 004 again.

**Check 2: Test trigger manually**
```sql
-- This should NOT throw an error
SELECT public.handle_new_user();
```

**Check 3: Check Supabase logs**
Go to: https://supabase.com/dashboard/project/qdknlxmksutvskhzjcca/logs/explorer
Look for errors during authentication.

### Google OAuth Not Working?

**Check 1: Redirect URIs match**
- Google Console redirect URI must EXACTLY match
- `https://qdknlxmksutvskhzjcca.supabase.co/auth/v1/callback`

**Check 2: Site URL is correct**
- In Supabase: `https://www.aikizi.xyz`

**Check 3: OAuth credentials are correct**
- Client ID and Secret are correct in Supabase

### Netlify Functions Failing?

**Check 1: Environment variables are set**
- All three variables must be set in Netlify
- `SUPABASE_SERVICE_ROLE` must be marked as secret

**Check 2: Redeploy after adding variables**
- Netlify doesn't automatically redeploy when you add variables
- Trigger a manual deployment

---

## SUMMARY CHECKLIST

Before testing Google sign-in, make sure you've completed:

- [ ] Run migration 001 (users and auth tables)
- [ ] Run migration 002 (media and posts tables)
- [ ] Run migration 003 (decodes and audit tables)
- [ ] Run migration 004 (handle_new_user trigger) ← CRITICAL!
- [ ] Verified all tables exist in Supabase
- [ ] Verified trigger exists on auth.users
- [ ] Configured Google OAuth in Google Cloud Console
- [ ] Enabled Google provider in Supabase
- [ ] Set Site URL in Supabase to https://www.aikizi.xyz
- [ ] Updated `.env` file with correct Supabase credentials
- [ ] Added three environment variables to Netlify
- [ ] Marked `SUPABASE_SERVICE_ROLE` as secret in Netlify
- [ ] Triggered a new deployment in Netlify

Once all checkboxes are complete, Google sign-in should work perfectly!

---

## NEED HELP?

If you're still experiencing issues after following this guide:

1. Check Supabase logs: https://supabase.com/dashboard/project/qdknlxmksutvskhzjcca/logs/explorer
2. Check Netlify function logs: https://app.netlify.com/sites/YOUR_SITE/logs
3. Check browser console for JavaScript errors
4. Verify all environment variables are set correctly

The most common issue is forgetting to run migration 004 (the trigger). Make sure that's done first!
