# Quick Setup Instructions

## Current Status: Your Project IS Connected to Supabase! ✅

Good news: Your Supabase database is already set up and connected. The frontend can read data just fine.

**The problem:** Your Netlify functions (backend) can't write data because they're missing the **Service Role Key**.

---

## What You Need to Do (2 Simple Steps)

### Step 1: Get Your Supabase Service Role Key

1. **Go to your Supabase project**: https://supabase.com/dashboard/project/0ec90b57d6e95fcbda19832f

2. **Click "Settings"** (gear icon) in the left sidebar

3. **Click "API"**

4. **Scroll down to "Project API keys"** section

5. **Find the "service_role" key** (NOT the anon key):
   ```
   ✅ service_role (secret) - THIS ONE!
   ❌ anon (public) - NOT this one
   ```

6. **Click "Reveal"** next to service_role

7. **Copy the entire key** (starts with `eyJ...`)

### Step 2: Add It to Your Netlify Deployment

#### For Netlify:

1. Go to your [Netlify Dashboard](https://app.netlify.com)
2. Select your AIKIZI site
3. Go to **Site settings** > **Environment variables**
4. Click **Add a variable**
5. Enter:
   - **Key**: `SUPABASE_SERVICE_ROLE`
   - **Value**: (paste the key you copied)
   - **Scopes**: Select "All deploy contexts" or at least "Production"
6. Click **Create variable**
7. Go to **Deploys** and click **Trigger deploy** > **Deploy site**

#### For Local Development (Optional):

1. Open the `.env` file in this project
2. Replace `your-service-role-key-here` with your actual key:
   ```
   SUPABASE_SERVICE_ROLE=eyJhbGc...your-actual-key
   ```
3. **DO NOT COMMIT THIS FILE TO GIT!** (it's already in .gitignore)

---

## Why This Fixes Your Problem

### Without Service Role Key:
- ❌ Can't publish posts (function fails)
- ❌ Can't decode images (function fails)
- ❌ Can't unlock SREF codes (function fails)
- ✅ Can still view existing posts (frontend uses anon key)

### With Service Role Key:
- ✅ Can publish posts
- ✅ Can decode images (also need GEMINI_API_KEY)
- ✅ Can unlock SREF codes
- ✅ Everything works!

---

## Understanding the Two Keys

Your project uses TWO different Supabase keys:

| Key Type | Used Where | Purpose | In Your Project |
|----------|------------|---------|-----------------|
| **anon key** | Frontend (browser) | Read-only access, respects RLS | ✅ Already configured |
| **service_role key** | Backend (Netlify functions) | Full access, bypasses RLS | ❌ Missing - need to add |

**Analogy:**
- **Anon key** = Guest pass (can view, limited actions)
- **Service role key** = Admin pass (can do everything)

Your frontend has the guest pass (working fine!). Your backend needs the admin pass (missing!).

---

## Optional: Add Google Gemini API Key (for Image Decoding)

If you want the image decoding feature to work:

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key
5. Add to Netlify:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: (paste the API key)

---

## How to Test Everything Works

After adding the service role key and redeploying:

1. **Open your deployed site**
2. **Sign in** (if not already)
3. **Go to the Decode page** (`/decode`)
4. **Upload an image** and click "Decode"
5. **Click "Post Publicly"** (if you're a publisher)
6. **Go to Explore page** (`/explore`)
7. **You should see your post!** 🎉

---

## Troubleshooting

### "I can't find my Supabase project"

The URL shows your project is: `0ec90b57d6e95fcbda19832f.supabase.co`

Try this direct link: https://supabase.com/dashboard/project/0ec90b57d6e95fcbda19832f/settings/api

If you still can't access it:
- It might be under a different Supabase account
- You might need to be invited to the project
- Contact whoever set up the Supabase project

### "I added the key but it still doesn't work"

1. **Check you added the RIGHT key** (service_role, not anon)
2. **Redeploy** after adding the variable
3. **Check Netlify function logs** for errors
4. **Check browser console** for error messages
5. **Verify the key is in Netlify**: Site settings > Environment variables

### "I see 'Only publishers can create posts'"

Your user account needs the publisher role:

1. Go to Supabase Dashboard
2. Open SQL Editor
3. Run this (replace email with yours):
   ```sql
   UPDATE users
   SET role = 'publisher'
   WHERE auth_id IN (
     SELECT id::text FROM auth.users
     WHERE email = 'your-email@example.com'
   );
   ```

---

## Summary

✅ **Your Supabase is connected** - No need to reconnect anything
❌ **Missing one key** - Add `SUPABASE_SERVICE_ROLE` to Netlify
🎯 **Once added** - Everything will work!

The confusion was thinking the project wasn't connected to Supabase, but it is! You just need one more key for the backend functions.
