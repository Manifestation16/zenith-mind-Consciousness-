# Zenith Mind — Security Audit

**Date:** 2026-06-01
**Scope:** Full codebase — index.html, supabase-setup.sql, client-side logic

---

## Executive Summary

Zenith Mind has **multiple critical security vulnerabilities** that must be resolved before any production deployment. API keys are hardcoded in client-side JavaScript, authentication has a trivially reversible password scheme in fallback mode, and premium content gating is entirely client-side with no server validation.

**Security Score: 2/10** — Prototype-grade security, not suitable for real users.

---

## Vulnerability Summary

| #   | Vulnerability                                | Severity | CVSS (est.) | Status     |
|-----|----------------------------------------------|----------|-------------|------------|
| V-01 | ElevenLabs API key exposed in client JS      | Critical | 9.1         | Open       |
| V-02 | Supabase anon key in client JS               | Medium   | 5.3         | By Design* |
| V-03 | Base64 "encryption" for local passwords       | Critical | 8.6         | Open       |
| V-04 | Client-side-only premium content gating       | High     | 7.5         | Open       |
| V-05 | No CSRF protection                           | Medium   | 5.8         | Open       |
| V-06 | No rate limiting on auth attempts             | Medium   | 5.3         | Open       |
| V-07 | No Content Security Policy (CSP)              | Medium   | 5.0         | Open       |
| V-08 | XSS via unsanitized journal/history render   | High     | 7.1         | Open       |
| V-09 | Stripe links exposed in client JS             | Low      | 3.1         | Open       |
| V-10 | No input validation on exercise data          | Medium   | 5.5         | Open       |
| V-11 | localStorage auth tokens never expire         | Medium   | 5.0         | Open       |
| V-12 | No `Secure`/`HttpOnly` cookie flags           | Medium   | 5.5         | Open       |

*Supabase anon key is designed to be public with RLS — but only if RLS is correctly configured.

---

## Detailed Findings

### V-01: ElevenLabs API Key Exposed in Client JavaScript

**Severity:** CRITICAL
**Location:** `index.html:1028`

```javascript
const ELEVENLABS_API_KEY = 'YOUR_ELEVENLABS_API_KEY';
```

**Impact:** When a real key is added, any user can extract it from View Source or DevTools and:
- Use the key for their own purposes (billing abuse)
- Exhaust the API quota
- Generate unauthorized content
- Access any ElevenLabs features enabled on the account

**Evidence:** The key is stored as a plain JavaScript constant in the client-side script. There is no obfuscation, no proxy, and no server-side relay.

**Remediation:**
1. **Immediate:** Move the ElevenLabs API call to a Supabase Edge Function or Cloudflare Worker
2. The client calls your proxy; the proxy calls ElevenLabs with the real key
3. Add rate limiting and authentication to the proxy endpoint

```javascript
// Client-side — call your proxy instead
const res = await fetch('/api/sound-generation', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${session.access_token}` },
  body: JSON.stringify({ text: sound.prompt, duration_seconds: 22 })
});
```

---

### V-02: Supabase Anon Key in Client JavaScript

**Severity:** MEDIUM (by design, but requires correct RLS)
**Location:** `index.html:569-570`

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

**Impact:** The Supabase anon key is designed to be public — it's the client's authentication token. However, it only provides protection when Row Level Security is properly configured on every table.

**Current RLS Status:**
- `exercises`: ✅ RLS enabled, users can only access own data
- `profiles`: ✅ RLS enabled, users can only read/update own profile
- `waitlist`: ⚠️ INSERT-only policy (`WITH CHECK (true)`) — anyone can insert, which is intentional for a waitlist, but there's no protection against spam

**Remediation:**
1. Add INSERT rate limiting on `waitlist` (Supabase Edge Function or database function)
2. Verify no `SELECT` policy exists on `waitlist` that would leak emails
3. Consider adding a CAPTCHA before waitlist submission

---

### V-03: Base64 "Encryption" for Local Passwords

**Severity:** CRITICAL
**Location:** `index.html:678-679`

```javascript
users[email] = { name, email, password: btoa(password), created: Date.now() };
```

And verification at line 685:
```javascript
if (users[email].password !== btoa(password)) { ... }
```

**Impact:** Base64 is an encoding, not encryption. It is trivially reversible:
```javascript
atob('cGFzc3dvcmQxMjM=') // → 'password123'
```

All local-mode user passwords are stored in `localStorage` as plain Base64 strings. Any XSS vulnerability, browser extension, or physical access to the device reveals all passwords.

**Evidence:** `localStorage.getItem('zm_users')` returns a JSON object where every password is Base64-encoded.

**Remediation:**
1. **Remove local auth entirely** — Use Supabase Auth as the sole authentication method
2. If local mode must persist, use the Web Crypto API for hashing:
```javascript
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```
3. Even with hashing, local auth is fundamentally insecure — passwords should never be stored client-side

---

### V-04: Client-Side-Only Premium Content Gating

**Severity:** HIGH
**Location:** `index.html:1461-1477`

```javascript
const FREE_MEDITATIONS = ['neural', 'ceo'];

function isPremium(contentId) {
  if (!currentUser) return false;
  if (currentUser.tier && currentUser.tier !== 'free') return true;
  return FREE_MEDITATIONS.includes(contentId);
}
```

**Impact:**
1. The `currentUser.tier` property is **never set** — it's always `undefined`
2. This means `currentUser.tier && currentUser.tier !== 'free'` is always `false`
3. All logged-in users can only access `neural` and `ceo` meditations
4. However, a user can bypass this by running `currentUser.tier = 'illumination'` in the console
5. More critically, the meditation content (narration text, durations, phases) is all embedded in client-side JavaScript — a determined user can access everything without any gating

**Remediation:**
1. Read `profiles.tier` from Supabase on login:
```javascript
const { data: profile } = await sb.from('profiles').select('tier').eq('id', user.id).single();
currentUser.tier = profile?.tier || 'free';
```
2. For true premium gating, narration and session data must be served from a server-side endpoint that checks subscription status
3. Use Supabase RLS on a `premium_content` table

---

### V-05: No CSRF Protection

**Severity:** MEDIUM
**Location:** All form submissions

The auth form uses `onsubmit="handleAuth(event)"` with no CSRF token. While Supabase Auth uses JWT tokens (which provide some CSRF protection), the local auth mode has no protection against cross-site request forgery.

**Remediation:**
1. Add `SameSite=Strict` cookie attribute for any session cookies
2. Implement CSRF tokens for state-changing operations
3. Verify `Origin` header on server-side endpoints

---

### V-06: No Rate Limiting on Auth Attempts

**Severity:** MEDIUM
**Location:** `index.html:650-694`

The `handleAuth` function has no rate limiting. An attacker can attempt unlimited password guesses in local mode. Supabase Auth has built-in rate limiting, but the local fallback has none.

**Evidence:** The only protection is `btn.disabled = true` during the request, which is trivially bypassed by calling `handleAuth` directly.

**Remediation:**
1. Remove local auth mode entirely (preferred)
2. If local mode persists, implement exponential backoff:
```javascript
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 300000; // 5 minutes
```

---

### V-07: No Content Security Policy (CSP)

**Severity:** MEDIUM
**Location:** `index.html:1-8` (missing CSP meta tag)

No CSP header or meta tag is present. This allows:
- Inline script execution (XSS payload injection)
- Loading scripts from any origin
- Connecting to any API endpoint

**Remediation:**
Add a CSP meta tag:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co https://api.elevenlabs.io;
  img-src 'self' data:;
  frame-src 'none';
">
```

---

### V-08: XSS via Unsanitized History/Journal Rendering

**Severity:** HIGH
**Location:** `index.html:965-971`

```javascript
list.innerHTML = exercises.slice(0, 50).map(ex => {
  // ...
  return `<div class="history-item glass">
    <span class="history-icon">${icon}</span>
    <div class="history-info">
      <h4>${ex.name}</h4>
      <span class="history-meta">${dateStr} · ${dur}</span>
    </div>
    <span class="history-badge ${ex.type}">${ex.type}</span>
  </div>`;
}).join('');
```

**Impact:** If an attacker can inject malicious HTML into `ex.name` or `ex.type` (via Supabase or localStorage), it will be rendered as HTML. For example:
```
name: "<img src=x onerror=alert(document.cookie)>"
```

The `ex.type` field is also injected into a CSS class name without sanitization.

**Evidence:** No `textContent` assignment, no HTML escaping, direct template literal interpolation.

**Remediation:**
1. Use `textContent` instead of `innerHTML` for user-controlled data
2. Or escape HTML entities:
```javascript
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```
3. Apply to all user-controlled fields: `ex.name`, `ex.type`, `ex.tag`, `ex.text`

---

### V-09: Stripe Payment Links Exposed in Client JavaScript

**Severity:** LOW
**Location:** `index.html:1437-1440`

```javascript
const STRIPE_LINKS = {
  transcendence: 'YOUR_STRIPE_TRANSCENDENCE_LINK',
  illumination: 'YOUR_STRIPE_ILLUMINATION_LINK'
};
```

**Impact:** Stripe payment links are designed to be public. However, exposing them allows:
- Link manipulation (redirecting to a different Stripe link)
- Price discovery (competitors can see pricing structure)

**Remediation:** This is low risk. Stripe payment links are inherently public URLs. No action required unless links contain sensitive metadata.

---

### V-10: No Input Validation on Exercise Data

**Severity:** MEDIUM
**Location:** `index.html:719-728`

```javascript
async function saveExercise(ex) {
  if (!currentUser) return;
  if (USE_SUPABASE) {
    const { error } = await sb.from('exercises').insert({
      user_id: currentUser.id,
      type: ex.type,
      name: ex.name,
      tag: ex.tag || '',
      duration: ex.duration || 0,
      cycles: ex.cycles || null,
      text: ex.text || null
    });
```

**Impact:** No validation of:
- `type` — could be any string (bypasses `CHECK` constraint only at DB level)
- `name` — could be arbitrarily long
- `duration` — could be negative or absurdly large
- `text` — could be megabytes of data

**Remediation:**
1. Validate on client:
```javascript
const VALID_TYPES = ['meditation', 'breathwork', 'sleep', 'journal'];
if (!VALID_TYPES.includes(ex.type)) throw new Error('Invalid type');
if (ex.name?.length > 200) throw new Error('Name too long');
if (ex.duration < 0 || ex.duration > 86400) throw new Error('Invalid duration');
```
2. The database `CHECK` constraint on `type` provides a second layer, but client validation prevents unnecessary API calls

---

### V-11: localStorage Auth Tokens Never Expire

**Severity:** MEDIUM
**Location:** `index.html:580-581`

```javascript
getSession() { try { return JSON.parse(localStorage.getItem('zm_session')) } catch { return null } },
saveSession(s) { localStorage.setItem('zm_session', JSON.stringify(s)) },
```

**Impact:** Local sessions persist indefinitely. There is no:
- Session expiry
- Token rotation
- Inactivity timeout
- Logout-on-close

**Remediation:**
1. Add session timestamp and check on load:
```javascript
getSession() {
  const s = JSON.parse(localStorage.getItem('zm_session'));
  if (s && Date.now() - s.created > 86400000 * 7) { // 7 days
    localStorage.removeItem('zm_session');
    return null;
  }
  return s;
}
```

---

### V-12: No Secure Cookie Flags

**Severity:** MEDIUM

Supabase Auth manages its own cookies, but the application stores sensitive data in `localStorage` which is:
- Accessible to any JavaScript on the page (XSS risk)
- Not protected by `HttpOnly`, `Secure`, or `SameSite` flags
- Persisted across sessions

**Remediation:** For sensitive operations, prefer `httpOnly` cookies set by a server-side endpoint. For client-side storage, encrypt sensitive data or use Supabase's built-in session management exclusively.

---

## Supabase RLS Review

### exercises Table
```sql
CREATE POLICY "Users manage own exercises"
  ON exercises FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```
✅ Correct — users can only CRUD their own exercises.

### profiles Table
```sql
CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
```
⚠️ Missing `INSERT` policy — profile creation relies on the `handle_new_user()` trigger (which uses `SECURITY DEFINER`), so this is acceptable. However, there's no `DELETE` policy, meaning users cannot delete their own accounts.

### waitlist Table
```sql
CREATE POLICY "Anyone can join waitlist" ON waitlist FOR INSERT WITH CHECK (true);
```
⚠️ No `SELECT` policy — good, emails aren't publicly readable. But no rate limiting means a bot could flood the table.

---

## Recommendations Summary

| Priority | Action                                           | Effort |
|----------|--------------------------------------------------|--------|
| P0       | Move ElevenLabs API key to server-side proxy     | 2 hours |
| P0       | Remove Base64 passwords, use Supabase Auth only  | 1 hour  |
| P0       | Fix premium gating (read profiles.tier)          | 30 min  |
| P0       | Sanitize all innerHTML rendering (XSS fix)       | 1 hour  |
| P1       | Add Content Security Policy                      | 30 min  |
| P1       | Add input validation on exercise save            | 1 hour  |
| P1       | Add session expiry to local auth                 | 30 min  |
| P2       | Add rate limiting to auth and waitlist           | 2 hours |
| P2       | Add CSRF tokens for state-changing operations    | 1 hour  |
| P3       | Add account deletion (profiles DELETE policy)    | 30 min  |

---

## Conclusion

Zenith Mind has **4 critical/high vulnerabilities** that must be fixed before handling real user data. The most urgent are:

1. **Exposed ElevenLabs API key** — direct financial risk
2. **Base64 passwords** — trivially reversible, false sense of security
3. **XSS via innerHTML** — any stored XSS in exercises compromises all users
4. **Broken premium gating** — no server-side subscription verification

The Supabase RLS configuration is sound for the `exercises` and `profiles` tables. The main risks are client-side: exposed secrets, missing sanitization, and no server-side validation of premium access.

---

*Generated by security audit — Zenith Mind repository*
