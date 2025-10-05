# RLS Authentication Compliance Summary

## Overview
Verified and enhanced Worker implementation to ensure proper RLS compliance for Supabase operations that store decode history and publish posts from base64 uploads.

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
- RLS policies check `auth.uid()`
- The client must carry the user's JWT for RLS to correctly identify the authenticated user
- Using ANON_KEY with JWT is the correct pattern (not SERVICE_KEY which bypasses RLS)

### 2. Base64 Decode + Post Flow (`src/worker/routes/decode.ts`, `src/worker/routes/posts.ts`)

- Both routes now operate exclusively on base64 payloads – no legacy Cloudflare upload steps remain.
- `decode.ts` enforces auth via `requireUser`, spends a token with full RLS context, and stores normalized analysis for history.
- `posts.ts` requires the authenticated user, validates `{ model, image_base64, analysis }`, and inserts the post with ownership enforced by RLS.
- Structured logging remains in place for decode + post lifecycle events for observability.

### 3. Updated Worker Router (`src/worker/index.ts`)
- Routes `/v1/decode/:model` and `/v1/posts/create` handle the entire image pipeline.
- Legacy `/v1/images/*` endpoints have been removed to guarantee the new flow is always used.

## RLS Compliance Verification

### ✅ Auth Flow is Correct:
1. Frontend sends JWT in `Authorization: Bearer <token>` header
2. Worker calls `requireUser(env, req, reqId)` to verify JWT
3. Worker creates Supabase client with `getAuthedClient(env, token)`
4. Client has JWT attached → RLS evaluates `auth.uid()` correctly
5. Inserts include explicit ownership information derived from the authenticated user

### ✅ RLS Policies Will Pass:
**For INSERT (posts/decodes):**
```sql
CREATE POLICY "Users can insert their own records"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (owner_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
```
- Worker provides `owner_id` matching the authenticated user
- JWT proves identity via `auth.uid()`
- Policy checks ownership → ✅ PASS

A similar pattern is used for decode history storage, ensuring the authenticated user owns the record that is created.

## Expected Logs

### Successful Decode + Post Flow:
```
[abc123] POST path=/v1/decode/gpt-5 hasAuth=true
[abc123] [auth] authOutcome=OK userId=uuid-here
[abc123] [decode] Success ms=1234
[abc123] Response: 200

[def456] POST path=/v1/posts/create hasAuth=true
[def456] [auth] authOutcome=OK userId=uuid-here
[def456] [posts] created post id=post-uuid
[def456] Response: 200
```

### Failed Auth:
```
[xyz789] POST path=/v1/decode/gpt-5 hasAuth=false
[xyz789] [auth] authOutcome=NO_AUTH_HEADER
[xyz789] Response: 401
```

## Testing Checklist:
- [x] Build succeeds
- [ ] Deploy Worker to Cloudflare
- [ ] Test authenticated decode → should succeed
- [ ] Test unauthenticated decode → should return 401
- [ ] Check Worker logs for proper reqId tracing
- [ ] Verify posts and decodes tables have correct user_id values
- [ ] Ensure users only access their own records

## Summary
The Worker now properly implements RLS-compliant database operations by:
1. Always using the authenticated user's JWT for Supabase client creation
2. Explicitly passing ownership on all inserts
3. Filtering by user identifiers on all updates
4. Providing detailed logging for debugging
5. Never bypassing RLS with service role key on user data operations
