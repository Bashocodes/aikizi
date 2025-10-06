# AIKIZI Auth Migration: Legacy JWT Secret → JWKS (P-256/RS256)

## Summary

AIKIZI has been migrated from legacy HS256 JWT verification (shared secret) to modern JWKS-based asymmetric key verification using Supabase's signing keys (P-256/RS256). This provides better security and enables fast, cached verification at the edge.

## Changes Made

### 1. New JWKS Verification System

**File: `src/worker/lib/jwks.ts`** (NEW)
- Implements JWKS fetching and caching (1 hour TTL)
- Supports both P-256 (ECDSA) and RS256 (RSA) algorithms
- Verifies JWT signature, issuer, expiration, and claims
- Provides `verifyAccessTokenViaJWKS()` and `verifyTokenSafe()` helpers
- Returns typed `AuthError` for proper error handling

### 2. Updated Auth Flow

**File: `src/worker/lib/auth.ts`**
- `requireUser()` now uses JWKS verification instead of Supabase's getUser()
- Extracts and verifies JWT from Authorization header
- Returns `AuthResult` with user ID from `sub` claim
- No longer depends on legacy JWT secret

**File: `src/worker/lib/supa.ts`**
- Updated to properly forward user tokens for RLS
- When `authJwt` is provided: uses anon key + Authorization header
- When `authJwt` is absent: uses service key (bypasses RLS)
- Clear logging indicates RLS vs service mode

### 3. Protected Routes Updated

**File: `src/worker/routes/publish.ts`**
- `publish()` and `createPost()` now use `requireUser()`
- Pass verified token to `supa()` for RLS-enabled queries
- Enhanced logging with reqId tracking
- Returns standardized error messages

**File: `src/worker/index.ts`**
- Routes properly pass `reqId` to handlers
- All auth flows use JWKS verification

### 4. Environment Configuration

**File: `src/worker/types.d.ts`**
- Added `SUPABASE_JWKS_URL` (required)
- Added `SUPABASE_JWT_ISSUER` (required)

**File: `wrangler.toml`**
- Documented new required env bindings
- Listed all secrets that need to be set

## Required Environment Variables

You must set these via Cloudflare Worker secrets:

```bash
# Required for JWKS verification
wrangler secret put SUPABASE_JWKS_URL
# Value: https://<PROJECT_REF>.supabase.co/auth/v1/.well-known/jwks.json

wrangler secret put SUPABASE_JWT_ISSUER
# Value: https://<PROJECT_REF>.supabase.co/auth/v1

# Existing secrets (keep as-is)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put CF_IMAGES_ACCOUNT_ID
wrangler secret put CF_IMAGES_TOKEN
wrangler secret put GEMINI_API_KEY
wrangler secret put SREF_ENCRYPTION_KEY
```

## Supabase Configuration

### 1. Rotate to Signing Keys

In Supabase Dashboard:
1. Go to **Settings** → **API** → **JWT Settings**
2. Under "JWT Signing Key", select **ECC (P-256)** or **RSA**
3. Click **Set as Current Key**
4. Wait 1-2 minutes for propagation

### 2. Verify JWKS Endpoint

Test that your JWKS URL is accessible:

```bash
curl https://<PROJECT_REF>.supabase.co/auth/v1/.well-known/jwks.json
```

Expected response:
```json
{
  "keys": [
    {
      "kty": "EC",
      "use": "sig",
      "kid": "...",
      "alg": "ES256",
      "crv": "P-256",
      "x": "...",
      "y": "..."
    }
  ]
}
```

## Deployment Steps

### 1. Set Environment Variables

```bash
# Set JWKS URL
wrangler secret put SUPABASE_JWKS_URL
# Paste: https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/.well-known/jwks.json

# Set JWT Issuer
wrangler secret put SUPABASE_JWT_ISSUER
# Paste: https://<YOUR_PROJECT_REF>.supabase.co/auth/v1
```

### 2. Deploy Worker

```bash
npm run deploy:worker
```

### 3. Verify Deployment

Test protected endpoint:

```bash
# Get a fresh token from your app
TOKEN="<your-access-token>"

# Test POST /v1/posts/create
curl -X POST https://aikizi.xyz/v1/posts/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cf_image_id": "test-123",
    "analysis_text": "{\"story\":\"Test post\"}"
  }'
```

Expected success response:
```json
{
  "success": true,
  "post_url": "/gallery/{post_id}",
  "post_id": "..."
}
```

Expected auth failure (if token is invalid):
```json
{
  "error": "invalid_token"
}
```

## Testing Checklist

- [ ] Set `SUPABASE_JWKS_URL` secret in Cloudflare
- [ ] Set `SUPABASE_JWT_ISSUER` secret in Cloudflare
- [ ] Rotate to P-256 signing key in Supabase
- [ ] Deploy worker with `npm run deploy:worker`
- [ ] Refresh session in frontend (to get new P-256 token)
- [ ] Test POST `/v1/posts/create` with valid token → expect 200
- [ ] Test POST `/v1/posts/create` without token → expect 401
- [ ] Test GET `/v1/posts/public` (no auth) → expect 200 with posts array
- [ ] Verify RLS: user can only see/edit their own posts
- [ ] Check worker logs for `[auth] jwks=ok sub=<uuid>` messages
- [ ] Confirm no `JWT cryptographic operation failed` errors

## Logs to Monitor

### Success Path
```
[abc123] [auth] tokenLen=XXX
[abc123] [auth] jwks=ok sub=user-uuid-here
[abc123] [auth] authOutcome=OK userId=user-uuid-here
[supa] Creating client with user token for RLS
[abc123] [createPost] userId=user-uuid-here authJwt=true
[abc123] [createPost] Post created successfully post_id=post-uuid
```

### Auth Failure
```
[abc123] [auth] tokenLen=XXX
[abc123] [auth] jwks=fail reason=Invalid signature
[abc123] [auth] authOutcome=invalid_token
```

## Error Messages

| Error Code | HTTP Status | Meaning |
|------------|-------------|---------|
| `auth_required` | 401 | No Authorization header provided |
| `invalid_token` | 401 | Token signature or claims invalid |
| `token_expired` | 401 | Token has expired |
| `server_config_error` | 500 | JWKS_URL or JWT_ISSUER not configured |
| `bad_request` | 400 | Malformed request body |
| `user_record_not_found` | 404 | User exists in auth but not in users table |

## Rollback Plan

If issues arise, you can temporarily rollback by:

1. Revert to legacy HS256 in Supabase (Settings → JWT Keys)
2. Redeploy previous worker version
3. Frontend tokens will work immediately (no user action needed)

However, since the project is pre-launch with zero users, a rollback should not be necessary.

## Security Improvements

### Before (HS256)
- Shared secret across all services
- Secret must be distributed and protected
- Symmetric signing/verification
- Higher risk of secret compromise

### After (P-256/RS256)
- Asymmetric keys: public key for verification only
- Private key stays in Supabase only
- JWKS endpoint provides public keys
- Worker caches JWKS for fast edge verification
- No shared secrets in worker environment

## RLS Behavior

All protected routes now:
1. Verify JWT with JWKS
2. Extract user ID from `sub` claim
3. Pass user token to Supabase client
4. RLS policies evaluate `auth.uid()` from token
5. Database operations respect user permissions

Example:
```sql
-- This policy now works correctly with JWKS tokens
CREATE POLICY "Users can insert own posts"
  ON public_posts FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text));
```

## Frontend Impact

**None.** Frontend continues to:
1. Obtain access tokens via `supabase.auth.getSession()`
2. Send `Authorization: Bearer <token>` header
3. Receive same responses

The only change is on the worker side, which now verifies tokens using JWKS instead of getUser().

## Performance

- JWKS fetched once and cached for 1 hour
- Verification happens at edge (no Supabase API call)
- Faster auth checks compared to legacy getUser() approach
- Reduced load on Supabase auth service

## Compliance

This migration aligns with:
- Supabase's recommended auth approach
- JWT best practices (asymmetric keys)
- OIDC standards (JWKS discovery)
- Zero-trust security model

## Next Steps

1. Monitor logs for 24 hours
2. Verify no auth errors in production
3. Remove any commented-out legacy code
4. Update internal documentation
5. Consider adding token refresh retry logic in frontend

## Support

If you encounter issues:

1. Check worker logs: `wrangler tail`
2. Verify JWKS URL returns valid JSON
3. Confirm token issuer matches SUPABASE_JWT_ISSUER
4. Test with fresh token from frontend
5. Review error codes in table above

---

**Migration completed**: All protected routes now use JWKS verification with RLS-enabled Supabase queries. No legacy JWT_SECRET dependencies remain.
