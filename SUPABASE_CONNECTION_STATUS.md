# Supabase Connection Status

## ✅ Your Project IS Connected to Supabase!

Your `.env` file shows:
- **Supabase URL**: `https://0ec90b57d6e95fcbda19832f.supabase.co`
- **Anon Key**: Present and configured

### What's Working:
1. ✅ Frontend can connect to Supabase (using the anon key)
2. ✅ Users can sign in and view data
3. ✅ The Explore page can fetch posts (if they exist and RLS allows it)
4. ✅ Database schema is set up

### What's Missing: The Service Role Key

The **Service Role Key** is a special key that:
- Bypasses Row Level Security (RLS) policies
- Allows server-side operations
- Is required for Netlify functions to work

**Why you need it:**
- The `publish-post` function needs to insert data into the database
- The `decode-image` function needs to deduct tokens
- The `unlock-sref` function needs to unlock SREF codes
- Without it, these functions fail silently

---

## How to Get Your Service Role Key

This is a **Supabase-managed database**, and Bolt has already created it for you. Here's how to find the service role key:

### Option 1: Check Bolt's Environment (Recommended)

Since this is a Bolt-created Supabase instance, the service role key might already be available in your environment:

```bash
# Run this command to check if the key is available:
echo $SUPABASE_SERVICE_ROLE
```

If this returns a key (starts with `eyJ`), great! Copy it and add it to Netlify.

### Option 2: Access via Supabase Dashboard

The Supabase instance was created by Bolt, but you should have access to it:

1. Go to the [Supabase Dashboard](https://supabase.com/dashboard)
2. Look for a project with URL: `0ec90b57d6e95fcbda19832f.supabase.co`
3. If you see it:
   - Click on the project
   - Go to **Settings** (gear icon in sidebar)
   - Click **API**
   - Scroll to "Project API keys"
   - Find the **service_role** key (NOT the anon key)
   - Click "Reveal" and copy it

### Option 3: Contact Support

If you don't see the project in your Supabase dashboard:
- This is a Bolt-managed Supabase instance
- You may need to link it to your Supabase account
- Or Bolt may need to provide the service role key

---

## Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Supabase Connection | ✅ Connected | URL and anon key configured |
| Database Schema | ✅ Set up | Tables and RLS policies exist |
| Frontend Access | ✅ Working | Can read public data |
| Netlify Functions | ❌ Missing Key | Need `SUPABASE_SERVICE_ROLE` |
| Image Decoding | ❌ Missing Key | Need `GEMINI_API_KEY` |
| Post Publishing | ❌ Missing Key | Need `SUPABASE_SERVICE_ROLE` |

---

## What Happens Without the Service Role Key

### Current Behavior:
1. ✅ You can browse the site
2. ✅ You can sign in
3. ✅ You can see the Explore page
4. ❌ You can't decode images (also needs GEMINI_API_KEY)
5. ❌ You can't publish posts
6. ❌ You can't unlock SREF codes

### Why Publishing "Works" but Posts Don't Appear:
- The frontend tries to call the Netlify function
- The function fails because it can't connect to Supabase (missing service role key)
- The function returns an error (check browser console)
- No data is actually saved to Supabase

---

## Quick Test: Is Data Actually Being Saved?

Let's verify if posts are being saved to Supabase:

### Method 1: Check Supabase Dashboard
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Open your project: `0ec90b57d6e95fcbda19832f.supabase.co`
3. Click **Table Editor** in the sidebar
4. Look at the `posts` table
5. **Do you see any posts?**
   - **YES** → Posts are saving! Issue is with displaying them (RLS policies)
   - **NO** → Posts are NOT saving (missing service role key)

### Method 2: Check Browser Console
1. Open your deployed site
2. Press **F12** to open Developer Tools
3. Go to the **Console** tab
4. Try to publish a post
5. Look for error messages like:
   - "Missing required environment variables"
   - "Failed to publish post"
   - 500 Internal Server Error

### Method 3: Check Netlify Function Logs
1. Go to your [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Click **Functions** in the left sidebar
4. Click on `publish-post`
5. Click the **Logs** tab
6. Look for recent errors

---

## Next Steps

1. **Find Your Service Role Key** (use one of the methods above)

2. **Add to Netlify Environment Variables**:
   ```
   Variable name: SUPABASE_SERVICE_ROLE
   Value: eyJhbGc... (your actual key)
   ```

3. **Add Gemini API Key** (if you want image decoding to work):
   ```
   Variable name: GEMINI_API_KEY
   Value: (get from https://aistudio.google.com/app/apikey)
   ```

4. **Redeploy**:
   - After adding the variables, trigger a new deployment in Netlify
   - Or run: `netlify deploy --prod`

5. **Test**:
   - Try publishing a post
   - Check browser console for errors
   - Check Netlify function logs
   - Check Supabase Table Editor to see if data appears

---

## Important: Security Note

⚠️ **NEVER expose the Service Role Key in:**
- Client-side code
- Git commits
- Frontend environment variables (anything starting with `VITE_`)
- Public documentation

✅ **ONLY use it in:**
- Netlify environment variables (server-side)
- Netlify functions
- Backend services

The service role key has full database access and bypasses all security rules!

---

## Still Confused?

**The bottom line:**
- Your project IS connected to Supabase ✅
- The frontend works fine ✅
- The backend (Netlify functions) needs the service role key to work ❌
- Without it, you can view but not create/modify data ❌

Think of it like this:
- **Anon Key** = Read-only access (what users have)
- **Service Role Key** = Full admin access (what your server needs)

You have the read-only key, but you need the admin key for the server-side functions to work!
