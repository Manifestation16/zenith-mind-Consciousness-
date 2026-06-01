# ElevenLabs Integration — Security Audit

**Date:** 2026-06-01
**Role:** Principal Security Engineer
**Scope:** Full ElevenLabs integration in `index.html`
**Classification:** CRITICAL — Production-blocking

---

## 1. Executive Summary

The ElevenLabs integration has a **critical, production-blocking security flaw**: the API key is hardcoded in client-side JavaScript and transmitted directly from the browser to `api.elevenlabs.io`. There is no backend proxy, no rate limiting, no authentication, and no cost controls. Any visitor to the site can extract the key and incur unlimited charges.

**Risk Rating: CRITICAL (CVSS 9.1)**
**Recommendation: Do not deploy with a real API key until migration is complete.**

---

## 2. API Key Storage

### 2.1 Location

```javascript
// index.html:1041
const ELEVENLABS_API_KEY = 'YOUR_ELEVENLABS_API_KEY'; // ← Add your key here
```

### 2.2 Storage Mechanism

| Property | Value |
|----------|-------|
| Storage location | Client-side JavaScript constant |
| Scope | Global (`window.ELEVENLABS_API_KEY`) |
| Obfuscation | None |
| Encryption | None |
| Rotation mechanism | None — requires code change and redeploy |
| Extraction difficulty | Trivial — View Source, DevTools Console, or Network tab |

### 2.3 Key Detection Gate

```javascript
// index.html:1043
const USE_ELEVENLABS = ELEVENLABS_API_KEY.startsWith('sk_');
```

The key is validated by checking if it starts with `sk_`. This is the only guard — if a valid key is present, all ElevenLabs features activate automatically for every visitor.

---

## 3. Client-Side Exposure Analysis

### 3.1 Direct Browser Exposure

The key is exposed in **every page load** via three vectors:

| Vector | How Extracted | Effort |
|--------|--------------|--------|
| View Source | `Ctrl+U` → search "ELEVENLABS" | 5 seconds |
| DevTools Console | `window.ELEVENLABS_API_KEY` in console | 3 seconds |
| Network Inspector | Every ElevenLabs request includes `xi-api-key` header | 10 seconds |

### 3.2 Request Interception

Every call to ElevenLabs includes the key in the `xi-api-key` header:

```javascript
// Sound Generation (index.html:1113-1116)
fetch('https://api.elevenlabs.io/v1/sound-generation', {
  headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: sound.prompt, duration_seconds: 22, prompt_influence: 0.7 })
});

// Text-to-Speech (index.html:1281-1284)
fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`, {
  headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
  body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: {...} })
});
```

A browser extension, proxy, or MITM can trivially capture these headers.

### 3.3 Bundled in Deployed Artifact

Since the entire app is a single `index.html` file deployed to GitHub Pages, the key is committed to the repository and served as a static asset. Even if removed in a future commit, it remains in git history.

---

## 4. Functions Calling ElevenLabs Directly

### 4.1 Call Graph

```
User clicks sound card
  └─ SE.play(sound)                          [index.html:1125]
       └─ SE.generate(sound)                 [index.html:1111]
            └─ fetch('api.elevenlabs.io/v1/sound-generation')   ← DIRECT CALL
                 └─ xi-api-key: ELEVENLABS_API_KEY

User starts meditation / sleep session
  └─ startSessionAudio(profileKey, ...)      [index.html:1323]
       └─ playNarration(text, textElId)      [index.html:1294]
            └─ getNarration(text)            [index.html:1277]
                 └─ fetch('api.elevenlabs.io/v1/text-to-speech/{voiceId}/stream')   ← DIRECT CALL
                      └─ xi-api-key: ELEVENLABS_API_KEY

User starts breathwork session
  └─ startBreathing() [monkey-patched]       [index.html:1346]
       └─ SE.play(sound)                     ← triggers sound-generation path above
```

### 4.2 Endpoint Summary

| Endpoint | Method | Function | Trigger |
|----------|--------|----------|---------|
| `/v1/sound-generation` | POST | `SE.generate()` | Click any sound card |
| `/v1/text-to-speech/{voiceId}/stream` | POST | `getNarration()` | Meditation phase change, sleep session start |

### 4.3 Request Parameters

**Sound Generation:**
```json
{
  "text": "<hardcoded prompt from AMBIENT_SOUNDS>",
  "duration_seconds": 22,
  "prompt_influence": 0.7
}
```

**Text-to-Speech:**
```json
{
  "text": "<hardcoded narration from AUDIO_PROFILES>",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.72,
    "similarity_boost": 0.78,
    "style": 0.15,
    "use_speaker_boost": true
  }
}
```

**Observation:** All text sent to ElevenLabs is currently hardcoded (sound prompts and narration strings). No user-generated content is sent. This limits but does not eliminate the abuse surface.

---

## 5. Backend Bypass Analysis

### 5.1 Current Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────▶│ api.elevenlabs.io │     │  Supabase       │
│  (index.html)│     │  (DIRECT CALL)   │     │  (exercises DB) │
│              │────▶│                  │     │                 │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                                              │
       └──────────────────────────────────────────────┘
                    (auth + data only)
```

### 5.2 Findings

| Question | Answer |
|----------|--------|
| Is there a backend proxy? | **No.** All ElevenLabs calls go directly from browser to API. |
| Does Supabase mediate any ElevenLabs call? | **No.** Supabase is only used for auth and exercise data. |
| Is there a server-side API key? | **No.** The only key is the client-side constant. |
| Can the key be revoked without code changes? | **No.** Rotation requires editing `index.html` and redeploying. |
| Is there a fallback if ElevenLabs is down? | **Partial.** `USE_ELEVENLABS` check returns `null`, but error handling is minimal. |

### 5.3 Missing Backend Controls

| Control | Status | Impact |
|---------|--------|--------|
| API key server-side storage | ❌ Missing | Key exposed to all visitors |
| Request authentication (JWT check) | ❌ Missing | Anyone can trigger ElevenLabs calls |
| Rate limiting per user | ❌ Missing | Unlimited requests possible |
| Rate limiting per IP | ❌ Missing | Bot abuse undetectable |
| Cost cap / circuit breaker | ❌ Missing | No spending limit enforcement |
| Request logging / audit trail | ❌ Missing | No visibility into usage |
| Content validation | ❌ Missing | Prompts could be modified via DevTools |
| Usage attribution | ❌ Missing | Can't tell which user generated which call |

---

## 6. Abuse Vectors

### 6.1 API Key Theft

**Severity:** CRITICAL
**Scenario:** Attacker extracts key from View Source or DevTools.
**Impact:** Attacker uses key for their own ElevenLabs account, generating unlimited audio at the victim's expense.
**Detection:** None — all requests appear to come from the same key.
**Mitigation:** None in current architecture.

### 6.2 Cost Bomb

**Severity:** CRITICAL
**Scenario:** Bot visits the site and clicks all 12 sound cards in rapid succession. Each generates a 22-second audio clip via the ElevenLabs API.
**Cost per attack:** 12 sound generations × ~$0.01-0.05 per generation = $0.12-0.60 per page load.
**Scaled attack:** 1,000 bot visits/hour = $120-600/hour.
**Cost cap:** None. No circuit breaker. No spending alert.
**Detection:** None client-side. ElevenLabs dashboard only.

### 6.3 Narration Spam

**Severity:** HIGH
**Scenario:** Attacker writes a script that rapidly starts and stops meditation sessions, triggering `getNarration()` for each phase of each meditation.
**Cost per attack:** 6 meditations × 4 phases × ~$0.001-0.005 per TTS call = $0.024-0.12 per full cycle.
**Scaled attack:** Script loops indefinitely. At 1 cycle/minute = $1.44-7.20/hour.
**Mitigation:** `narrationCache` prevents duplicate text re-fetches, but only within a single page session. New incognito windows bypass the cache.

### 6.4 Prompt Injection via DevTools

**Severity:** MEDIUM
**Scenario:** Attacker modifies `AMBIENT_SOUNDS` in DevTools to change `prompt` values, generating arbitrary audio content.
**Example:**
```javascript
AMBIENT_SOUNDS[0].prompt = "Generate a loud alarm siren at maximum volume";
SE.play(AMBIENT_SOUNDS[0]);
```
**Impact:** Generates unwanted content, potentially violating ElevenLabs ToS, leading to account suspension.
**Detection:** None.

### 6.5 Voice ID Enumeration

**Severity:** LOW
**Scenario:** Attacker changes `ELEVENLABS_VOICE_ID` in DevTools to test other voices.
**Impact:** Uses premium voices the account may not have access to, or generates content in unauthorized voices.
**Detection:** None.

### 6.6 Concurrent Session Abuse

**Severity:** MEDIUM
**Scenario:** Multiple tabs or automated sessions all generate sounds simultaneously.
**Impact:** The `SoundEngine.busy` flag prevents concurrent generation within a single tab, but nothing prevents multi-tab abuse.
**Cost:** Multiplied by number of open tabs/sessions.

---

## 7. Rate Limiting Weaknesses

### 7.1 Client-Side Controls

| Control | Implementation | Bypass |
|---------|---------------|--------|
| `SoundEngine.busy` flag | Prevents concurrent `play()` calls | Only within single tab; reset on error |
| `narrationCache` object | Prevents re-fetching same narration text | Lost on page refresh; cleared in incognito |
| `SE.cache` object | Prevents re-fetching same sound | Lost on page refresh; cleared in incognito |

### 7.2 Missing Controls

| Control | Status | Notes |
|---------|--------|-------|
| Per-user daily limit | ❌ | No tracking of requests per user |
| Per-IP rate limit | ❌ | No IP-based throttling |
| Per-session request cap | ❌ | No maximum requests per page session |
| Cooldown between requests | ❌ | User can click sound cards as fast as they want |
| Token bucket / leaky bucket | ❌ | No algorithmic rate limiting |
| ElevenLabs account-level limits | ⚠️ | Exists on ElevenLabs side, but key is shared across all visitors |

### 7.3 Cache Weaknesses

The `SE.cache` and `narrationCache` objects are **in-memory only**:
- Lost on page refresh
- Not shared across tabs
- Not persisted to localStorage/IndexedDB
- No cache invalidation strategy
- No cache size limit (unbounded memory growth for `narrationCache`)

---

## 8. Cost Explosion Scenarios

### 8.1 Pricing Model (Estimated)

| Endpoint | Pricing Model | Estimated Cost |
|----------|--------------|----------------|
| `/v1/sound-generation` | Per request (duration-based) | $0.01–0.05 per 22s clip |
| `/v1/text-to-speech` | Per character | ~$0.00003–0.0001 per character |

*Based on ElevenLabs published pricing tiers. Actual costs vary by plan.*

### 8.2 Cost Scenarios

#### Scenario A: Legitimate Usage (100 DAU)

| Action | Frequency/Day | Cost/Call | Daily Cost |
|--------|--------------|-----------|------------|
| Sound generation | 200 plays | $0.03 | $6.00 |
| Narration (TTS) | 100 sessions × 4 phases | $0.002 | $0.80 |
| **Daily total** | | | **$6.80** |
| **Monthly total** | | | **$204** |

#### Scenario B: Bot Attack (automated)

| Action | Frequency/Hour | Cost/Call | Hourly Cost |
|--------|---------------|-----------|-------------|
| Sound generation | 1,000 plays | $0.03 | $30.00 |
| Narration spam | 500 sessions × 4 phases | $0.002 | $4.00 |
| **Hourly total** | | | **$34.00** |
| **24h attack** | | | **$816.00** |

#### Scenario C: Key Published (worst case)

If the key is posted publicly (e.g., on a forum or GitHub):

| Timeframe | Estimated Cost |
|-----------|---------------|
| First hour | $100–500 |
| First day | $2,000–10,000 |
| First week | $10,000–50,000+ |

**There is no circuit breaker.** The only limit is the ElevenLabs account's credit balance or billing cap.

### 8.3 Cost Control Gaps

| Control | Status |
|---------|--------|
| Monthly spending cap | ❌ Not implemented (relies on ElevenLabs dashboard) |
| Per-user spending tracking | ❌ Not implemented |
| Alert on unusual usage | ❌ Not implemented |
| Graceful degradation on quota exceeded | ⚠️ Partial — catches error, shows toast |
| Pre-generation cost estimation | ❌ Not implemented |

---

## 9. Voice ID Exposure

```javascript
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // "Sarah"
```

The voice ID is hardcoded and exposed. While voice IDs are not secrets per se, exposing them allows:
- Voice cloning attempts (if ElevenLabs permissions allow)
- Unauthorized use of custom voices
- Enumeration of available voices via API

---

## 10. Summary of Findings

| # | Finding | Severity | CVSS |
|---|---------|----------|------|
| F-01 | API key hardcoded in client JS | Critical | 9.1 |
| F-02 | No backend proxy — direct browser-to-API calls | Critical | 8.8 |
| F-03 | No rate limiting per user or IP | High | 7.5 |
| F-04 | No cost cap or circuit breaker | High | 7.5 |
| F-05 | In-memory caches lost on refresh | Medium | 5.0 |
| F-06 | No request logging or audit trail | Medium | 5.3 |
| F-07 | Prompt injection via DevTools | Medium | 5.0 |
| F-08 | Voice ID exposed | Low | 3.1 |
| F-09 | No graceful degradation on quota exhaustion | Low | 3.5 |
| F-10 | No usage attribution per user | Medium | 5.0 |

---

## 11. Migration Plan — Supabase Edge Function Proxy

### 11.1 Target Architecture

```
┌─────────────┐     ┌─────────────────────────┐     ┌──────────────────┐
│   Browser    │────▶│  Supabase Edge Function  │────▶│ api.elevenlabs.io│
│  (index.html)│     │  /functions/v1/elevenlabs│     │                  │
│              │     │                         │     │                  │
│  - JWT auth  │     │  - API key (server)     │     │  - Sound Gen     │
│  - No key    │     │  - Rate limiting        │     │  - TTS           │
│  - Cached    │     │  - Cost tracking        │     │                  │
└─────────────┘     │  - Request validation   │     └──────────────────┘
       │             │  - Audit logging        │
       │             └─────────────────────────┘
       │                        │
       │             ┌─────────────────────────┐
       └────────────▶│  Supabase PostgreSQL    │
                     │  - usage_logs table     │
                     │  - rate_limits table    │
                     └─────────────────────────┘
```

### 11.2 Implementation Steps

#### Step 1: Create Supabase Edge Function — `elevenlabs-proxy`

**File:** `supabase/functions/elevenlabs-proxy/index.ts`

**Responsibilities:**
- Validate Supabase JWT token from `Authorization` header
- Check rate limits (per user, per IP)
- Forward request to ElevenLabs with server-side API key
- Log usage to `usage_logs` table
- Return audio response to client

**Effort:** 4–6 hours

**Pseudocode:**
```typescript
// supabase/functions/elevenlabs-proxy/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ELEVENLABS_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

serve(async (req) => {
  // 1. Authenticate
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );
  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (error || !user) return new Response("Unauthorized", { status: 401 });

  // 2. Rate limit check
  const { count } = await supabase
    .from("usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", new Date(Date.now() - 3600000).toISOString());
  if (count >= 30) return new Response("Rate limit exceeded", { status: 429 });

  // 3. Parse request
  const { endpoint, body } = await req.json();

  // 4. Validate endpoint
  const allowedEndpoints = ["sound-generation", "text-to-speech"];
  if (!allowedEndpoints.includes(endpoint)) {
    return new Response("Invalid endpoint", { status: 400 });
  }

  // 5. Forward to ElevenLabs
  let elUrl = `https://api.elevenlabs.io/v1/${endpoint}`;
  if (endpoint === "text-to-speech") {
    elUrl += `/${ELEVENLABS_VOICE_ID}/stream`;
  }

  const elRes = await fetch(elUrl, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  // 6. Log usage
  await supabase.from("usage_logs").insert({
    user_id: user.id,
    endpoint,
    status: elRes.status,
    created_at: new Date().toISOString(),
  });

  // 7. Return response
  return new Response(elRes.body, {
    status: elRes.status,
    headers: { "Content-Type": "audio/mpeg" },
  });
});
```

#### Step 2: Add Database Tables for Rate Limiting and Logging

**File:** `supabase-setup.sql` (append)

```sql
-- USAGE LOGS (audit trail + rate limiting)
CREATE TABLE IF NOT EXISTS usage_logs (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  status     INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage" ON usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS usage_logs_user_time_idx
  ON usage_logs(user_id, created_at DESC);

-- Add index for rate limit queries
CREATE INDEX IF NOT EXISTS usage_logs_recent_idx
  ON usage_logs(user_id, created_at)
  WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Effort:** 30 minutes

#### Step 3: Set ElevenLabs Key as Supabase Secret

```bash
supabase secrets set ELEVENLABS_API_KEY=sk_your_actual_key_here
```

**Effort:** 5 minutes

#### Step 4: Refactor Client-Side Code

**Remove:**
```javascript
// DELETE these lines:
const ELEVENLABS_API_KEY = 'YOUR_ELEVENLABS_API_KEY';
const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
const USE_ELEVENLABS = ELEVENLABS_API_KEY.startsWith('sk_');
```

**Replace with:**
```javascript
const USE_ELEVENLABS = true; // Always true — key is server-side
```

**Modify `SoundEngine.generate()`:**
```javascript
async generate(sound) {
  if (this.cache[sound.id]) return this.cache[sound.id];

  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-proxy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint: 'sound-generation',
      body: { text: sound.prompt, duration_seconds: 22, prompt_influence: 0.7 }
    })
  });
  if (!res.ok) throw new Error('Sound generation failed: ' + res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  this.cache[sound.id] = url;
  return url;
}
```

**Modify `getNarration()`:**
```javascript
async function getNarration(text) {
  if (narrationCache[text]) return narrationCache[text];
  if (!USE_ELEVENLABS) return null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-proxy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: 'text-to-speech',
        body: {
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.72, similarity_boost: 0.78, style: 0.15, use_speaker_boost: true }
        }
      })
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    narrationCache[text] = url;
    return url;
  } catch(e) { return null; }
}
```

**Effort:** 2–3 hours

#### Step 5: Deploy Edge Function

```bash
supabase functions deploy elevenlabs-proxy
```

**Effort:** 15 minutes

#### Step 6: Add Client-Side Usage Feedback (Optional)

Show remaining quota to user:
```javascript
async function checkUsageQuota() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { count } = await sb
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .gte('created_at', new Date(Date.now() - 3600000).toISOString());
  return { used: count, limit: 30, remaining: 30 - count };
}
```

**Effort:** 1 hour

---

### 11.3 Implementation Timeline

| Step | Task | Effort | Dependencies |
|------|------|--------|-------------|
| 1 | Create Edge Function | 4–6 hours | Supabase project |
| 2 | Add DB tables | 30 min | Step 1 |
| 3 | Set API key secret | 5 min | Supabase CLI |
| 4 | Refactor client code | 2–3 hours | Step 1 |
| 5 | Deploy Edge Function | 15 min | Steps 1, 3 |
| 6 | Add usage feedback | 1 hour | Step 2 |
| **Total** | | **8–11 hours** | |

### 11.4 Security Gains

| Control | Before | After |
|---------|--------|-------|
| API key location | Client JS (exposed) | Supabase secret (server-only) |
| Authentication | None | Supabase JWT required |
| Rate limiting | None | 30 requests/hour per user |
| Cost tracking | None | Per-user audit log |
| Prompt injection | Possible via DevTools | Server validates endpoint; prompts can be server-controlled |
| Key rotation | Code change + redeploy | `supabase secrets set` — instant |
| Multi-tab abuse | Unlimited | Rate-limited per user |
| Bot attacks | Unlimited | Requires valid auth token |
| Audit trail | None | Full logging in `usage_logs` |

### 11.5 Deployment Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Edge Function cold start latency | Medium | Low (1-3s delay) | Supabase Edge Functions have warm pools; first request may be slower |
| ElevenLabs API downtime | Low | Medium | Client already handles errors gracefully; add retry with backoff |
| Supabase Edge Function rate limits | Low | Medium | Supabase has generous limits (500K invocations/month on free tier) |
| Breaking existing audio playback | Low | High | Test all 12 sounds + 6 meditations + 4 sleep sessions before deploy |
| JWT token expiry during long sessions | Low | Low | Supabase auto-refreshes tokens; add refresh logic if needed |
| Increased latency (browser→Supabase→ElevenLabs) | Medium | Low | ~100-200ms added; acceptable for audio generation that already takes 3-10s |
| Edge Function size limit | Low | Low | Function is small (~2KB); well within limits |

### 11.6 Rollback Plan

If the Edge Function causes issues:
1. Revert client code to direct ElevenLabs calls (restore original `generate()` and `getNarration()`)
2. Re-add `ELEVENLABS_API_KEY` constant (temporary — re-exposes key)
3. Re-deploy `index.html` to GitHub Pages
4. Investigate Edge Function logs in Supabase Dashboard

**Rollback time:** ~15 minutes (GitHub Pages deploy)

---

## 12. Recommendations

### Immediate (Before Any Deployment)

| # | Action | Effort |
|---|--------|--------|
| 1 | **Do not add a real ElevenLabs key to the current codebase** | 0 min |
| 2 | If a real key was ever committed, rotate it immediately | 5 min |

### Short-Term (This Sprint)

| # | Action | Effort |
|---|--------|--------|
| 3 | Implement Edge Function proxy (Steps 1–5 above) | 8–11 hours |
| 4 | Add `usage_logs` table for audit trail | 30 min |
| 5 | Set rate limit to 30 requests/hour per user | Included in Step 1 |
| 6 | Test all audio paths (12 sounds, 6 meditations, 4 sleep) | 2 hours |

### Medium-Term (Next Sprint)

| # | Action | Effort |
|---|--------|--------|
| 7 | Add cache persistence (IndexedDB) to reduce API calls | 2 hours |
| 8 | Add server-side prompt validation (allowlist of valid prompts) | 1 hour |
| 9 | Add usage dashboard in analytics section | 3 hours |
| 10 | Add graceful degradation when quota exceeded | 1 hour |

### Long-Term (Future)

| # | Action | Effort |
|---|--------|--------|
| 11 | Pre-generate and cache all 12 soundscapes server-side | 4 hours |
| 12 | Add tier-based rate limits (free: 5/hr, paid: 30/hr) | 2 hours |
| 13 | Implement audio CDN for pre-generated content | 4 hours |

---

## Appendix A: Complete ElevenLabs API Surface

### Endpoints Used

| Endpoint | Full URL | Purpose |
|----------|----------|---------|
| Sound Generation | `POST https://api.elevenlabs.io/v1/sound-generation` | Generate 22s ambient soundscapes |
| Text-to-Speech | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream` | Generate narration audio |

### Authentication Method

```
Header: xi-api-key: {API_KEY}
```

This is ElevenLabs' proprietary auth header. It is not a standard `Authorization: Bearer` token.

### Voice Configuration

| Parameter | Value |
|-----------|-------|
| Voice ID | `EXAVITQu4vr4xnSDxMaL` |
| Voice Name | "Sarah" |
| Model | `eleven_multilingual_v2` |
| Stability | 0.72 |
| Similarity Boost | 0.78 |
| Style | 0.15 |
| Speaker Boost | true |

### Sound Generation Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| `duration_seconds` | 22 | Fixed for all sounds |
| `prompt_influence` | 0.7 | Moderate adherence to text prompt |

---

## Appendix B: All Hardcoded Prompts (Attack Surface)

These are the 12 sound prompts embedded in client-side code. If the Edge Function proxy is implemented, these should be moved server-side to prevent prompt injection:

1. `rain` — "Extremely soft and slow rainfall at midnight..."
2. `coast` — "Gentle waves washing very slowly onto smooth warm pebbles..."
3. `fireplace` — "A slow deep crackling fireplace in a luxury mountain chalet..."
4. `night` — "A silent Zen Buddhist temple garden deep at night..."
5. `thunder` — "Slow steady soft rain with very deep distant rolling thunder..."
6. `airplane` — "The deep smooth continuous hum of a luxury airliner at 38000 feet..."
7. `city` — "The view from a silent high-rise penthouse at 3am..."
8. `stream` — "A very gentle sacred mountain spring trickling slowly..."
9. `bowls` — "Large ancient Tibetan singing bowls struck very slowly..."
10. `forest` — "Ancient equatorial rainforest at dawn..."
11. `delta` — "An ultra-deep continuous sub-bass drone at very low frequency..."
12. `crystal` — "Pure quartz crystal singing bowls played with precision..."

Plus 18 narration strings across 9 meditation/sleep profiles.

**Total: 30 unique text payloads sent to ElevenLabs, all visible in client-side code.**

---

*Generated by Principal Security Engineer — ElevenLabs integration audit*
