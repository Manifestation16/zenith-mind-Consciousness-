# Zenith Mind — Architecture Audit

**Date:** 2026-06-01
**Scope:** Full codebase review (index.html, supabase-setup.sql, SETUP.md)

---

## Executive Summary

Zenith Mind is a single-page wellness application built entirely in one `index.html` file (~1509 lines). It combines HTML, CSS, and JavaScript into a monolithic artifact with no build system, no module bundler, no framework, and no separation of concerns. While this enables zero-config deployment via GitHub Pages, it creates significant architectural debt that will block scaling.

**Architecture Score: 3/10** — Functional prototype, not production-ready.

---

## 1. Current Architecture

### 1.1 File Structure

```
zenith-mind/
├── index.html              ← Entire application (1509 lines)
├── supabase-setup.sql      ← Database schema
└── SETUP.md                ← Deployment instructions
```

**Observation:** The entire application — markup, styles, logic, data layer, audio engine, auth, and UI rendering — lives in a single HTML file. There is no separation of concerns.

### 1.2 Technology Stack

| Layer         | Technology                          | Notes                              |
|---------------|-------------------------------------|------------------------------------|
| Markup        | Raw HTML5                           | No templating, inline everything   |
| Styling       | Inline `<style>` block (~310 lines) | CSS custom properties, no preprocessor |
| Logic          | Inline `<script>` block (~950 lines)| Vanilla JS, no framework           |
| Auth          | Supabase Auth + localStorage fallback | Dual-mode, client-side only       |
| Database      | Supabase PostgreSQL                 | Row Level Security enabled         |
| Audio         | Web Audio API + ElevenLabs API      | Custom engine classes              |
| Payments      | Stripe Payment Links                | Client-side redirect               |
| Hosting       | GitHub Pages + GitHub Actions       | Static site, auto-deploy           |
| Particles     | Canvas 2D                           | Custom particle system             |

### 1.3 Architectural Patterns

**Pattern: Monolithic Single-File Application**

All concerns are co-located in `index.html`:
- Lines 1–319: CSS styles
- Lines 320–563: HTML markup (nav, modals, sections, footer)
- Lines 564–1506: JavaScript (auth, data, audio, UI, payments)

**Pattern: Global Namespace Pollution**

All state and functions live in the global scope:
```javascript
let currentUser = null;
let currentPattern = '478';
let breathRunning = false;
let medPlaying = false;
let sleepPlaying = false;
// ... 20+ global variables
```

**Pattern: Monkey-Patching for Extension**

Audio integration is wired by overriding original functions:
```javascript
const _origStartBreathing = startBreathing;
startBreathing = async function() {
  _origStartBreathing();
  // ... audio additions
};
```

This creates a fragile chain where order of execution matters and debugging is difficult.

---

## 2. Component Analysis

### 2.1 Audio System (`ZenithAudioEngine` + `SoundEngine`)

**Location:** Lines 1035–1174

Two separate audio engine classes exist:

1. **`ZenithAudioEngine` (ZA)** — Manages Web Audio API context, binaural beats, noise generators, bells, and volume. However, the binaural/noise/drone methods are **empty stubs** (`startBinaural() {}`, `startNoise() {}`, etc.). Only `playBell()` has an implementation.

2. **`SoundEngine` (SE)** — Manages ElevenLabs sound generation and playback via `fetch` + `AudioBuffer`. Fully implemented with caching and looping.

**Issue:** `AUDIO_PROFILES` (lines 1231–1260) references `ZA.startBinaural()`, `ZA.startNoise()`, `ZA.startDrone()` — all of which are no-ops. The audio profiles promise binaural beats and noise but deliver nothing.

### 2.2 Auth System

**Location:** Lines 626–714

Dual-mode authentication:
- **Supabase mode:** Standard `signUp` / `signInWithPassword` flow
- **Local fallback:** Stores users in `localStorage` with Base64-encoded passwords (`btoa(password)`)

**Issues:**
- Passwords are Base64-encoded, not hashed — trivially reversible
- No session expiry in local mode
- No CSRF protection
- No rate limiting on auth attempts

### 2.3 Data Layer

**Location:** Lines 577–746

The `store` object provides a localStorage-based CRUD layer as a fallback when Supabase is not configured. Exercise data is capped at 200 entries per user.

**Issues:**
- No data validation before storage
- No migration strategy for schema changes
- localStorage has a ~5MB limit — will silently fail when full

### 2.4 Premium Content Gating

**Location:** Lines 1461–1477

Content gating is entirely client-side:
```javascript
function isPremium(contentId) {
  if (!currentUser) return false;
  if (currentUser.tier && currentUser.tier !== 'free') return true;
  return FREE_MEDITATIONS.includes(contentId);
}
```

**Critical Issue:** The `tier` property is never set from the Supabase `profiles` table during login. The `currentUser` object only stores `id`, `email`, and `name` — `tier` is always `undefined`. This means premium gating is effectively broken; all content is accessible to all logged-in users.

### 2.5 Particle System

**Location:** Lines 592–600

A canvas-based particle system renders 80 floating gold particles. It runs continuously via `requestAnimationFrame` with no pause-on-hidden optimization.

---

## 3. Scalability Assessment

### 3.1 Current Bottlenecks

| Bottleneck                    | Impact   | Severity |
|-------------------------------|----------|----------|
| Single HTML file              | Can't lazy-load, code-split, or tree-shake | High |
| No build system               | No minification, no cache-busting, no hashing | Medium |
| Inline CSS (~310 lines)       | No purging of unused styles | Low |
| Global state                  | Race conditions, memory leaks, no SSR | High |
| Monkey-patching               | Fragile extension model, hard to test | Medium |
| Canvas particles always running | CPU/battery drain on mobile | Medium |

### 3.2 Scaling Path

To grow beyond a prototype, the codebase needs:

1. **Framework migration** — React, Vue, or Svelte for component isolation
2. **Module bundler** — Vite or esbuild for code-splitting and tree-shaking
3. **CSS architecture** — Tailwind, CSS Modules, or styled-components
4. **State management** — Zustand, Pinia, or React Context
5. **API layer** — Server-side functions (Supabase Edge Functions) for sensitive operations
6. **Testing** — Unit tests for audio engine, auth, data layer

---

## 4. Mobile Responsiveness

### 4.1 Current State

A single `@media(max-width:768px)` breakpoint handles layout adjustments:
- Nav links hidden (only brand + login visible)
- Grid columns reduced
- Footer stacks vertically

A second `@media(max-width:600px)` breakpoint hides sound bar wave visualizers.

### 4.2 Issues

| Issue                                    | Severity |
|------------------------------------------|----------|
| No touch-specific interactions           | Medium   |
| Canvas particles not paused on mobile    | Medium   |
| No `prefers-reduced-motion` support      | Medium   |
| No `prefers-color-scheme` detection      | Low      |
| Modals use `min(420px, 90vw)` — tight on small screens | Low |
| No landscape orientation handling        | Low      |
| Sound bar overlaps bottom nav on mobile  | Medium   |

---

## 5. ElevenLabs Integration

### 5.1 Sound Generation

**Location:** Lines 1098–1110

Sounds are generated via `POST https://api.elevenlabs.io/v1/sound-generation` with:
- `duration_seconds: 22` — fixed 22-second clips
- `prompt_influence: 0.7`
- Cached in memory (`this.cache`)

**Issues:**
- API key exposed in client-side code (line 1028)
- 22-second clips loop seamlessly but may feel repetitive
- No error retry logic
- No offline fallback
- Cache is session-only (lost on refresh)

### 5.2 Narration (TTS)

**Location:** Lines 1264–1288

Narration uses `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream` with voice "Sarah" (`EXAVITQu4vr4xnSDxMaL`). Audio is cached in `narrationCache` (in-memory).

**Issues:**
- Narration is fetched on-demand — first play has latency
- No preloading of narration for meditation phases
- Audio element created with `new Audio(url)` — no cleanup, potential memory leak from Object URLs

### 5.3 Integration Quality

The ElevenLabs integration is well-structured for a prototype. Sound prompts are detailed and mood-appropriate. The caching strategy prevents redundant API calls. However, the client-side API key is a critical security flaw.

---

## 6. Supabase Integration

### 6.1 Database Schema

**Location:** `supabase-setup.sql`

Three tables:
1. **`exercises`** — Stores breathwork, meditation, sleep, and journal entries
2. **`waitlist`** — Captures emails for pre-launch
3. **`profiles`** — User profiles with tier/subscription status

### 6.2 Security Model

Row Level Security (RLS) is enabled on all tables:
- `exercises`: Users can only access their own data (`auth.uid() = user_id`)
- `waitlist`: Anyone can insert (public waitlist signup)
- `profiles`: Users can read/update their own profile

### 6.3 Issues

| Issue                                          | Severity |
|------------------------------------------------|----------|
| `profiles.tier` never read by client           | Critical |
| No server-side validation of exercise data     | Medium   |
| `waitlist` has no `SELECT` policy — admin-only access is implicit | Low |
| No database triggers for exercise analytics    | Low      |
| Profile auto-creation trigger is good          | —        |
| No indexes on `waitlist.email` for dedup       | Low      |

---

## 7. Recommendations (Priority Order)

### P0 — Critical

1. **Move API keys to server-side** — Supabase Edge Functions or a proxy for ElevenLabs
2. **Fix premium content gating** — Read `profiles.tier` on login and set `currentUser.tier`
3. **Replace Base64 password encoding** — Use Supabase Auth exclusively, remove localStorage auth

### P1 — High

4. **Extract into modules** — Separate CSS, split JS into modules (auth, audio, data, UI)
5. **Add a build system** — Vite for dev server, bundling, and minification
6. **Implement `prefers-reduced-motion`** — Pause particles and animations for accessibility
7. **Add error boundaries** — Graceful degradation when Supabase or ElevenLabs is down

### P2 — Medium

8. **Lazy-load audio** — Preload narration, cache sounds to IndexedDB
9. **Add offline support** — Service Worker for static assets
10. **Optimize particles** — Pause when tab is hidden, reduce count on mobile
11. **Add CSP headers** — Content Security Policy via meta tag or hosting config

### P3 — Low

12. **Add analytics** — Privacy-respecting usage tracking
13. **Add automated tests** — Unit tests for core logic
14. **Implement dark/light mode persistence** — Save mode preference to localStorage

---

## Summary

Zenith Mind is a visually impressive, feature-rich prototype that demonstrates strong product vision. However, it is architecturally a single-file application with significant security vulnerabilities (exposed API keys, client-side premium gating, Base64 passwords). The audio system has stub methods that promise functionality (binaural beats, noise generators) but deliver nothing. To move toward production, the codebase needs modularization, a build system, server-side API key management, and proper authentication.

---

*Generated by architecture audit — Zenith Mind repository*
