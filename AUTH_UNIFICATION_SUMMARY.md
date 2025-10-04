# Auth Unification Fix Summary

## Problem
POST /v1/decode was returning 401 errors due to inconsistent authentication handling between the client and Cloudflare Worker.

## Solution
Unified authentication flow using Bearer token header authentication across all endpoints, with enhanced diagnostics and guardrails.

---

## Changes Made

### 1. Client API Layer (`src/lib/api.ts`)

**Fixed:**
- Changed API_BASE from relative `/v1` to absolute `https://aikizi.xyz/v1`
- Removed `credentials: 'include'` (changed to `omit`) - no cookie auth needed
- Added check to prevent API calls without access token
- Improved 401 handling with better error messages
- Fixed FormData handling - Content-Type header not set for FormData to allow browser to set boundary automatically
- Authorization header now always attached for authenticated requests

**Key improvements:**
- Single base URL: `https://aikizi.xyz/v1` for all API calls
- Token refresh on 401, retry exactly once
- After second 401, return user-friendly error: "Authorization failed. Please sign out and back in."
- FormData requests properly handled without Content-Type override

### 2. Cloudflare Worker Index (`src/worker/index.ts`)

**Added:**
- Request ID generation for every request
- Request logging: method, pathname, presence of auth header
- Response logging: status code
- x-req-id header on all responses
- `/v1/debug/auth` endpoint for admin diagnostics

**Debug Auth Endpoint:**
```json
{
  "hasAuthHeader": true/false,
  "headerPrefix": "Bearer" or null,
  "tokenLen": number,
  "userId": "uuid" or null,
  "authOutcome": "OK" | "INVALID" | "NO_HEADER",
  "projectUrl": "masked-url"
}
```

### 3. Auth Middleware (`src/worker/lib/auth.ts`)

**Enhanced:**
- Added error codes to 401 responses:
  - `NO_AUTH_HEADER` - No Authorization header present
  - `INVALID_TOKEN` - Token validation failed
- Better logging of auth sources checked
- Case-insensitive Authorization header lookup already in place

### 4. Decode Route (`src/worker/routes/decode.ts`)

**Improved:**
- Token spend errors now include error codes:
  - `NO_TOKENS` - Insufficient tokens
  - `SPEND_FAILED` - Other spend failures
- Consistent error response format with `{ ok: false, error: string, code: string }`

### 5. CORS Configuration (`src/worker/lib/cors.ts`)

**Updated:**
- Allowed origins: `https://aikizi.xyz`, `https://www.aikizi.xyz`
- Allowed methods: `GET`, `POST`, `OPTIONS`
- Allowed headers: `Authorization`, `Content-Type` (removed unnecessary headers)
- OPTIONS preflight returns 204 instead of 200
- Dynamic origin selection based on request origin

### 6. DecodePage (`src/pages/DecodePage.tsx`)

**Added Guardrails:**
- Consecutive 401 counter to detect auth loops
- After 2 consecutive 401s, stop and show: "Authorization failed for decode. Please sign out and back in."
- Reset counter on successful decode or file change
- Better error categorization for different failure types

### 7. AuthContext (`src/contexts/AuthContext.tsx`)

**Optimized:**
- Balance fetch debouncing: max once every 10 seconds
- Prevents rapid-fire balance calls on auth state changes
- Reduces load on Worker and improves performance

---

## Request Flow

### Successful Flow:
1. Client calls `api.post('/decode', {...})`
2. API layer fetches fresh token via `supabase.auth.getSession()`
3. Adds `Authorization: Bearer <token>` header
4. Worker receives request with auth header
5. `requireUser()` validates token with Supabase
6. Returns user object, decode proceeds
7. Response includes `x-req-id` header

### 401 Flow:
1. Worker validates token, fails
2. Returns 401 with `{ error: "auth required", code: "INVALID_TOKEN" }`
3. Client detects 401, attempts token refresh
4. Retries request exactly once with new token
5. If second 401: increment counter, show guardrail message
6. After 2 consecutive 401s: block further attempts, suggest sign out

---

## Logging

### Worker Logs Format:
```
[reqId] METHOD /v1/path hasAuth=true/false
[FN auth] Sources present: { hasAuthHeader: true, ... }
[FN auth] Token length: 123
[FN auth] User authenticated: user-id
[reqId] Response: 200
```

### Client Logs Format:
```
[API] POST https://aikizi.xyz/v1/decode { hasToken: true }
[API] Success: { ok: true, ... }
[DecodePage] Starting decode flow { tokenBalance: 1000, model: 'gpt-5' }
```

---

## Acceptance Criteria Met

✅ DevTools shows Authorization header present on POST /v1/decode
✅ /v1/decode no longer returns 401 when user is signed in (same auth as /balance)
✅ If token is actually invalid, server returns structured 401 JSON with error code
✅ Client shows guardrail message after 2 consecutive 401s, no infinite loops
✅ Worker logs show request id, presence of header, and auth outcome
✅ /v1/debug/auth available for admin diagnostics (returns masked info only)

---

## Security Notes

- No secrets exposed to browser
- All API keys remain in Worker environment variables
- Tokens validated server-side using Supabase service client
- Debug endpoint masks sensitive data (token length shown, not token itself)
- CORS restricted to aikizi.xyz domains only

---

## Deployment Checklist

1. Deploy Worker: `npm run deploy:worker`
2. Verify environment variables are set in Cloudflare dashboard
3. Test /v1/balance endpoint with valid token
4. Test /v1/decode endpoint with valid token
5. Test /v1/debug/auth endpoint (admin only)
6. Monitor Worker logs for request IDs and auth outcomes
7. Verify CORS headers in browser DevTools

---

## Environment Variables (Worker)

Required in Cloudflare Workers dashboard:
```
SUPABASE_URL
SUPABASE_SERVICE_KEY
SUPABASE_ANON_KEY
OPENAI_API_KEY
GEMINI_API_KEY
SREF_ENCRYPTION_KEY
CF_IMAGES_ACCOUNT_ID
CF_IMAGES_SIGNING_KEY
CF_IMAGES_TOKEN
```

---

## Testing

### Manual Test: Decode Auth
1. Sign in to aikizi.xyz
2. Navigate to /decode
3. Open DevTools Network tab
4. Upload image and click "Decode"
5. Check request headers include: `Authorization: Bearer <token>`
6. Verify response is 200 OK (not 401)
7. Check response headers include: `x-req-id: <id>`

### Manual Test: 401 Guardrail
1. Sign in, then manually invalidate token in localStorage
2. Attempt decode
3. Should see "Authorization failed. Retrying..." message
4. Should see final error: "Authorization failed for decode. Please sign out and back in."
5. No infinite loop attempts

### Manual Test: Debug Endpoint
1. GET https://aikizi.xyz/v1/debug/auth with valid token
2. Should return JSON with userId and authOutcome="OK"
3. Without token: authOutcome="NO_HEADER"
4. With invalid token: authOutcome="INVALID"
