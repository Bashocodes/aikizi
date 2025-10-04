# RLS Authentication Compliance Summary

## Overview
Verified and enhanced Worker implementation to ensure proper RLS compliance for `media_assets` table operations.

## Changes Made

### 1. Enhanced Auth Library (`src/worker/lib/auth.ts`)
**Added `getAuthedClient()` function:**
```typescript
export function getAuthedClient(env: Env, token: string)
```
- Creates a Supabase client with the user's JWT attached
- Uses `SUPABASE_ANON_KEY` (required for RLS)
- Sets `Authorization: Bearer ${token}` header
- Disables session persistence and auto-refresh (stateless Worker design)
- Ensures RLS policies evaluate against `auth.uid()` from the JWT

**Why this matters:**
- RLS policies check `auth.uid() = media_assets.user_id`
- The client must carry the user's JWT for RLS to correctly identify the authenticated user
- Using ANON_KEY with JWT is the correct pattern (not SERVICE_KEY which bypasses RLS)

### 2. Updated Image Routes (`src/worker/routes/images.ts`)

#### `directUpload()` function:
**Before:**
- Used `verifyUser()` which didn't return token
- Used `supa(env, jwt)` helper that had mixed logic

**After:**
- Uses `requireUser(env, req, reqId)` → returns `{ user, token }`
- Uses `getAuthedClient(env, token)` → proper RLS-aware client
- Explicitly passes `user_id: user.id` in insert payload
- Added structured logging:
  - On success: `[reqId] [images] media asset created id=<id> user=<userId>`
  - On failure: `[reqId] [images] insert failed code=<code> msg=<message>`

**Insert payload:**
```typescript
{
  user_id: user.id,        // ✅ Explicitly set from authenticated user
  cf_image_id: cfImageId,  // Cloudflare Images ID
  provider: 'cloudflare',
  public_id: cfImageId,
  variants: {}
}
```

#### `ingestComplete()` function:
**Before:**
- Same pattern as directUpload
- Limited error logging

**After:**
- Uses `requireUser()` and `getAuthedClient()`
- Enforces ownership with `.eq('user_id', user.id)` on update
- Added structured logging for debugging

### 3. Updated Worker Router (`src/worker/index.ts`)
- Pass `reqId` to both `directUpload()` and `ingestComplete()`
- Enables consistent request tracing across all routes

## RLS Compliance Verification

### ✅ Auth Flow is Correct:
1. Frontend sends JWT in `Authorization: Bearer <token>` header
2. Worker calls `requireUser(env, req, reqId)` to verify JWT
3. Worker creates Supabase client with `getAuthedClient(env, token)`
4. Client has JWT attached → RLS evaluates `auth.uid()` correctly
5. Insert includes explicit `user_id: user.id` value

### ✅ RLS Policies Will Pass:
**For INSERT:**
```sql
CREATE POLICY "Users can create own media assets"
  ON media_assets FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
```
- Worker provides `user_id` matching the authenticated user
- JWT proves identity via `auth.uid()`
- Policy checks `user_id` matches → ✅ PASS

**For UPDATE:**
```sql
CREATE POLICY "Users can update own media assets"
  ON media_assets FOR UPDATE
  TO authenticated
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
```
- Worker uses `.eq('user_id', user.id)` filter
- Only matches rows owned by authenticated user
- RLS double-checks ownership → ✅ PASS

## Expected Logs

### Successful Upload Flow:
```
[abc123] POST path=/v1/images/direct-upload hasAuth=true
[abc123] [auth] authOutcome=OK userId=uuid-here
[abc123] [images] directUpload userId=uuid-here
[abc123] [images] media asset created id=asset-uuid user=uuid-here
[abc123] Response: 200
```

### Successful Ingest Flow:
```
[def456] POST path=/v1/images/ingest-complete hasAuth=true
[def456] [auth] authOutcome=OK userId=uuid-here
[def456] [images] ingestComplete userId=uuid-here
[def456] [images] media asset updated id=asset-uuid user=uuid-here
[def456] Response: 200
```

### Failed Auth:
```
[xyz789] POST path=/v1/images/direct-upload hasAuth=false
[xyz789] [auth] authOutcome=NO_AUTH_HEADER
[xyz789] Response: 401
```

### RLS Violation (different user trying to update):
```
[abc999] [images] update failed code=42501 msg=new row violates row-level security policy
[abc999] Response: 500
```

## No Changes to:
- CORS configuration
- Route paths
- Frontend code
- Database migrations or RLS policies
- Admin bypass logic

## Testing Checklist:
- [x] Build succeeds
- [ ] Deploy Worker to Cloudflare
- [ ] Test authenticated upload → should succeed
- [ ] Test unauthenticated upload → should return 401
- [ ] Check Worker logs for proper reqId tracing
- [ ] Verify media_assets table has correct user_id values
- [ ] Test that users can only see/update their own assets

## Summary
The Worker now properly implements RLS-compliant database operations by:
1. Always using the authenticated user's JWT for Supabase client creation
2. Explicitly passing `user_id` on all inserts
3. Filtering by `user_id` on all updates
4. Providing detailed logging for debugging
5. Never bypassing RLS with service role key on user data operations
