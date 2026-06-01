# Zenith Mind — ElevenLabs Migration Deployment Checklist

**Date:** 2026-06-01
**Estimated Time:** 15–20 minutes
**Prerequisites:** Supabase CLI installed, Supabase project active, new ElevenLabs API key ready

---

## Pre-Flight

- [ ] New ElevenLabs API key is ready (starts with `sk_`)
- [ ] Supabase project is active at `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`
- [ ] Supabase CLI is installed: `supabase --version` shows `1.x` or higher
- [ ] You are in the project directory: `C:\Users\manif\Downloads\zenith-mind`

---

## Step 1 — Run SQL Migration

**What:** Creates `elevenlabs_usage` and `rate_limits` tables.

**How:**
1. Open Supabase Dashboard → SQL Editor
2. Click "New query"
3. Paste the entire contents of `supabase/migrations/002_elevenlabs_usage.sql`
4. Click "Run"

**Expected output:**
```
Success. No rows returned
```

**Verify:**
Run this in SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('elevenlabs_usage', 'rate_limits');
```

**Expected output:**
```
table_name
─────────────────────
elevenlabs_usage
rate_limits
(2 rows)
```

**Verify rate limits seeded:**
```sql
SELECT * FROM rate_limits;
```

**Expected output:**
```
tier           | hourly_max | daily_max
───────────────┼────────────┼──────────
free           |         30 |       200
transcendence  |        100 |      1000
illumination   |        300 |      5000
(3 rows)
```

- [ ] Tables created successfully
- [ ] Rate limits seeded correctly

---

## Step 2 — Link Supabase CLI

**What:** Connects your local CLI to your Supabase project.

**Command:**
```bash
cd C:\Users\manif\Downloads\zenith-mind
supabase login
```

**Expected output:**
```
Opening browser to login...
Token stored successfully.
```

**Command:**
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

*Replace `YOUR_PROJECT_REF` with your actual project ref (found in the Supabase Dashboard URL).*

**Expected output:**
```
Linked project YOUR_PROJECT_REF to .supabase/config.toml
```

- [ ] CLI linked to project

---

## Step 3 — Set ElevenLabs API Key Secret

**What:** Stores the new API key in Supabase Edge Function secrets (server-side only).

**Command:**
```bash
supabase secrets set ELEVENLABS_API_KEY=sk_your_new_key_here
```

*Replace `sk_your_new_key_here` with your actual new ElevenLabs API key.*

**Expected output:**
```
Finished supabase secrets set.
```

**Verify:**
```bash
supabase secrets list
```

**Expected output (key value will be hidden):**
```
NAME                | VALUE
────────────────────┼──────────────
ELEVENLABS_API_KEY  | sk_...xxxx
```

- [ ] Secret set successfully
- [ ] Secret appears in list

---

## Step 4 — Deploy Edge Function

**What:** Deploys the `elevenlabs-proxy` function to Supabase.

**Command:**
```bash
supabase functions deploy elevenlabs-proxy
```

**Expected output:**
```
Deploying Function (project-ref: YOUR_PROJECT_REF)
  Bundling elevenlabs-proxy
  Deploying elevenlabs-proxy (project-ref: YOUR_PROJECT_REF)
  Function elevenlabs-proxy deployed successfully
```

**Verify:**
```bash
supabase functions list
```

**Expected output:**
```
ID                | NAME              | STATUS | VERSION | UPDATED_AT
──────────────────┼───────────────────┼────────┼─────────┼──────────────────────
elevenlabs-proxy  | elevenlabs-proxy  | ACTIVE |       1 | 2026-06-01 ...
```

- [ ] Function deployed successfully
- [ ] Status shows ACTIVE

---

## Step 5 — Verify Edge Function Works

**What:** Tests the proxy endpoint responds correctly.

**Command (requires a valid JWT — get one by signing in on the site, then check DevTools → Application → Local Storage → sb-YOUR_PROJECT-ref-auth-token):**

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/elevenlabs-proxy" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"endpoint\":\"sound-generation\",\"text\":\"gentle rain\",\"duration_seconds\":5}" ^
  --output test_audio.mp3 ^
  -w "\nHTTP Status: %%{http_code}\nSize: %%{size_download} bytes\n"
```

*On PowerShell, use backtick `` ` `` for line continuation instead of `^`, or put the command on one line.*

**Expected output:**
```
HTTP Status: 200
Size: XXXXX bytes
```

**If 401:**
```
HTTP Status: 401
```
This means the JWT is invalid or expired. Sign in again and get a fresh token.

**If 429:**
```
HTTP Status: 429
```
Rate limit hit. Wait 1 hour or lower the limit in `rate_limits` table for testing.

**Cleanup:**
```bash
del test_audio.mp3
```

- [ ] Returns HTTP 200
- [ ] Audio file downloaded (non-zero size)

---

## Step 6 — Remove Old GitHub Secret

**What:** Removes the `ELEVENLABS_API_KEY` from GitHub repository secrets (no longer needed).

**How:**
1. Go to: `https://github.com/Manifestation16/zenith-mind-Consciousness-/settings/secrets/actions`
2. Find `ELEVENLABS_API_KEY`
3. Click the trash icon → Confirm deletion

**Verify:** The secret no longer appears in the list.

- [ ] `ELEVENLABS_API_KEY` removed from GitHub secrets

---

## Step 7 — Commit and Push Client Code

**What:** Deploys the updated `index.html` (with proxy calls) and updated `deploy.yml` (without key injection).

**Command:**
```bash
cd C:\Users\manif\Downloads\zenith-mind
git add index.html supabase/ .github/workflows/deploy.yml reports/
git status
```

**Expected output:**
```
On branch main
Changes to be committed:
  modified:   .github/workflows/deploy.yml
  modified:   index.html
  new file:   reports/elevenlabs-migration-guide.md
  new file:   reports/security-final-review.md
  new file:   supabase/functions/elevenlabs-proxy/index.ts
  new file:   supabase/migrations/002_elevenlabs_usage.sql
```

**Command:**
```bash
git commit -m "feat: migrate ElevenLabs behind secure Supabase Edge Function proxy"
```

**Expected output:**
```
[main abc1234] feat: migrate ElevenLabs behind secure Supabase Edge Function proxy
 6 files changed, XXX insertions(+), XX deletions(-)
```

**Command:**
```bash
git push origin main
```

**Expected output:**
```
Enumerating objects: X, done.
Counting objects: 100% (X/X), done.
Writing objects: 100% (X/X), XXX KiB | XXX KiB/s, done.
Total X (delta X), reused X (delta X)
To https://github.com/Manifestation16/zenith-mind-Consciousness-.git
   abc1234..def5678  main -> main
```

- [ ] Commit successful
- [ ] Push successful

---

## Step 8 — Verify GitHub Actions Deployment

**What:** Confirms the auto-deploy pipeline succeeds.

**How:**
1. Go to: `https://github.com/Manifestation16/zenith-mind-Consciousness-/actions`
2. Click the latest workflow run (should be "Deploy Zenith Mind to GitHub Pages")
3. Wait for green checkmark (~1-2 minutes)

**Expected:** All steps pass. The "Inject credentials" step should show:
```
sed -i "s|YOUR_SUPABASE_URL|...|g" index.html
sed -i "s|YOUR_SUPABASE_ANON_KEY|...|g" index.html
sed -i "s|YOUR_STRIPE_TRANSCENDENCE_LINK|...|g" index.html
sed -i "s|YOUR_STRIPE_ILLUMINATION_LINK|...|g" index.html
```

**Verify:** No line for `ELEVENLABS_API_KEY` — it was removed from `deploy.yml`.

- [ ] Workflow completed successfully
- [ ] No `ELEVENLABS_API_KEY` in inject step

---

## Step 9 — Verify Live Site

**What:** Confirms the migration works end-to-end on the production site.

**9A. No API key in source:**
1. Open: `https://manifestation16.github.io/zenith-mind-Consciousness-/`
2. Right-click → View Source
3. Press `Ctrl+F`, search for `ELEVENLABS_API_KEY`

**Expected:** No matches. Only `USE_ELEVENLABS = true` and `ELEVENLABS_PROXY_URL` should appear.

- [ ] No `ELEVENLABS_API_KEY` in source

**9B. Sign in and test sound generation:**
1. Click "Sign In" → Enter credentials → Sign in
2. Scroll to "Sound Sanctuary" section
3. Click any sound card (e.g., "Midnight Rain")

**Expected:**
- Card shows "Generating..." briefly
- Then shows "▶ Playing" with wave animation
- Bottom bar appears with sound name and "Now playing — looping seamlessly ✦"
- Audio plays

- [ ] Sound generates and plays
- [ ] No console errors

**9C. Verify Network tab:**
1. Open DevTools → Network tab
2. Click another sound card
3. Find the request to `elevenlabs-proxy`

**Expected:**
- Request URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/elevenlabs-proxy`
- Request headers: `Authorization: Bearer eyJ...` (JWT)
- Request headers: NO `xi-api-key`
- Response: `200 OK`, Content-Type: `audio/mpeg`

- [ ] Request goes to proxy URL
- [ ] JWT in Authorization header
- [ ] No xi-api-key header
- [ ] 200 response with audio

**9D. Test meditation narration:**
1. Scroll to "Meditation Experiences"
2. Click "Neural Reset" (free meditation)
3. Click "Begin Session"

**Expected:**
- Meditation player opens with timer
- Narration audio plays (voice says "Close your eyes...")
- Phase changes trigger new narration

- [ ] Narration plays
- [ ] Phase transitions work

**9E. Test auth enforcement:**
1. Sign out
2. Click any sound card

**Expected:**
- Toast: "Sign in to use AI soundscapes"
- Auth modal opens

- [ ] Auth required for sound generation

---

## Step 10 — Verify Usage Logging

**What:** Confirms requests are being logged in the database.

**Command:** Run in Supabase SQL Editor:
```sql
SELECT
  endpoint,
  status,
  COUNT(*) as requests,
  MAX(created_at) as latest
FROM elevenlabs_usage
GROUP BY endpoint, status
ORDER BY latest DESC;
```

**Expected output (after testing):**
```
endpoint         | status | requests | latest
─────────────────┼────────┼──────────┼──────────────────────
sound-generation |    200 |        2 | 2026-06-01 ...
text-to-speech   |    200 |        1 | 2026-06-01 ...
```

- [ ] Usage rows appear
- [ ] Status is 200 for successful requests

---

## Post-Deployment

- [ ] Remove `ELEVENLABS_API_KEY` from GitHub repository secrets (Step 6)
- [ ] Store the new ElevenLabs API key in a password manager (NOT in any code or config file)
- [ ] Bookmark the Supabase Edge Function logs: `supabase functions logs elevenlabs-proxy --tail`

---

## Rollback (If Needed)

If anything fails after deployment:

**Immediate rollback (5 minutes):**
```bash
cd C:\Users\manif\Downloads\zenith-mind
git revert HEAD
git push origin main
```

Then re-add `ELEVENLABS_API_KEY` to GitHub secrets and restore the sed line in `deploy.yml`.

**Investigate:**
```bash
supabase functions logs elevenlabs-proxy
```

---

## Summary

| Step | Command/Action | Time |
|------|---------------|------|
| 1 | Run SQL migration | 2 min |
| 2 | `supabase link` | 1 min |
| 3 | `supabase secrets set` | 1 min |
| 4 | `supabase functions deploy` | 2 min |
| 5 | curl test | 2 min |
| 6 | Remove GitHub secret | 1 min |
| 7 | `git push` | 1 min |
| 8 | Wait for GitHub Actions | 2 min |
| 9 | Verify live site | 5 min |
| 10 | Verify usage logging | 1 min |
| **Total** | | **~18 min** |

---

*Deployment checklist — Zenith Mind ElevenLabs migration*
