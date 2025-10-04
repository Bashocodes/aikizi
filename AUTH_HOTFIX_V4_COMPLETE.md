# Auth Hotfix V4 - Complete

## Goal
Guarantee `/v1/decode` and `/v1/balance` use the **exact same** auth middleware. Add `/v1/debug/auth` for masked diagnostics.

## Changes Made

### 1. Simplified Auth Middleware (`src/worker/lib/auth.ts`)

**requireUser** - Identical for all endpoints:
```typescript
export async function requireUser(env: Env, req: Request, reqId?: string): Promise<AuthResult> {
  // 1. Extract Authorization header (case-insensitive)
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';

  // 2. Parse Bearer token
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw 401 { error: 'NO_AUTH_HEADER' }

  const token = m[1];

  // 3. Create server Supabase client
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { ... });

  // 4. Verify token
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) throw 401 { error: 'INVALID_TOKEN' }

  // 5. Return user
  return { user: data.user, token };
}
```

**requireAdmin** - Checks allowlist then DB role:
```typescript
export async function requireAdmin(env: Env, userId: string, reqId?: string): Promise<void> {
  // 1. Check allowlist
  const set = new Set((env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean));
  if (set.has(userId)) return;

  // 2. Check DB role
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { ... });
  const { data } = await db.from('users').select('role').eq('auth_id', userId).single();

  if (data?.role === 'admin') return;

  throw 403 { error: 'FORBIDDEN' }
}
```

### 2. Updated Routes

**`/v1/balance`** (GET)
- Uses: `requireUser(env, req, reqId)`
- Returns: `{ ok: true, balance: number }`

**`/v1/decode`** (POST)
- Uses: `requireUser(env, req, reqId)` (ONLY - no alternative auth)
- Returns: `{ ok: true, normalized: {...} }` or error codes

**`/v1/debug/auth`** (GET) - NEW
- Uses: `requireUser(env, req, reqId)` + `requireAdmin(env, userId, reqId)`
- Returns: `{ hasAuthHeader: boolean, tokenLen: number, userId: string }`
- Masked output - never echoes token

### 3. Request ID Logging

All routes now:
- Generate unique `reqId` per request
- Include `x-req-id` in response headers
- Log: `[reqId] method path headerPresent authOutcome`
- Auth outcome: `OK`, `NO_AUTH_HEADER`, or `INVALID_TOKEN`

### 4. Removed

- ❌ Project mismatch checks (removed complexity)
- ❌ JWT payload parsing for issuer validation
- ❌ Any decode-specific auth logic
- ❌ Using `Authorization: Bearer` header in Supabase client config

## Acceptance Criteria ✅

1. ✅ `/v1/balance` and `/v1/decode` use **identical auth** (`requireUser` only)
2. ✅ `/v1/debug/auth` returns masked diagnostics (admin-only)
3. ✅ No alternative auth checks in `/v1/decode` handler
4. ✅ Request ID logging on all routes
5. ✅ Build passes without errors

## Environment Variables

Add to Cloudflare Worker secrets:
```bash
ADMIN_USER_IDS="uuid1,uuid2,uuid3"  # Comma-separated Supabase auth.users.id UUIDs
```

## Testing

1. **GET /v1/balance** with JWT → should return `{ ok: true, balance: N }`
2. **POST /v1/decode** with same JWT → should succeed with same auth flow
3. **GET /v1/debug/auth** without admin → should return `403 FORBIDDEN`
4. **GET /v1/debug/auth** with admin JWT → should return masked info
5. Check worker logs for `x-req-id` and `authOutcome=OK` on success

## Key Improvements

- **Consistency**: Both endpoints now use identical auth
- **Simplicity**: Removed project mismatch validation complexity
- **Observability**: Request IDs and outcome logging
- **Security**: Admin-only debug endpoint with masked output
- **Reliability**: No more unexpected auth variations between routes
