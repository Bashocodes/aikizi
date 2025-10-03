# AIKIZI Deployment Guide

This guide will help you deploy AIKIZI to Netlify with all required environment variables and database configuration.

## Prerequisites

1. A Supabase project with the database schema set up (see `DATABASE_SETUP.md`)
2. A Netlify account
3. Google Gemini API key (for image decoding)
4. Your Supabase credentials

## Step 1: Database Setup

If you haven't already set up your Supabase database, follow the instructions in `DATABASE_SETUP.md` to:

1. Create all required tables
2. Set up Row Level Security (RLS) policies
3. Configure authentication
4. Create the trigger function for new user registration

**CRITICAL**: Ensure all RLS policies are properly configured. The Explore page won't show posts without proper RLS setup.

## Step 2: Get Your Supabase Credentials

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings > API**
4. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...`) - **KEEP THIS SECRET!**

## Step 3: Get Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key - **KEEP THIS SECRET!**

## Step 4: Deploy to Netlify

### Option A: Deploy via Netlify CLI

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Login to Netlify:
   ```bash
   netlify login
   ```

3. Initialize the site:
   ```bash
   netlify init
   ```

4. Deploy:
   ```bash
   netlify deploy --prod
   ```

### Option B: Deploy via Netlify Dashboard

1. Go to [Netlify](https://app.netlify.com)
2. Click "Add new site" > "Import an existing project"
3. Connect your Git repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions`

## Step 5: Configure Environment Variables in Netlify

This is the **MOST CRITICAL** step. Without these environment variables, the app will not work.

1. In your Netlify site dashboard, go to **Site settings > Environment variables**

2. Add the following variables:

   | Variable Name | Value | Description |
   |--------------|-------|-------------|
   | `VITE_SUPABASE_URL` | Your Supabase Project URL | From Supabase Dashboard > Settings > API |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | From Supabase Dashboard > Settings > API |
   | `SUPABASE_SERVICE_ROLE` | Your Supabase service_role key | **SECRET** - From Supabase Dashboard > Settings > API |
   | `GEMINI_API_KEY` | Your Google Gemini API key | **SECRET** - From Google AI Studio |

3. **IMPORTANT**: Make sure to set the scope to "All deploy contexts" or at least "Production"

4. After adding all variables, trigger a new deployment:
   ```bash
   netlify deploy --prod
   ```

## Step 6: Verify Deployment

1. **Check Environment Variables**:
   - In Netlify, go to Deploys > (latest deploy) > Deploy log
   - Look for any errors mentioning missing environment variables

2. **Check Functions**:
   - Go to Functions in your Netlify dashboard
   - You should see: `decode-image`, `get-entitlements`, `publish-post`, `unlock-sref`
   - Click on each to see if they're working

3. **Test the Application**:
   - Visit your deployed site
   - Try signing in (you may need to configure Google OAuth in Supabase first)
   - Navigate to the Explore page
   - If you see posts, it's working!

## Common Issues and Solutions

### Issue: "No posts yet" message on Explore page

**Possible causes**:
1. No posts have been published yet
2. RLS policies are blocking access to posts
3. Database foreign key relationships are incorrect
4. Environment variables not set correctly in Netlify

**Solutions**:
1. Sign in and publish a test post from the Decode page (requires publisher role)
2. Check RLS policies in Supabase Dashboard > Authentication > Policies
3. Run the query in Supabase SQL Editor:
   ```sql
   SELECT p.*, ps.style_triplet, ma.variants
   FROM posts p
   LEFT JOIN post_styles ps ON ps.post_id = p.id
   LEFT JOIN media_assets ma ON ma.id = p.image_id
   WHERE p.visibility = 'public' AND p.status = 'published';
   ```
4. Verify all environment variables are set in Netlify

### Issue: "Failed to publish post" error

**Possible causes**:
1. Missing `SUPABASE_SERVICE_ROLE` environment variable
2. User doesn't have publisher role
3. Database RLS policies blocking insert operations

**Solutions**:
1. Verify `SUPABASE_SERVICE_ROLE` is set in Netlify
2. Update user role in Supabase:
   ```sql
   UPDATE users SET role = 'publisher' WHERE auth_id = 'your-auth-id';
   ```
3. Check that the service role key has bypass RLS permissions

### Issue: "Failed to decode image" error

**Possible causes**:
1. Missing `GEMINI_API_KEY` environment variable
2. Invalid Gemini API key
3. Gemini API quota exceeded

**Solutions**:
1. Verify `GEMINI_API_KEY` is set in Netlify
2. Test your API key at [Google AI Studio](https://aistudio.google.com)
3. Check your API quota and billing settings

### Issue: Netlify function errors in deploy logs

**Possible causes**:
1. Missing environment variables
2. TypeScript compilation errors
3. Missing dependencies

**Solutions**:
1. Double-check all environment variables are set
2. Run `npm run build` locally to check for compilation errors
3. Ensure `@netlify/functions` and `@supabase/supabase-js` are in dependencies (not devDependencies)

## Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE` is marked as secret in Netlify
- [ ] `GEMINI_API_KEY` is marked as secret in Netlify
- [ ] `.env` file is in `.gitignore` (never commit secrets!)
- [ ] RLS is enabled on all database tables
- [ ] RLS policies are restrictive (not using `USING (true)`)
- [ ] Service role key is only used in server-side functions
- [ ] Anon key is only used in client-side code

## Next Steps

1. Configure Google OAuth in Supabase Dashboard
2. Set up custom domain in Netlify
3. Configure email templates in Supabase
4. Set up monitoring and error tracking
5. Review and adjust RLS policies as needed

## Getting Help

If you're still experiencing issues:

1. Check Netlify function logs: Site > Functions > [function-name] > Logs
2. Check browser console for errors
3. Check Supabase logs: Dashboard > Logs
4. Review the RLS policies in Supabase Dashboard
5. Verify the database schema matches `DATABASE_SETUP.md`

## Local Development

For local development:

1. Copy `.env.example` to `.env`
2. Fill in all required environment variables
3. Run `npm install`
4. Run `npm run dev` for the frontend
5. Run `netlify dev` to test functions locally

**Note**: The service role key should NEVER be used in client-side code. It's only for Netlify functions.
