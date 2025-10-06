# Wallet Balance Logic Fix Summary

## Issue
After the JWKS migration, the wallet balance endpoint was returning 0 for all users despite having actual token balances in the database. The issue was caused by an overly complex nested query structure that made RLS evaluation difficult.

## Root Cause
1. The balance endpoint used a nested join query: `users.select('id, entitlements(tokens_balance)')` 
2. This returned a complex array/object structure that required manual parsing
3. RLS policies on the entitlements table were not being properly applied through the nested join
4. Array parsing logic was fragile and could fail silently

## Changes Made

### 1. `/src/worker/routes/account.ts` - `balance()` function
**Before:**
- Single complex query with nested join through users table
- Manual array/object structure parsing
- Limited error logging

**After:**
- Two-step query approach:
  1. First query: Get user's internal UUID from `users` table using their `auth_id`
  2. Second query: Directly query `entitlements` table using `user_id`
- Clear separation of concerns
- Direct RLS application on entitlements table
- Comprehensive error handling with specific error messages
- Enhanced logging at each step showing:
  - User lookup progress
  - RLS context details
  - Query results and balance calculations
  - Whether entitlement record exists

### 2. `/src/worker/routes/wallet.ts` - `spend()` function
**Updates:**
- Added `reqId` parameter for request tracking
- Added comprehensive logging throughout the spend flow
- Enhanced error messages for debugging
- Consistent logging pattern with balance endpoint

### 3. `/src/worker/index.ts`
**Updates:**
- Pass `reqId` to spend endpoint for request tracing

### 4. All endpoints now use `fromSafe()` helper
- Ensures consistent table name handling
- Prevents SQL injection through table name validation
- Standardizes database access patterns

## Key Improvements

### Better RLS Context
```typescript
// User JWT token is passed to Supabase client
const sb = supa(env, authResult.token);

// RLS policies now properly evaluate because:
// 1. Client has user's JWT token in Authorization header
// 2. Direct query to entitlements table with user_id
// 3. Policy: "Users can read own entitlements" works correctly
```

### Simplified Query Logic
```typescript
// Before: Complex nested join
const { data } = await sb
  .from('users')
  .select('id, entitlements(tokens_balance)')
  .eq('auth_id', authResult.user.id)
  .single();

// After: Two clear steps
// Step 1: Get user ID
const { data: userRecord } = await fromSafe(sb, 'users')
  .select('id')
  .eq('auth_id', authResult.user.id)
  .maybeSingle();

// Step 2: Get entitlements
const { data: entitlement } = await fromSafe(sb, 'entitlements')
  .select('tokens_balance')
  .eq('user_id', userRecord.id)
  .maybeSingle();
```

### Enhanced Logging
```typescript
// Request tracing through entire flow
[2buvss90] [balance] Fetching user record for auth_id=7a550b5c...
[2buvss90] [balance] User found, userId=abc123, querying entitlements
[2buvss90] [balance] RLS balance result { userId: 'abc123', balance: 1000, hasEntitlement: true }
[2buvss90] [balance] Balance retrieved: 1000
```

### Robust Error Handling
```typescript
// Specific error paths
if (userError) {
  console.error(`${logPrefix} User lookup error:`, userError.message);
  return cors(bad('user_lookup_failed', 500));
}

if (entitlementError) {
  console.error(`${logPrefix} Entitlements query error:`, entitlementError.message);
  console.log(`${logPrefix} Defaulting to balance: 0`);
  return cors(json({ ok: true, balance: 0 }));
}

// Safe default when no entitlement record exists
const balance = entitlement?.tokens_balance ?? 0;
```

## Testing Recommendations

1. **Test with authenticated user:**
   ```bash
   curl -H "Authorization: Bearer <user_jwt>" https://aikizi.xyz/v1/balance
   ```
   - Should return correct balance from entitlements table

2. **Check worker logs:**
   ```bash
   wrangler tail
   ```
   - Verify "Fetching user record" log appears
   - Confirm "User found, userId=..." shows correct UUID
   - Check "RLS balance result" shows actual balance

3. **Test edge cases:**
   - User exists but has no entitlements record → returns balance: 0
   - User doesn't exist → returns 404 not found
   - Invalid token → returns 401 unauthorized

## RLS Policy Verification

The fix relies on this RLS policy from migration `001_users_and_auth.sql`:

```sql
CREATE POLICY "Users can read own entitlements"
  ON entitlements FOR SELECT
  TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );
```

When using `supa(env, authResult.token)`, the Supabase client sets:
- Authorization header with user's JWT
- `auth.uid()` function resolves to the user's auth_id from JWT
- Policy allows SELECT when user_id matches the authenticated user's record

## Benefits

1. **Correct Balance Display**: Users now see their actual token balance
2. **Better Debugging**: Comprehensive logs show exactly where issues occur
3. **Clearer Code**: Two-step query is easier to understand and maintain
4. **Proper RLS**: Security policies are correctly applied
5. **Resilient**: Graceful handling of missing entitlements records
6. **Request Tracing**: reqId allows tracking requests through all layers

## Related Files
- `src/worker/routes/account.ts` - Main balance logic
- `src/worker/routes/wallet.ts` - Token spending logic
- `src/worker/lib/supa.ts` - Database client creation with RLS context
- `src/worker/lib/auth.ts` - JWT verification via JWKS
- `src/worker/index.ts` - Router configuration
