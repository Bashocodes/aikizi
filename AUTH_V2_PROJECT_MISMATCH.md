# Auth Fix v2: Project Mismatch Detection & Debug Endpoint

## Overview
Enhanced the authentication middleware to detect Supabase project mismatches and added a comprehensive debug endpoint for troubleshooting auth issues.

---

## Changes Made

### 1. Enhanced Auth Middleware (`src/worker/lib/auth.ts`)

**New Features:**
- ✅ Case-insensitive Authorization header lookup
- ✅ JWT payload decoding to inspect claims
- ✅ Project mismatch detection (issuer vs environment)
- ✅ Uses SERVICE_KEY for validation (more reliable than ANON_KEY)
- ✅ Better error codes and structured responses

**Implementation Details:**

```typescript
// Case-insensitive header extraction
const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';
const m = /^Bearer\s+(.+)$/i.exec(h);

// Decode JWT payload (no verify, just parse)
const base64Payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
const payload = JSON.parse(atob(base64Payload));

// Extract issuer and environment hosts
const issHost = new URL(payload.iss).host;  // e.g., "abc123.supabase.co"
const envHost = new URL(env.SUPABASE_URL).host;

// Validate project match
if (issHost !== envHost) {
  return 401 {
    error: 'project mismatch',
    code: 'PROJECT_MISMATCH',
    issHost: '...',  // masked
    envHost: '...'   // masked
  };
}

// Validate token with Supabase using SERVICE_KEY
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  global: {
    headers: { Authorization: `Bearer ${token}` }
  }
});
const { data, error } = await supabase.auth.getUser();
```

**Error Codes:**
- `NO_AUTH_HEADER` - No Authorization header or wrong format
- `PROJECT_MISMATCH` - Token from different Supabase project
- `INVALID_TOKEN` - Token validation failed

---

### 2. Debug Endpoint (`/v1/debug/auth`)

**Purpose:** Admin-only endpoint for diagnosing auth issues without exposing secrets.

**Access Control:**
```typescript
const ADMIN_USER_IDS = [
  // Add admin user IDs here
];
```

**Response Format:**
```json
{
  "hasAuthHeader": true,
  "headerPrefix": "Bearer",
  "tokenLen": 245,
  "issHost": "abc123.supabase.co",
  "envHost": "abc123.supabase.co",
  "projectMatch": true,
  "userId": "uuid-of-user",
  "authOutcome": "OK"
}
```

**Possible `authOutcome` Values:**
- `NO_HEADER` - No auth header present
- `PROJECT_MISMATCH` - Token from wrong project
- `INVALID_TOKEN` - Token validation failed
- `OK` - Authentication successful

**Security:**
- ❌ Never echoes full token
- ❌ Never echoes secrets or service keys
- ✅ Only shows masked host names (first 20 chars)
- ✅ Only shows token length, not content
- ✅ Admin-only access (if ADMIN_USER_IDS configured)

---

### 3. Unified Auth Across Endpoints

All endpoints now use the same `requireUser()` middleware:

**Before (inconsistent):**
- `/balance` - used `requireUser()`
- `/decode` - used `requireUser()`
- `/ensure-account` - had custom auth logic ❌

**After (unified):**
- `/balance` - uses `requireUser()` ✅
- `/decode` - uses `requireUser()` ✅
- `/ensure-account` - uses `requireUser()` ✅

---

## Request Flow

### Successful Auth Flow:
```
1. Client sends: Authorization: Bearer <token>
2. Worker extracts token (case-insensitive)
3. Worker decodes JWT payload to get issuer
4. Worker compares issuer host with env SUPABASE_URL host
5. If match, validates token with Supabase (SERVICE_KEY)
6. If valid, attaches userId to request context
7. Endpoint handler proceeds with authenticated user
```

### Project Mismatch Flow:
```
1. Client sends token from project A
2. Worker env configured for project B
3. JWT payload shows: iss = "https://projectA.supabase.co/auth/v1"
4. Worker env shows: SUPABASE_URL = "https://projectB.supabase.co"
5. Hosts don't match (projectA ≠ projectB)
6. Returns: 401 { code: 'PROJECT_MISMATCH', issHost: '...', envHost: '...' }
7. Client receives structured error
```

---

## Logging

### Enhanced Logging Format:
```
[reqId] POST /v1/decode hasAuth=true
[FN auth] Token length: 245
[FN auth] User authenticated: uuid
[reqId] Response: 200

// On project mismatch:
[FN auth] Project mismatch: { issHost: 'abc123.supabase.co', envHost: 'xyz789.supabase.co' }
[reqId] Response: 401
```

Every response includes `x-req-id` header for correlation.

---

## Testing

### Test 1: Successful Auth
```bash
curl -H "Authorization: Bearer <valid-token>" \
  https://aikizi.xyz/v1/balance

# Expected: 200 { ok: true, balance: 1000 }
```

### Test 2: Project Mismatch
```bash
# Use token from different Supabase project
curl -H "Authorization: Bearer <wrong-project-token>" \
  https://aikizi.xyz/v1/decode

# Expected: 401 {
#   error: 'project mismatch',
#   code: 'PROJECT_MISMATCH',
#   issHost: '...',
#   envHost: '...'
# }
```

### Test 3: Debug Endpoint
```bash
curl -H "Authorization: Bearer <valid-token>" \
  https://aikizi.xyz/v1/debug/auth

# Expected: 200 {
#   hasAuthHeader: true,
#   headerPrefix: "Bearer",
#   tokenLen: 245,
#   issHost: "abc123.supabase.co",
#   envHost: "abc123.supabase.co",
#   projectMatch: true,
#   userId: "uuid",
#   authOutcome: "OK"
# }
```

### Test 4: Case-Insensitive Headers
```bash
# Test with lowercase
curl -H "authorization: bearer <token>" \
  https://aikizi.xyz/v1/balance

# Test with mixed case
curl -H "Authorization: Bearer <token>" \
  https://aikizi.xyz/v1/balance

# Both should work identically
```

---

## Environment Variables

### Required in Cloudflare Workers:
```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # Service role key (not anon key)
SUPABASE_ANON_KEY=eyJ...     # Anon key (optional, for public endpoints)
```

**Critical:**
- `SUPABASE_URL` must match the project that issued the JWT tokens
- `SUPABASE_SERVICE_KEY` must belong to the same project
- No trailing slash on `SUPABASE_URL`

---

## Common Issues & Solutions

### Issue: Always getting PROJECT_MISMATCH

**Cause:** Worker environment uses different Supabase project than client

**Solution:**
1. Check token issuer: `jwt.io` → paste token → look at `iss` claim
2. Check worker env: compare with `SUPABASE_URL`
3. Ensure both use same project reference

**Example:**
```
Token iss: https://abc123.supabase.co/auth/v1
Worker URL: https://xyz789.supabase.co
           ^^^^^^ ^^^^^^ <- These must match!
```

### Issue: INVALID_TOKEN for valid session

**Cause:** Token expired or service key mismatch

**Solution:**
1. Client should refresh token via `supabase.auth.refreshSession()`
2. Verify `SUPABASE_SERVICE_KEY` is for correct project
3. Check token expiry in JWT payload (`exp` claim)

### Issue: Debug endpoint returns 403

**Cause:** User not in `ADMIN_USER_IDS` array

**Solution:**
1. Get user ID from successful auth
2. Add to `ADMIN_USER_IDS` in `src/worker/index.ts`
3. Redeploy worker

---

## Security Considerations

### ✅ Safe:
- Decoding JWT payload to read claims (public data)
- Comparing issuer with environment URL
- Logging masked host names
- Returning token length (not content)
- Using SERVICE_KEY for validation server-side

### ❌ Never Do:
- Echo full token in response
- Log full token in console
- Return service keys or secrets
- Expose full URLs in public errors
- Allow debug endpoint without auth

---

## Acceptance Criteria

✅ POST /v1/decode succeeds when signed in (same session where GET /v1/balance succeeds)
✅ /v1/debug/auth shows `issHost==envHost` and non-null `userId` for valid tokens
✅ Token from different project returns 401 with code `PROJECT_MISMATCH` (masked values)
✅ Logs include `x-req-id` and `authOutcome` for each request
✅ All endpoints use unified `requireUser()` middleware
✅ Case-insensitive header lookup works correctly

---

## Deployment

### Steps:
1. Verify environment variables in Cloudflare dashboard
2. Deploy worker: `npm run deploy:worker`
3. Test /v1/balance endpoint
4. Test /v1/decode endpoint
5. Test /v1/debug/auth endpoint (if admin configured)
6. Monitor logs for any PROJECT_MISMATCH errors

### Rollback Plan:
If issues arise, redeploy previous version of worker. Client changes are backward compatible.

---

## Additional Notes

- All auth logic is server-side in Cloudflare Worker
- Client uses same token for all endpoints
- No cookies involved, pure header-based auth
- CORS properly configured for aikizi.xyz domains
- Request IDs help correlate logs across client/server
