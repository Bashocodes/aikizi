# Authentication Flow Diagram

## Overview

This document visualizes the complete authentication flow from client to worker.

---

## Successful Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. User Signs In                                                    │
│    Location: aikizi.xyz                                             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Supabase Auth Issues JWT                                         │
│    - Access token (JWT) with claims:                                │
│      • iss: "https://abc123.supabase.co/auth/v1"                   │
│      • sub: "user-id"                                               │
│      • exp: timestamp                                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Client Stores Token                                              │
│    - localStorage: supabase.auth.session                            │
│    - Memory: AuthContext state                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. User Initiates Decode                                            │
│    - Uploads image                                                  │
│    - Clicks "Decode" button                                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. API Wrapper Prepares Request                                     │
│    File: src/lib/api.ts                                             │
│    - Calls: supabase.auth.getSession()                             │
│    - Extracts: session.access_token                                 │
│    - Adds header: Authorization: Bearer <token>                     │
│    - Sets URL: https://aikizi.xyz/v1/decode                        │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Request Sent to Worker                                           │
│    POST https://aikizi.xyz/v1/decode                                │
│    Headers:                                                         │
│      - Authorization: Bearer eyJhbGc...                             │
│      - Content-Type: application/json                               │
│      - idem-key: decode-12345                                       │
│    Body: { image_url: "data:...", model: "gpt-5" }                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 7. Worker Receives Request                                          │
│    File: src/worker/index.ts                                        │
│    - Generates request ID: abc123                                   │
│    - Logs: [abc123] POST /v1/decode hasAuth=true                   │
│    - Routes to: decode(env, req)                                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 8. Decode Handler Calls Auth                                        │
│    File: src/worker/routes/decode.ts                                │
│    - Calls: requireUser(env, req)                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 9. Auth Middleware (requireUser)                                    │
│    File: src/worker/lib/auth.ts                                     │
│                                                                      │
│    Step 9a: Extract Token                                           │
│    - Reads: authorization || Authorization header                   │
│    - Regex: /^Bearer\s+(.+)$/i                                      │
│    - Result: token = "eyJhbGc..."                                   │
│                                                                      │
│    Step 9b: Decode JWT Payload                                      │
│    - Split: token.split('.')[1]                                     │
│    - Decode: atob(base64)                                           │
│    - Parse: JSON.parse(decoded)                                     │
│    - Extract: payload.iss                                           │
│                                                                      │
│    Step 9c: Verify Project Match                                    │
│    - issHost = new URL(payload.iss).host                            │
│      → "abc123.supabase.co"                                        │
│    - envHost = new URL(env.SUPABASE_URL).host                       │
│      → "abc123.supabase.co"                                        │
│    - Check: issHost === envHost ✓                                   │
│                                                                      │
│    Step 9d: Validate Token                                          │
│    - Create Supabase client with SERVICE_KEY                        │
│    - Add Authorization header to client                             │
│    - Call: supabase.auth.getUser()                                  │
│    - Result: user object with id, email, etc.                       │
│                                                                      │
│    Step 9e: Return Auth Result                                      │
│    - Returns: { user, token }                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 10. Decode Handler Continues                                        │
│     - Has authenticated user object                                 │
│     - Checks idem-key header                                        │
│     - Calls: spend_tokens(cost=1, idem_key)                        │
│     - Processes image decode                                        │
│     - Saves to database                                             │
│     - Returns: { ok: true, normalized: {...} }                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 11. Worker Sends Response                                           │
│     Status: 200 OK                                                  │
│     Headers:                                                        │
│       - Access-Control-Allow-Origin: https://aikizi.xyz            │
│       - x-req-id: abc123                                            │
│     Body: { ok: true, normalized: {...} }                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 12. Client Receives Response                                        │
│     - Parses JSON                                                   │
│     - Updates UI with decode result                                 │
│     - Refreshes token balance                                       │
│     - Resets 401 counter to 0                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Error Flow: Project Mismatch

```
┌─────────────────────────────────────────────────────────────────────┐
│ User has token from Project A                                       │
│ Worker configured for Project B                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Request arrives at Worker                                           │
│ Authorization: Bearer <project-A-token>                             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Auth Middleware: requireUser()                                      │
│                                                                      │
│ 1. Extract token ✓                                                  │
│ 2. Decode JWT payload ✓                                             │
│    - payload.iss = "https://projectA.supabase.co/auth/v1"          │
│                                                                      │
│ 3. Check project match ✗                                            │
│    - issHost = "projectA.supabase.co"                              │
│    - envHost = "projectB.supabase.co"                              │
│    - issHost !== envHost ✗                                          │
│                                                                      │
│ 4. Throw Response:                                                  │
│    401 {                                                            │
│      error: "project mismatch",                                     │
│      code: "PROJECT_MISMATCH",                                      │
│      issHost: "projectA.supaba...",  // masked                      │
│      envHost: "projectB.supaba..."   // masked                      │
│    }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Client receives 401                                                 │
│ - Attempts token refresh (will also fail)                           │
│ - Increments 401 counter                                            │
│ - After 2 attempts: Shows error message                             │
│   "Authorization failed. Please sign out and back in."              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Error Flow: Invalid Token

```
┌─────────────────────────────────────────────────────────────────────┐
│ Token is expired or malformed                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Auth Middleware: requireUser()                                      │
│                                                                      │
│ 1. Extract token ✓                                                  │
│ 2. Decode JWT payload ✓                                             │
│ 3. Check project match ✓                                            │
│ 4. Validate with Supabase ✗                                         │
│    - supabase.auth.getUser() returns error                          │
│                                                                      │
│ 5. Throw Response:                                                  │
│    401 {                                                            │
│      error: "auth required",                                        │
│      code: "INVALID_TOKEN"                                          │
│    }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Client receives 401                                                 │
│ - Attempts token refresh via supabase.auth.refreshSession()         │
│ - Gets new token                                                    │
│ - Retries request with new token ✓                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Debug Endpoint Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Developer wants to diagnose auth issue                              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ GET https://aikizi.xyz/v1/debug/auth                                │
│ Authorization: Bearer <token>                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Worker: debugAuth() handler                                         │
│ File: src/worker/index.ts                                           │
│                                                                      │
│ 1. Extract token (case-insensitive)                                 │
│ 2. Decode JWT payload (without verify)                              │
│ 3. Extract issuer and compare with env                              │
│ 4. Attempt full auth via requireUser()                              │
│ 5. Capture outcome (OK/NO_HEADER/PROJECT_MISMATCH/INVALID)         │
│ 6. Check if user is admin (optional)                                │
│ 7. Return diagnostic info (never full token)                        │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Response:                                                           │
│ {                                                                    │
│   "hasAuthHeader": true,                                            │
│   "headerPrefix": "Bearer",                                         │
│   "tokenLen": 245,                                                  │
│   "issHost": "abc123.supabase.co",                                 │
│   "envHost": "abc123.supabase.co",                                 │
│   "projectMatch": true,                                             │
│   "userId": "550e8400-e29b-...",                                    │
│   "authOutcome": "OK"                                               │
│ }                                                                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Developer analyzes output:                                          │
│ - ✓ projectMatch: true → Config is correct                         │
│ - ✓ authOutcome: "OK" → Auth is working                            │
│ - ✓ userId present → Token is valid                                │
│                                                                      │
│ If projectMatch: false → Need to fix env vars                       │
│ If authOutcome: "INVALID_TOKEN" → Token expired                     │
│ If authOutcome: "NO_HEADER" → Client not sending header             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Token Lifecycle

```
┌──────────────────────┐
│   User Signs In      │
│   (Google OAuth)     │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  Supabase Issues     │
│  JWT Access Token    │
│  (1 hour expiry)     │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  Client Stores       │
│  - localStorage      │
│  - Memory (state)    │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  API Calls Use       │
│  Bearer Token        │
│  (until expiry)      │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  Token Expires       │
│  (after 1 hour)      │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  Worker Returns 401  │
│  code: INVALID_TOKEN │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  Client Refreshes    │
│  supabase.auth       │
│  .refreshSession()   │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  New Token Issued    │
│  (another 1 hour)    │
└──────────────────────┘
          ↓
┌──────────────────────┐
│  Retry API Call      │
│  with New Token      │
└──────────────────────┘
```

---

## Key Components

### Client Side (aikizi.xyz)
1. **AuthContext** (`src/contexts/AuthContext.tsx`)
   - Manages auth state
   - Handles sign in/out
   - Fetches token balance
   - Debounces balance calls (10s)

2. **API Wrapper** (`src/lib/api.ts`)
   - Fetches fresh token for each request
   - Adds Authorization header
   - Handles 401 with token refresh
   - Retry logic (once per request)

3. **DecodePage** (`src/pages/DecodePage.tsx`)
   - User interface for decode
   - 401 counter tracking
   - Guardrail after 2 consecutive 401s
   - Token balance display

### Worker Side (Cloudflare)
1. **Router** (`src/worker/index.ts`)
   - Routes requests to handlers
   - Generates request IDs
   - Adds CORS headers
   - Logs all requests

2. **Auth Middleware** (`src/worker/lib/auth.ts`)
   - Extracts token (case-insensitive)
   - Decodes JWT payload
   - Verifies project match
   - Validates with Supabase
   - Returns user object

3. **Decode Handler** (`src/worker/routes/decode.ts`)
   - Calls requireUser()
   - Spends tokens atomically
   - Processes decode
   - Saves to database

---

## Security Model

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT SIDE (Public)                                                │
│                                                                      │
│ ✓ JWT Access Token (self-contained, expires in 1h)                 │
│ ✓ Supabase Anon Key (rate-limited, RLS enforced)                   │
│ ✗ No Service Key                                                    │
│ ✗ No API keys for external services                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ WORKER (Server-Side)                                                │
│                                                                      │
│ ✓ Validates JWT with Supabase (using SERVICE_KEY)                  │
│ ✓ Has all API keys (OpenAI, Gemini, CF Images)                     │
│ ✓ Can bypass RLS (using SERVICE_KEY)                                │
│ ✓ All sensitive operations happen here                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Never trust client, always verify server-side.

---

## Performance Optimizations

1. **Balance Fetch Debouncing**
   - Client caches balance for 10 seconds
   - Prevents excessive API calls on auth changes

2. **Request ID Logging**
   - Fast UUID generation
   - Helps correlate client/server logs

3. **Case-Insensitive Headers**
   - Single regex match
   - No multiple if/else checks

4. **JWT Payload Decode**
   - Only decode claims (no verify)
   - Fast host comparison
   - Full verify only if project matches

5. **Service Key Validation**
   - More reliable than anon key
   - Bypasses rate limits
   - Single auth validation point
