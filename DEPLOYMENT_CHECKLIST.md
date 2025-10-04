# Deployment Checklist - Auth Fixpack v2

## Pre-Deployment

### Code Quality
- [x] TypeScript compilation passes
- [x] Vite build succeeds (422KB bundle)
- [x] No console errors in dev mode
- [x] All files saved and committed

### Environment Variables
- [ ] Verify `SUPABASE_URL` matches between client and worker
- [ ] Verify `SUPABASE_SERVICE_KEY` is set in Worker env
- [ ] Verify `SUPABASE_ANON_KEY` is set in both client and worker
- [ ] Verify all API keys are present (OpenAI, Gemini, CF Images)

### Documentation
- [x] `AUTH_V2_PROJECT_MISMATCH.md` created
- [x] `DEBUG_AUTH_GUIDE.md` created
- [x] `AUTH_FIXPACK_COMPLETE.md` created

---

## Deployment

### Step 1: Deploy Cloudflare Worker
```bash
npm run deploy:worker
```

**Expected Output:**
```
✨ Compiled Worker successfully
✨ Uploaded to Cloudflare
✨ Deployed to aikizi.xyz/v1/*
```

- [ ] Deployment successful
- [ ] No error messages
- [ ] Route `aikizi.xyz/v1/*` confirmed

### Step 2: Health Check
```bash
curl https://aikizi.xyz/v1/health
```

**Expected:** `{"ok":true}`

- [ ] Health endpoint returns 200
- [ ] Response is valid JSON

### Step 3: Verify Environment Variables
In Cloudflare Dashboard:
- [ ] Workers & Pages → aikizi-api → Settings → Variables
- [ ] `SUPABASE_URL` present and correct
- [ ] `SUPABASE_SERVICE_KEY` present (encrypted)
- [ ] All other variables present

---

## Post-Deployment Testing

### Test 1: Anonymous Access (Should Fail)
```bash
curl https://aikizi.xyz/v1/balance
```

**Expected:** `401 {"error":"auth required","code":"NO_AUTH_HEADER"}`

- [ ] Returns 401 status
- [ ] Error code is `NO_AUTH_HEADER`

### Test 2: Balance Endpoint (Authenticated)
1. Sign in at https://aikizi.xyz
2. Open DevTools Console
3. Run:
```javascript
const token = (await supabase.auth.getSession()).data.session?.access_token;
console.log('Token:', token?.substring(0, 20) + '...');

fetch('https://aikizi.xyz/v1/balance', {
  headers: { 'Authorization': `Bearer ${token}` }
})
  .then(r => r.json())
  .then(console.log);
```

**Expected:** `{"ok":true,"balance":<number>}`

- [ ] Returns 200 status
- [ ] Balance is a valid number
- [ ] No 401 errors

### Test 3: Debug Auth Endpoint
```javascript
const token = (await supabase.auth.getSession()).data.session?.access_token;

fetch('https://aikizi.xyz/v1/debug/auth', {
  headers: { 'Authorization': `Bearer ${token}` }
})
  .then(r => r.json())
  .then(console.log);
```

**Expected:**
```json
{
  "hasAuthHeader": true,
  "headerPrefix": "Bearer",
  "tokenLen": 245,
  "issHost": "...",
  "envHost": "...",
  "projectMatch": true,
  "userId": "...",
  "authOutcome": "OK"
}
```

- [ ] `projectMatch` is `true`
- [ ] `authOutcome` is `"OK"`
- [ ] `userId` is not null

### Test 4: Decode Endpoint
1. Navigate to https://aikizi.xyz/decode
2. Upload an image
3. Select a model
4. Click "Decode"

**Expected:**
- [ ] No 401 errors in Network tab
- [ ] Request shows `Authorization: Bearer <token>` header
- [ ] Response is 200 OK
- [ ] Decode result appears on screen
- [ ] Token balance decreases by 1

### Test 5: Case-Insensitive Headers (cURL)
```bash
# Get token from browser console first
TOKEN="<paste-token-here>"

# Test lowercase 'authorization'
curl -H "authorization: bearer $TOKEN" \
  https://aikizi.xyz/v1/balance

# Test mixed case
curl -H "Authorization: Bearer $TOKEN" \
  https://aikizi.xyz/v1/balance
```

**Expected:** Both return same successful response

- [ ] Lowercase header works
- [ ] Mixed case header works
- [ ] Both return 200 OK

---

## Monitoring (First Hour)

### Cloudflare Logs
Navigate to: Workers & Pages → aikizi-api → Logs (Live)

**Watch For:**
- [ ] No `PROJECT_MISMATCH` errors
- [ ] Auth outcome mostly `"OK"`
- [ ] Request IDs present in logs
- [ ] No unhandled exceptions

### User Reports
- [ ] No user complaints about decode failing
- [ ] No reports of "Please sign in" errors
- [ ] Token balances updating correctly

### Metrics
Check after 1 hour:
- [ ] Decode success rate > 95%
- [ ] 401 error rate < 5% (expected for signed-out users)
- [ ] No increase in error rates vs. baseline

---

## Rollback Triggers

**Immediate Rollback If:**
- Decode success rate drops below 80%
- Large spike in 401 errors for signed-in users
- PROJECT_MISMATCH errors appearing
- Unhandled exceptions in Worker logs

**Rollback Procedure:**
1. Go to Cloudflare Dashboard
2. Workers & Pages → aikizi-api → Deployments
3. Find previous version (before today)
4. Click "Rollback to this version"
5. Verify health endpoint
6. Notify team

---

## Post-Deployment Verification

### Success Criteria
- [ ] All post-deployment tests passing
- [ ] No increase in error rates
- [ ] User decode functionality working
- [ ] Token balances updating correctly
- [ ] Logs show proper request IDs
- [ ] Debug endpoint accessible (if admin configured)

### Final Checks (After 24 Hours)
- [ ] Check 24h metrics in Cloudflare
- [ ] Review any user-reported issues
- [ ] Verify no unexpected charges
- [ ] Check database for decode records
- [ ] Confirm token spend tracking accurate

---

## Troubleshooting

### Issue: Health endpoint fails
```bash
curl https://aikizi.xyz/v1/health
```

**If 404:** Route not configured correctly in Cloudflare
**If 500:** Worker deployment failed
**If timeout:** Worker not responding

**Fix:** Check Cloudflare Dashboard → Workers & Pages → aikizi-api

---

### Issue: All requests return 401

**Check:**
1. Is `SUPABASE_SERVICE_KEY` set in Worker env?
2. Does it match the project in `SUPABASE_URL`?
3. Is the key valid (not expired)?

**Test:**
```bash
curl -H "Authorization: Bearer test" \
  https://aikizi.xyz/v1/debug/auth
```

Should show `authOutcome: "INVALID_TOKEN"` (not a crash)

---

### Issue: PROJECT_MISMATCH errors

**Symptoms:** Debug endpoint shows `projectMatch: false`

**Fix:**
1. Check client `.env`: `VITE_SUPABASE_URL`
2. Check worker env in Cloudflare: `SUPABASE_URL`
3. Ensure both use exact same URL
4. Redeploy if needed

---

### Issue: Debug endpoint returns 403

**Symptoms:** `{"error":"admin access required"}`

**Fix:**
1. Edit `src/worker/index.ts`
2. Find `const ADMIN_USER_IDS = []`
3. Add your user ID: `['your-user-id-here']`
4. Redeploy: `npm run deploy:worker`

Or temporarily comment out admin check for testing.

---

## Sign-Off

### Deployed By: ________________
### Date/Time: ________________
### Version: v2 (Auth Fixpack)
### Status: ☐ Success ☐ Rolled Back

### Notes:
_____________________________________________
_____________________________________________
_____________________________________________

---

## Emergency Contacts

- Cloudflare Dashboard: https://dash.cloudflare.com
- Supabase Dashboard: https://supabase.com/dashboard
- Worker Logs: Workers & Pages → aikizi-api → Logs
- GitHub Repo: _____________

---

**Remember:**
- Test in production immediately after deploy
- Monitor logs for first hour
- Keep this checklist for reference
- Document any issues encountered
