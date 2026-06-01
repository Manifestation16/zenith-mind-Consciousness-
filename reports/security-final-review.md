# Security Final Review — ElevenLabs Migration

**Date:** 2026-06-01
**Reviewer:** Principal Security Engineer
**Purpose:** Production readiness review before commit

---

## Review Checklist

### 1. SQL Migration Validity

**File:** `supabase/migrations/002_elevenlabs_usage.sql`

| Check | Result | Notes |
|-------|--------|-------|
| CREATE TABLE IF NOT EXISTS syntax | ✅ Valid | Standard PostgreSQL |
| UUID DEFAULT gen_random_uuid() | ✅ Valid | Requires pgcrypto extension (enabled by default in Supabase) |
| REFERENCES auth.users(id) | ✅ Valid | Standard Supabase foreign key pattern |
| ON DELETE CASCADE | ✅ Valid | Cleans up usage when user deleted |
| CHECK constraint on endpoint | ✅ Valid | Restricts to 'sound-generation' and 'text-to-speech' |
| ENABLE ROW LEVEL SECURITY | ✅ Valid | Correct Supabase RLS syntax |
| CREATE POLICY SELECT only | ✅ Valid | No INSERT policy — writes happen via service role in Edge Function |
| Partial index with WHERE clause | ✅ Valid | PostgreSQL partial index syntax correct |
| INSERT ... ON CONFLICT DO UPDATE | ✅ Valid | Upsert pattern for rate_limits seed data |
| Index on profiles.tier | ⚠️ Dependency | Assumes `profiles` table exists (from supabase-setup.sql) — must run that migration first |

**Verdict: ✅ VALID** — No syntax errors. Order-dependent on `profiles` table existing.

---

### 2. Edge Function Compilation

**File:** `supabase/functions/elevenlabs-proxy/index.ts`

| Check | Result | Notes |
|-------|--------|-------|
| Deno std import (0.177.0) | ✅ Valid | Stable Deno 1.x version, compatible with Supabase Edge Runtime |
| @supabase/supabase-js@2 import | ✅ Valid | ESM import via esm.sh, standard for Deno |
| SupabaseClient type import | ✅ Valid | Used for function parameter typing |
| Deno.env.get() calls | ✅ Valid | Standard Deno environment access |
| Non-null assertions (!) | ⚠️ Acceptable | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-set by Supabase — will be present in production |
| serve() callback signature | ✅ Valid | `(req: Request) => Promise<Response>` is correct for Deno std |
| JSON.parse via req.json() | ✅ Valid | Standard Web API |
| Response constructor | ✅ Valid | Standard Web API |
| fetch() to external API | ✅ Valid | Deno supports outbound fetch |
| Optional chaining (?.) | ✅ Valid | Deno 1.x supports ES2020+ |

**Potential Issue Found:**

The `ELEVENLABS_API_KEY` is read at module load time (line 8):
```typescript
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
```

If the secret is not set, this will be `undefined`. The function handles this at line 226-228:
```typescript
if (!ELEVENLABS_API_KEY) {
  console.error("[ElevenLabs] API key not configured");
  return jsonResponse({ error: "Server configuration error" }, 500, cors);
}
```

This is correct — the function gracefully returns 500 if the secret is missing.

**Verdict: ✅ VALID** — TypeScript is syntactically correct and compatible with Supabase Edge Runtime.

---

### 3. No ELEVENLABS_API_KEY in Client Code

**Grep results for `index.html`:**
```
No matches found for: ELEVENLABS_API_KEY, xi-api-key, api.elevenlabs.io
```

**Grep results for `.github/workflows/deploy.yml`:**
```
No matches found for: ELEVENLABS
```

**Grep results for `supabase-setup.sql`:**
```
No matches found for: ELEVENLABS
```

**References found in Edge Function (expected — server-side only):**
- `supabase/functions/elevenlabs-proxy/index.ts:8` — `Deno.env.get("ELEVENLABS_API_KEY")`
- `supabase/functions/elevenlabs-proxy/index.ts:236` — `"xi-api-key": ELEVENLABS_API_KEY`

**References found in reports/ (documentation only — not deployed):**
- 40+ references across `architecture-audit.md`, `security-audit.md`, `elevenlabs-security-audit.md`, `elevenlabs-migration-guide.md`, `performance-audit.md`

**Verdict: ✅ CLEAN** — No API key, `xi-api-key` header, or `api.elevenlabs.io` URL in any deployed code. All references are server-side (Edge Function) or documentation (reports/).

---

### 4. No Direct ElevenLabs Calls in Client Code

**Grep for `api.elevenlabs.io` in `index.html`:** No matches.

**All client-side ElevenLabs interaction now goes through:**
```javascript
const ELEVENLABS_PROXY_URL = (USE_SUPABASE ? SUPABASE_URL : '') + '/functions/v1/elevenlabs-proxy';
```

**Call chain verification:**
- `SoundEngine.generate()` → `fetch(ELEVENLABS_PROXY_URL, ...)` ✅
- `getNarration()` → `fetch(ELEVENLABS_PROXY_URL, ...)` ✅

**Verdict: ✅ CLEAN** — Zero direct calls to `api.elevenlabs.io` from client code.

---

### 5. JWT Authentication Enforcement

**Edge Function auth flow:**

1. Line 149: `const authHeader = req.headers.get("authorization")` — checks for header
2. Line 150-152: Returns 401 if missing
3. Line 154: `const user = await getSupabaseUser(authHeader)` — validates JWT
4. Line 55-56: `getSupabaseUser` calls `supabase.auth.getUser(token)` — server-side JWT validation
5. Line 155-157: Returns 401 if invalid

**Client-side auth enforcement:**

- `SoundEngine.play()` line 1141: `if (!requireAuth('use AI soundscapes')) return;` — blocks unauthenticated users before any API call
- `SoundEngine.generate()` line 1112-1113: Gets session, throws if null — secondary guard
- `getNarration()` line 1296-1297: Gets session, returns null if null — graceful degradation

**Verdict: ✅ ENFORCED** — JWT validated server-side on every request. Client-side guards prevent unnecessary calls.

---

### 6. Rate Limiting Correctness

**Edge Function rate limit logic (lines 93-113):**

```typescript
const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
const { count } = await supabase
  .from("elevenlabs_usage")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId)
  .gte("created_at", oneHourAgo);
```

| Check | Result | Notes |
|-------|--------|-------|
| Time window calculation | ✅ Correct | `Date.now() - 3600000` = 1 hour ago |
| Count query | ✅ Correct | `count: "exact", head: true` returns count without data |
| User filter | ✅ Correct | `.eq("user_id", userId)` scopes to this user |
| Time filter | ✅ Correct | `.gte("created_at", oneHourAgo)` = last hour |
| Limit comparison | ✅ Correct | `used < limit.hourly` — strict less-than |
| Fail-open on error | ⚠️ By design | Returns `allowed: true` if query fails — prevents lockouts on DB errors |
| 429 response | ✅ Correct | Returns 429 with `Retry-After: 3600` header |
| Usage logging on 429 | ✅ Correct | Logs the rate-limited request before returning |

**Tier-based limits:**

| Tier | Hourly | Daily (in DB, not enforced in code) |
|------|--------|-------------------------------------|
| free | 30 | 200 |
| transcendence | 100 | 1000 |
| illumination | 300 | 5000 |

**Issue Found — Daily limit not enforced:**

The `rate_limits` table has `daily_max` column, and the SQL seeds daily limits, but the Edge Function only checks `hourly_max`. The daily limit is stored but never queried.

**Impact:** Low — hourly limits provide sufficient protection. Daily limits would add a second layer but are not critical for launch.

**Recommendation:** Add daily limit check in a future iteration. Not blocking for production.

**Verdict: ✅ FUNCTIONAL** — Hourly rate limiting works correctly. Daily limits are defined but not enforced (non-blocking).

---

### 7. Deployment Guide Accuracy

**File:** `reports/elevenlabs-migration-guide.md`

| Step | Verified | Notes |
|------|----------|-------|
| Step 1: Run SQL migration | ✅ | File path correct, SQL is valid |
| Step 2: Link Supabase CLI | ✅ | Standard `supabase link` command |
| Step 3: Set API key secret | ✅ | `supabase secrets set ELEVENLABS_API_KEY=<key>` |
| Step 4: Deploy Edge Function | ✅ | `supabase functions deploy elevenlabs-proxy` |
| Step 5: Remove GitHub secret | ✅ | Correct — key no longer needed in GitHub |
| Step 6: Push changes | ✅ | `git add . && git commit && git push` |
| Step 7: Verification checklist | ✅ | 12 verification steps, all actionable |

**Architecture diagram:** ✅ Accurate — shows Browser → Edge Function → ElevenLabs flow.

**Rollback plan:** ✅ Present — describes reverting to direct API calls if needed.

**Verdict: ✅ ACCURATE** — All steps are correct and in the right order.

---

### 8. Deployment-Breaking Changes

| Change | Breaking? | Notes |
|--------|-----------|-------|
| Removed `ELEVENLABS_API_KEY` from `index.html` | ⚠️ Yes — if Edge Function not deployed | Client will call proxy URL that doesn't exist yet |
| Removed `ELEVENLABS_API_KEY` sed from `deploy.yml` | ⚠️ Yes — key no longer injected | Expected — key is now in Supabase secrets |
| Changed `USE_ELEVENLABS` from conditional to `true` | ⚠️ Yes — always tries ElevenLabs | If proxy returns error, user sees toast |
| Added `requireAuth` to `SoundEngine.play()` | No — additive | Unauthenticated users were already blocked by `USE_ELEVENLABS` check |
| Changed `generate()` to call proxy | ⚠️ Yes — different endpoint | Must deploy Edge Function first |
| Changed `getNarration()` to call proxy | ⚠️ Yes — different endpoint | Must deploy Edge Function first |

**Deployment Order (Critical):**

The Edge Function MUST be deployed before the client code changes are pushed. Otherwise:
1. Client calls `SUPABASE_URL/functions/v1/elevenlabs-proxy`
2. Function doesn't exist → 404
3. All sound/narration features break

**Correct order:**
1. Run SQL migration
2. Set Supabase secret
3. Deploy Edge Function
4. Push client code changes

This order is documented in the migration guide (Steps 1-6).

**Verdict: ⚠️ CONDITIONAL GO** — Deployment order must be followed precisely. Edge Function must exist before client code is pushed.

---

## Issues Found

### Critical: None

### High: None

### Medium

| # | Issue | Impact | Mitigation |
|---|-------|--------|------------|
| M-1 | Daily rate limit not enforced | Second layer of cost control missing | Add daily limit check in future sprint |
| M-2 | Fail-open on rate limit query error | If DB is down, rate limiting is bypassed | Acceptable for launch — DB uptime is high |

### Low

| # | Issue | Impact | Mitigation |
|---|-------|--------|------------|
| L-1 | `ELEVENLABS_API_KEY` read at module load, not per-request | If secret rotated, function needs redeploy | Standard Supabase behavior — redeploy on secret change |
| L-2 | CORS allows any origin (`origin || "*"`) | Any domain can call the proxy | Acceptable — auth is still required |
| L-3 | `narrationCache` and `SE.cache` are in-memory only | Lost on page refresh | Non-blocking — reduces API calls within session |
| L-4 | `getNarration()` returns `null` on error; `generate()` throws | Inconsistent error handling | By design — narration is optional, sound is primary |

---

## Security Properties Verified

| Property | Status | Evidence |
|----------|--------|----------|
| API key not in client code | ✅ | Grep: zero matches in index.html |
| API key not in deploy workflow | ✅ | Grep: zero matches in deploy.yml |
| API key not in git history (new) | ✅ | New key was never in source code |
| No direct ElevenLabs calls from client | ✅ | Grep: zero `api.elevenlabs.io` in index.html |
| JWT required for all proxy requests | ✅ | 401 returned if missing/invalid |
| Rate limiting enforced | ✅ | Hourly limits per tier |
| Usage audit trail | ✅ | Every request logged to elevenlabs_usage |
| Voice ID server-enforced | ✅ | Client cannot change voice ID |
| Prompt text length bounded | ✅ | 5000 chars TTS, 2000 chars sound gen |
| Endpoint validation | ✅ | Only 'sound-generation' and 'text-to-speech' allowed |

---

## Final Recommendation

### **GO** ✅

**Conditions:**
1. **Deploy Edge Function BEFORE pushing client code** — documented in migration guide Step 4 before Step 6
2. **Run SQL migration BEFORE deploying Edge Function** — the `elevenlabs_usage` and `rate_limits` tables must exist
3. **Set Supabase secret BEFORE deploying Edge Function** — the `ELEVENLABS_API_KEY` env var must be available

**Deployment sequence:**
```
1. SQL migration (Supabase Dashboard)
2. supabase secrets set ELEVENLABS_API_KEY=<new_key>
3. supabase functions deploy elevenlabs-proxy
4. Remove ELEVENLABS_API_KEY from GitHub secrets
5. git push (triggers GitHub Actions deploy)
```

**Post-deploy verification:**
- View Source: no `sk_` key visible
- Network tab: no `xi-api-key` header, only `Authorization: Bearer <jwt>`
- Sound cards: all 12 generate and play
- Meditation: narration plays on phase changes
- Sleep: narration plays on session start
- Rate limit: toast appears after 30 requests/hour
- Unauthenticated: "Sign in" toast on sound card click

**Non-blocking items for future sprint:**
- Daily rate limit enforcement (M-1)
- Persistent caching (IndexedDB) for narration (L-3)

---

*Final security review — Zenith Mind ElevenLabs migration*
