# Debug Auth Endpoint - Quick Reference

## Endpoint
```
GET https://aikizi.xyz/v1/debug/auth
Authorization: Bearer <your-token>
```

## Purpose
Diagnose authentication issues without exposing sensitive data.

---

## Response Examples

### ✅ Success - Auth Working
```json
{
  "hasAuthHeader": true,
  "headerPrefix": "Bearer",
  "tokenLen": 245,
  "issHost": "abc123.supabase.co",
  "envHost": "abc123.supabase.co",
  "projectMatch": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "authOutcome": "OK"
}
```
**Interpretation:** ✅ Everything is working correctly!

---

### ❌ No Auth Header
```json
{
  "hasAuthHeader": false,
  "headerPrefix": null,
  "tokenLen": 0,
  "issHost": "unknown",
  "envHost": "abc123.supabase.co",
  "projectMatch": false,
  "userId": null,
  "authOutcome": "NO_HEADER"
}
```
**Problem:** Client not sending Authorization header
**Fix:** Ensure client includes `Authorization: Bearer <token>` in request

---

### ❌ Project Mismatch
```json
{
  "hasAuthHeader": true,
  "headerPrefix": "Bearer",
  "tokenLen": 245,
  "issHost": "xyz789.supabase.co",
  "envHost": "abc123.supabase.co",
  "projectMatch": false,
  "userId": null,
  "authOutcome": "PROJECT_MISMATCH"
}
```
**Problem:** Token from different Supabase project
**Fix:**
- Client and Worker must use same Supabase project
- Check client's `VITE_SUPABASE_URL`
- Check Worker's `SUPABASE_URL` environment variable

---

### ❌ Invalid Token
```json
{
  "hasAuthHeader": true,
  "headerPrefix": "Bearer",
  "tokenLen": 245,
  "issHost": "abc123.supabase.co",
  "envHost": "abc123.supabase.co",
  "projectMatch": true,
  "userId": null,
  "authOutcome": "INVALID_TOKEN"
}
```
**Problem:** Token expired or invalid
**Fix:**
- Client should refresh token via `supabase.auth.refreshSession()`
- User may need to sign out and back in

---

## Field Explanations

| Field | Type | Description |
|-------|------|-------------|
| `hasAuthHeader` | boolean | Was Authorization header present? |
| `headerPrefix` | string\|null | First word of header (should be "Bearer") |
| `tokenLen` | number | Length of token string (not the token itself) |
| `issHost` | string | Hostname from JWT `iss` claim (masked) |
| `envHost` | string | Hostname from Worker's `SUPABASE_URL` (masked) |
| `projectMatch` | boolean | Do `issHost` and `envHost` match? |
| `userId` | string\|null | User ID if auth succeeded |
| `authOutcome` | string | Final auth result (see below) |

---

## Auth Outcomes

| Outcome | Meaning | Action |
|---------|---------|--------|
| `OK` | ✅ Authentication successful | None needed |
| `NO_HEADER` | ❌ No Authorization header | Add header to request |
| `PROJECT_MISMATCH` | ❌ Token from wrong project | Fix project configuration |
| `INVALID_TOKEN` | ❌ Token validation failed | Refresh token or re-login |

---

## Usage Examples

### Using cURL
```bash
# With valid token
curl -H "Authorization: Bearer eyJhbGc..." \
  https://aikizi.xyz/v1/debug/auth

# Without auth (to test NO_HEADER)
curl https://aikizi.xyz/v1/debug/auth
```

### Using JavaScript
```javascript
const { data: { session } } = await supabase.auth.getSession();

const response = await fetch('https://aikizi.xyz/v1/debug/auth', {
  headers: {
    'Authorization': `Bearer ${session.access_token}`
  }
});

const debug = await response.json();
console.log('Auth Debug:', debug);

// Check if working
if (debug.authOutcome === 'OK') {
  console.log('✅ Auth is working!');
} else {
  console.error('❌ Auth issue:', debug.authOutcome);
}
```

### Using Browser DevTools
```javascript
// Open DevTools Console on aikizi.xyz
const token = (await supabase.auth.getSession()).data.session?.access_token;

fetch('https://aikizi.xyz/v1/debug/auth', {
  headers: { 'Authorization': `Bearer ${token}` }
})
  .then(r => r.json())
  .then(console.log);
```

---

## Troubleshooting Flow

### Step 1: Check Basic Auth
```bash
curl -H "Authorization: Bearer <token>" \
  https://aikizi.xyz/v1/debug/auth
```

**Expected:** `authOutcome: "OK"`
**If not:** Continue to Step 2

### Step 2: Verify Project Match
Look at response:
```json
{
  "issHost": "abc123.supabase.co",
  "envHost": "xyz789.supabase.co",
  "projectMatch": false
}
```

If `projectMatch: false`:
1. Client env: check `VITE_SUPABASE_URL` in `.env`
2. Worker env: check `SUPABASE_URL` in Cloudflare dashboard
3. Ensure both point to same project reference

### Step 3: Verify Token Freshness
If `authOutcome: "INVALID_TOKEN"`:
```javascript
// Refresh token
const { data, error } = await supabase.auth.refreshSession();
if (error) {
  console.error('Token refresh failed, need to re-login');
  await supabase.auth.signOut();
  // Redirect to login
}
```

### Step 4: Check Service Key
In Cloudflare Workers dashboard:
1. Navigate to Worker → Settings → Variables
2. Verify `SUPABASE_SERVICE_KEY` exists
3. Verify it's for the correct project (matches `SUPABASE_URL`)

---

## Security Notes

### ✅ Safe to Share
- `authOutcome` status
- `projectMatch` boolean
- `tokenLen` number
- Masked host names

### ❌ Never Share
- Full token value
- Service keys
- Anon keys
- Full Supabase URLs (mask project ID)

---

## Admin Access

If `ADMIN_USER_IDS` is configured in worker, only those users can access this endpoint.

**Response when not admin:**
```json
{
  "error": "admin access required"
}
```

**To add admin:**
1. Get your user ID from a successful auth
2. Edit `src/worker/index.ts`
3. Add to `ADMIN_USER_IDS` array:
```typescript
const ADMIN_USER_IDS = [
  '550e8400-e29b-41d4-a716-446655440000',  // your-user-id
];
```
4. Redeploy worker: `npm run deploy:worker`

---

## Rate Limiting

No special rate limits on this endpoint, but:
- Use responsibly (debugging tool, not production monitoring)
- Consider caching results if calling frequently
- Use Worker logs for production monitoring

---

## Related Endpoints

Once auth is confirmed working via `/debug/auth`:
- `GET /v1/balance` - Check token balance
- `POST /v1/decode` - Decode images (requires auth)
- `POST /v1/ensure-account` - Ensure user account exists

All use the same authentication mechanism verified by `/debug/auth`.
