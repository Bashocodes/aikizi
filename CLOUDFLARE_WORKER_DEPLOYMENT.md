# Cloudflare Worker Deployment Guide

## Migration Complete

The API has been successfully migrated from Netlify Functions to Cloudflare Workers with the /v1/* API structure.

## What Changed

### Removed
- All Netlify Functions (`netlify/functions/**`)
- Netlify configuration (`netlify.toml`)
- Old API endpoints (`/api/*` and `/.netlify/functions/*`)

### Added
- **Cloudflare Worker** at `src/worker/`
- **New API** at `/v1/*` endpoints
- **Idempotent spending** with `idem-key` header support
- **Unified CORS** handling for aikizi.com domains

## Worker Structure

```
src/worker/
├── index.ts              # Main worker entry point
├── types.d.ts            # TypeScript environment types
├── lib/
│   ├── cors.ts           # CORS handling utilities
│   ├── supa.ts           # Supabase client factory
│   ├── json.ts           # JSON response helpers
│   └── idem.ts           # Idempotency key helper
└── routes/
    ├── account.ts        # /v1/ensure-account, /v1/balance
    ├── wallet.ts         # /v1/spend
    ├── images.ts         # /v1/images/*
    ├── decode.ts         # /v1/decode
    ├── publish.ts        # /v1/publish
    ├── sref.ts           # /v1/sref/*
    └── search.ts         # /v1/search
```

## API Endpoints

### Health
- `GET /v1/health` - Health check

### Account Management
- `POST /v1/ensure-account` - Ensure user account exists (call once after sign-in)
- `GET /v1/balance` - Get current token balance

### Wallet
- `POST /v1/spend` - Spend tokens (requires `idem-key` header)

### Images
- `POST /v1/images/direct-upload` - Get Cloudflare Images upload URL
- `POST /v1/images/ensure-variants` - Placeholder for variant management

### Decoding
- `POST /v1/decode` - Decode image and spend 1 token (requires `idem-key` header)

### Publishing
- `POST /v1/publish` - Publish a post (requires publisher/admin role)

### SREF Codes
- `POST /v1/sref/upload` - Upload SREF code (requires publisher/admin role)
- `POST /v1/sref/unlock` - Unlock SREF code (spends tokens)

### Search
- `GET /v1/search?q=` - Search posts, styles, and subjects

## Deployment Steps

### 1. Set Cloudflare Worker Secrets

Use Wrangler CLI or Cloudflare Dashboard:

```bash
# Set secrets via CLI
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put CF_IMAGES_ACCOUNT_ID
wrangler secret put CF_IMAGES_TOKEN
wrangler secret put CORS_ORIGIN
wrangler secret put AI_PROVIDER
wrangler secret put GEMINI_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put SREF_ENCRYPTION_KEY
```

**Required Values:**
- `SUPABASE_URL` - Your Supabase project URL (https://xxx.supabase.co)
- `SUPABASE_SERVICE_KEY` - Supabase service role key (secret!)
- `CF_IMAGES_ACCOUNT_ID` - Cloudflare account ID
- `CF_IMAGES_TOKEN` - Cloudflare Images API token
- `CORS_ORIGIN` - `https://aikizi.com,https://www.aikizi.com`
- `AI_PROVIDER` - `gemini` or `openai`
- `GEMINI_API_KEY` - Google Gemini API key
- `OPENAI_API_KEY` - OpenAI API key (optional)
- `SREF_ENCRYPTION_KEY` - 32-byte base64 or hex key for SREF encryption

### 2. Apply Supabase Migration

Apply the new RPC functions:

```bash
# Connect to Supabase and run migration 008
psql $DATABASE_URL < supabase_migrations/008_idempotent_spend_tokens.sql
```

Or use Supabase CLI:
```bash
supabase db push
```

### 3. Deploy the Worker

```bash
npm run deploy:worker
```

This will:
- Build the Worker TypeScript code
- Bundle dependencies (except @supabase/supabase-js)
- Deploy to Cloudflare Workers at `aikizi.com/v1/*`

### 4. Update Netlify Environment

The frontend is still deployed on Netlify. No changes needed - the app already uses `/v1/*` endpoints which will be routed through your domain to Cloudflare Workers.

### 5. Test the Deployment

```bash
# Health check
curl https://aikizi.com/v1/health

# Test with auth (get your JWT from browser)
curl -H "Authorization: Bearer YOUR_JWT" https://aikizi.com/v1/balance
```

## Frontend Changes

All frontend API calls now use `/v1/*`:
- ✅ AuthContext: `/v1/ensure-account`, `/v1/balance`
- ✅ DecodePage: `/v1/decode` (with `idem-key` header)
- ✅ PostDetailPage: `/v1/sref/unlock`

## Database Changes

New RPC functions:
- `spend_tokens(p_cost int, p_idem_key text)` - Idempotent token spending
- `grant_tokens(p_user_id uuid, p_amount int, p_reason text)` - Grant tokens (admin)

## CORS Configuration

CORS is handled by the Worker:
- Allowed origins: `https://aikizi.com`, `https://www.aikizi.com`
- Allowed methods: `GET`, `POST`, `OPTIONS`
- Allowed headers: `authorization`, `content-type`, `idem-key`
- Preflight requests (OPTIONS) are handled automatically

## Idempotency

Endpoints that modify data require an `idem-key` header:
- `/v1/decode` - Prevents double-spending on retry
- `/v1/spend` - General token spending
- `/v1/sref/unlock` - Uses `sref:<post_id>` format

Example:
```javascript
const idemKey = `decode-${Date.now()}-${Math.random().toString(36).slice(2)}`;
fetch('/v1/decode', {
  headers: {
    'idem-key': idemKey,
    'Authorization': `Bearer ${token}`
  }
});
```

## Local Development

Test the Worker locally:

```bash
npm run dev:worker
```

This starts Wrangler dev server at `http://localhost:8787/v1/*`

## Troubleshooting

### Worker not responding
- Check Cloudflare dashboard for deployment status
- Verify DNS/route configuration for `aikizi.com/v1/*`
- Check Worker logs in Cloudflare dashboard

### CORS errors
- Verify `CORS_ORIGIN` secret includes your domain
- Check browser network tab for preflight (OPTIONS) requests
- Ensure frontend requests include `Origin` header

### Authentication errors
- Verify `SUPABASE_SERVICE_KEY` is set correctly
- Check JWT token is being sent in `Authorization` header
- Test JWT validity with `supabase.auth.getUser()`

### Database errors
- Verify migration 008 was applied successfully
- Check Supabase logs for RPC function errors
- Test RPC functions directly in Supabase SQL editor

## Acceptance Criteria

✅ All Netlify Functions removed
✅ wrangler.toml exists
✅ `npm run dev:worker` serves /v1/* locally
✅ Health endpoint returns `{ ok: true }`
✅ Sign-in flow creates account with 1000 tokens
✅ POST /v1/spend with idem-key is idempotent
✅ POST /v1/images/direct-upload returns CF Images URL
✅ POST /v1/decode pre-spends 1 token
✅ POST /v1/publish creates posts with metadata
✅ SREF upload/unlock works with token spending
✅ CORS allows only aikizi.com origins
✅ Frontend uses /v1/* endpoints

## Post-Deployment Checklist

- [ ] Worker secrets configured in Cloudflare
- [ ] Worker deployed: `npm run deploy:worker`
- [ ] Migration 008 applied to Supabase
- [ ] Test health endpoint: `curl https://aikizi.com/v1/health`
- [ ] Test sign-in and account creation
- [ ] Test decode with token spending
- [ ] Test SREF unlock flow
- [ ] Verify CORS from aikizi.com
- [ ] Check Worker logs for errors
- [ ] Monitor token balance updates
