# ElevenLabs Migration Guide — Secure Proxy Deployment

**Date:** 2026-06-01
**Purpose:** Step-by-step instructions to deploy the ElevenLabs Edge Function proxy

---

## Prerequisites

- Supabase project with Auth enabled
- Supabase CLI installed (`npm install -g supabase`)
- New ElevenLabs API key (the revoked key must NOT be reused)
- Node.js 18+ installed

---

## Step 1: Run the SQL Migration

Open the Supabase Dashboard → SQL Editor and paste the contents of:

```
supabase/migrations/002_elevenlabs_usage.sql
```

This creates:
- `elevenlabs_usage` table — audit log + rate limit source
- `rate_limits` table — configurable per-tier limits (30/hr free, 100/hr transcendence, 300/hr illumination)
- Indexes for fast rate-limit lookups

Click **Run**. Verify no errors.

---

## Step 2: Link Supabase CLI to Your Project

```bash
cd zenith-mind
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in the Supabase Dashboard URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`

---

## Step 3: Set the ElevenLabs API Key as a Supabase Secret

```bash
supabase secrets set ELEVENLABS_API_KEY=sk_your_new_key_here
```

**Verify:**
```bash
supabase secrets list
```

You should see `ELEVENLABS_API_KEY` in the output. The key is now stored server-side only — it never appears in client code, git history, or GitHub Actions secrets.

---

## Step 4: Deploy the Edge Function

```bash
supabase functions deploy elevenlabs-proxy
```

**Verify:**
```bash
supabase functions list
```

You should see `elevenlabs-proxy` with status `ACTIVE`.

---

## Step 5: Update GitHub Secrets

Go to: `https://github.com/Manifestation16/zenith-mind-Consciousness-/settings/secrets/actions`

**Remove** the `ELEVENLABS_API_KEY` secret — it's no longer needed. The key lives in Supabase now.

Keep these secrets (still needed):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `STRIPE_TRANSCENDENCE_LINK`
- `STRIPE_ILLUMINATION_LINK`

---

## Step 6: Deploy the Updated Client Code

Commit and push all changes:

```bash
git add index.html supabase/ .github/workflows/deploy.yml
git commit -m "feat: migrate ElevenLabs behind secure Supabase Edge Function proxy"
git push origin main
```

GitHub Actions will auto-deploy. The `ELEVENLABS_API_KEY` sed injection has been removed from `deploy.yml`.

---

## Step 7: Verify the Migration

### 7.1 Check that no API key is exposed

1. Open your live site
2. Right-click → View Source
3. Search for `ELEVENLABS` — you should find only:
   ```javascript
   const USE_ELEVENLABS = true;
   const ELEVENLABS_PROXY_URL = SUPABASE_URL + '/functions/v1/elevenlabs-proxy';
   ```
4. No `sk_` key anywhere in the source

### 7.2 Check Network tab

1. Open DevTools → Network tab
2. Click a sound card to trigger generation
3. Find the request to `/functions/v1/elevenlabs-proxy`
4. Verify the request headers contain:
   - `Authorization: Bearer <jwt>` (your Supabase session token)
   - `Content-Type: application/json`
5. Verify there is NO `xi-api-key` header
6. Verify the response is `audio/mpeg` (200 OK)

### 7.3 Check usage logging

Run this in the Supabase SQL Editor after triggering a few sounds:

```sql
SELECT * FROM elevenlabs_usage ORDER BY created_at DESC LIMIT 10;
```

You should see rows with your `user_id`, `endpoint` (`sound-generation` or `text-to-speech`), and `status` (200).

### 7.4 Check rate limiting

To test rate limiting without waiting:
1. Temporarily lower the limit in `rate_limits`:
   ```sql
   UPDATE rate_limits SET hourly_max = 2 WHERE tier = 'free';
   ```
2. Trigger 3 sound generations
3. The 3rd should show a "Rate limit reached" toast
4. Restore the limit:
   ```sql
   UPDATE rate_limits SET hourly_max = 30 WHERE tier = 'free';
   ```

### 7.5 Check auth enforcement

1. Sign out
2. Click a sound card
3. Should show "Sign in to use AI soundscapes" toast and open the auth modal

---

## Architecture After Migration

```
Browser (index.html)
  │
  │  POST /functions/v1/elevenlabs-proxy
  │  Headers: Authorization: Bearer <jwt>
  │  Body: { endpoint, text, ... }
  │
  ▼
Supabase Edge Function (elevenlabs-proxy)
  │
  │  1. Validate JWT
  │  2. Look up user tier (profiles table)
  │  3. Check rate limit (elevenlabs_usage count)
  │  4. Validate request body
  │  5. Forward to ElevenLabs with server-side API key
  │  6. Log usage to elevenlabs_usage
  │  7. Stream audio back to client
  │
  ▼
ElevenLabs API (api.elevenlabs.io)
  │
  │  POST /v1/sound-generation
  │  POST /v1/text-to-speech/{voice_id}/stream
  │  Header: xi-api-key (server-side only)
  │
  ▼
Audio response streamed back to browser
```

---

## Rollback Plan

If the Edge Function causes issues:

1. **Immediate rollback (5 minutes):**
   - Revert `index.html` to the previous version
   - Restore the `ELEVENLABS_API_KEY` sed line in `deploy.yml`
   - Re-add the API key as a GitHub secret
   - Push to trigger redeploy

2. **Investigate:**
   - Check Edge Function logs: `supabase functions logs elevenlabs-proxy`
   - Check usage table: `SELECT * FROM elevenlabs_usage ORDER BY created_at DESC LIMIT 20`

---

## Monitoring

### Usage Dashboard (SQL)

```sql
-- Requests in the last hour by endpoint
SELECT endpoint, COUNT(*) as requests
FROM elevenlabs_usage
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY endpoint;

-- Requests in the last 24 hours by user
SELECT user_id, COUNT(*) as requests, MAX(created_at) as last_request
FROM elevenlabs_usage
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id
ORDER BY requests DESC;

-- Rate-limited requests (429s)
SELECT COUNT(*) as rate_limited
FROM elevenlabs_usage
WHERE status = 429 AND created_at > NOW() - INTERVAL '24 hours';
```

### Edge Function Logs

```bash
supabase functions logs elevenlabs-proxy --tail
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `supabase/functions/elevenlabs-proxy/index.ts` | **Created** — Edge Function proxy |
| `supabase/migrations/002_elevenlabs_usage.sql` | **Created** — DB schema |
| `index.html` | **Modified** — Removed API key, rewrote generate()/getNarration() |
| `.github/workflows/deploy.yml` | **Modified** — Removed ELEVENLABS_API_KEY injection |

---

*Migration guide — Zenith Mind ElevenLabs secure proxy*
