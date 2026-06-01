# Zenith Mind — Performance Audit

**Date:** 2026-06-01
**Scope:** Runtime performance, load characteristics, resource usage, mobile efficiency

---

## Executive Summary

Zenith Mind delivers a visually rich experience with particle animations, glassmorphism effects, and real-time audio. However, several performance anti-patterns exist: a continuously running canvas animation, no resource preloading, synchronous blocking patterns, and excessive DOM manipulation. On mid-range mobile devices, the experience will be noticeably degraded.

**Performance Score: 5/10** — Acceptable on desktop, poor on mobile.

---

## 1. Critical Performance Issues

### 1.1 Canvas Particle System — Never Pauses

**Location:** `index.html:592-600`

```javascript
!function loop() {
  ctx.clearRect(0, 0, w, h);
  ps.forEach(p => { p.update(); p.draw() });
  requestAnimationFrame(loop);
}();
```

**Impact:**
- 80 particles updated and drawn every frame (~60fps) indefinitely
- No `document.visibility` check — continues when tab is hidden
- No `IntersectionObserver` — continues when scrolled below the fold
- On mobile, this consumes CPU/battery even when the user is in the meditation or sleep sections

**Estimated cost:** ~2-5% CPU on desktop, ~8-15% on mobile

**Fix:**
```javascript
let particlesActive = true;
document.addEventListener('visibilitychange', () => {
  particlesActive = !document.hidden;
});

const particleObserver = new IntersectionObserver(([entry]) => {
  particlesActive = entry.isIntersecting;
}, { threshold: 0.1 });
particleObserver.observe(document.getElementById('hero'));

function loop() {
  if (particlesActive) {
    ctx.clearRect(0, 0, w, h);
    ps.forEach(p => { p.update(); p.draw() });
  }
  requestAnimationFrame(loop);
}
```

---

### 1.2 No Resource Preloading

**Location:** `index.html:1-8`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:..." rel="stylesheet">
```

**Issues:**
- Three Google Fonts loaded (`Cormorant Garamond`, `DM Mono`, `Crimson Pro`) — 6 font files
- No `font-display: swap` — text may be invisible during font load (FOIT)
- No preload hints for critical resources
- Supabase JS SDK loaded from CDN without `async` or `defer`
- No preload for ElevenLabs API endpoint

**Fix:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://api.elevenlabs.io">
<link rel="dns-prefetch" href="https://*.supabase.co">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
```

Add `font-display: swap` to the Google Fonts URL:
```
&display=swap
```

---

### 1.3 Synchronous IntersectionObserver Re-creation

**Location:** `index.html:611-615` and `index.html:844-846` and `index.html:909-910`

The scroll reveal observer is created once globally, but `renderMedGrid()` and `renderSleepGrid()` each create **new** IntersectionObservers for their dynamically rendered content:

```javascript
// In renderMedGrid():
const obs = new IntersectionObserver(e => { ... }, { threshold: .15 });
grid.querySelectorAll('.reveal').forEach(e => obs.observe(e));
```

**Impact:**
- Multiple observers running simultaneously for the same type of content
- Observers are never disconnected — memory leak over time
- Each observer has its own callback closure

**Fix:** Create a single shared observer and reuse it:
```javascript
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

function observeReveals(container) {
  container.querySelectorAll('.reveal:not(.visible)').forEach(el => {
    revealObserver.observe(el);
  });
}
```

---

### 1.4 Meditation Phase Check Interval

**Location:** `index.html:1391-1401`

```javascript
setInterval(() => {
  if (!medPlaying || !currentMed) return;
  const elapsed = Math.floor((Date.now() - medStartTime) / 1000);
  const phaseDur = Math.floor(currentMed.duration / currentMed.phases.length);
  const phaseIdx = Math.min(Math.floor(elapsed / phaseDur), currentMed.phases.length - 1);
  if (phaseIdx !== _lastMedPhaseIdx) {
    _lastMedPhaseIdx = phaseIdx;
    // ... play narration
  }
}, 2000);
```

**Impact:** This interval runs **forever** — it's never cleared. Even when no meditation is playing, the callback executes every 2 seconds, performing `Date.now()` calculations and DOM lookups.

**Fix:** Start the interval when meditation begins, clear it when it ends:
```javascript
let medPhaseInterval = null;

function startMedPlayback() {
  // ...
  medPhaseInterval = setInterval(checkMedPhase, 2000);
}

function stopMedPlayback() {
  clearInterval(medPhaseInterval);
  // ...
}
```

---

## 2. Moderate Performance Issues

### 2.1 CSS `backdrop-filter` Overuse

**Location:** Multiple elements (nav, modals, cards, sound bar)

`backdrop-filter: blur()` is applied to:
- `.nav` — `blur(30px) saturate(1.4)`
- `.modal-overlay` — `blur(10px)`
- `.modal` — `blur(30px)`
- `.glass` — `blur(20px) saturate(1.3)`
- `.sound-now-bar` — `blur(40px) saturate(1.5)`
- `.mode-fab` — `blur(20px)`
- `.mode-panel` — `blur(20px)`

**Impact:** Each `backdrop-filter` creates a new compositing layer. With 10+ glassmorphism elements visible simultaneously, GPU memory and compositing time increase significantly, especially on mobile.

**Fix:**
1. Reduce blur radius on mobile: `@media(max-width:768px) { .glass { backdrop-filter: blur(10px) } }`
2. Use `will-change: backdrop-filter` sparingly
3. Consider replacing some `backdrop-filter` with semi-transparent backgrounds on mobile

---

### 2.2 No Font Subsetting

**Location:** `index.html:8`

Three font families are loaded with full character sets:
- `Cormorant Garamond` — 300, 400, 600, 700 + italic variants
- `DM Mono` — 300, 400, 500
- `Crimson Pro` — 300, 400, 500, 600 + italic variants

**Estimated font payload:** ~150-200KB total

**Fix:**
1. Subset fonts to Latin characters only: `&subset=latin`
2. Remove unused weights (600, 700 are barely used)
3. Use `unicode-range` to load only needed character ranges

---

### 2.3 ElevenLabs Audio Fetching — No Streaming

**Location:** `index.html:1098-1110`

```javascript
const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', { ... });
const blob = await res.blob();
const url = URL.createObjectURL(blob);
```

**Impact:**
- Sound generation takes 3-10 seconds (ElevenLabs API latency)
- User sees "Generating..." with no progress indicator
- Full audio must download before playback begins
- Object URLs are created but never revoked (memory leak)

**Fix:**
1. Add a progress indicator using `ReadableStream`:
```javascript
const reader = res.body.getReader();
const chunks = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
  updateProgress(chunks.reduce((s, c) => s + c.length, 0));
}
```
2. Revoke Object URLs when no longer needed:
```javascript
function revokeSoundUrl(url) {
  URL.revokeObjectURL(url);
  delete this.cache[sound.id];
}
```

---

### 2.4 Inline SVG in HTML Templates

**Location:** `index.html:844` (meditation cards)

```javascript
grid.innerHTML = meditations.map((m, i) => `
  <div class="glass med-card ...">
    ...
    <div class="med-play">
      <svg viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19"/></svg>
    </div>
  </div>
`).join('');
```

**Impact:** Each meditation card contains an inline SVG. While individually small, the pattern of using `innerHTML` with SVG content forces the browser to parse and create DOM nodes for each SVG element.

**Fix:** Use CSS background images or a single SVG sprite sheet instead of inline SVGs in templates.

---

## 3. Load Performance

### 3.1 Estimated Payload

| Resource                  | Size (est.)  | Notes                          |
|---------------------------|-------------|--------------------------------|
| index.html                | ~85KB       | Unminified, includes everything |
| CSS (inline)              | ~12KB       | ~310 lines, no purging         |
| JS (inline)               | ~65KB       | ~950 lines, no minification    |
| Google Fonts              | ~180KB      | 3 families, 10+ weights        |
| Supabase JS SDK           | ~45KB       | From CDN, not bundled          |
| **Total initial load**    | **~290KB**  | (excluding font files)         |

### 3.2 Missing Optimizations

| Optimization              | Status | Impact           |
|---------------------------|--------|------------------|
| HTML minification         | ❌     | ~15% size reduction |
| CSS purging (unused styles)| ❌    | ~30% CSS reduction |
| JS minification           | ❌     | ~40% size reduction |
| Gzip/Brotli compression   | Depends on hosting | ~70% transfer reduction |
| Code splitting            | ❌     | N/A (single file) |
| Tree shaking              | ❌     | N/A (no bundler)  |
| Image optimization        | N/A    | No images used    |
| Resource hints            | ❌     | Slower font/API loading |

### 3.3 Third-Party Dependencies

| Dependency                | Source     | Size    | Blocking? |
|---------------------------|-----------|---------|-----------|
| Supabase JS SDK           | jsdelivr  | ~45KB   | Yes (`<script>` without `defer`) |
| Google Fonts              | googleapis | ~180KB  | Render-blocking |
| ElevenLabs API            | elevenlabs.io | N/A (runtime) | No |

**Fix:** Add `defer` to the Supabase script tag and `display=swap` to font loading.

---

## 4. Runtime Performance

### 4.1 Animation Performance

| Animation                 | Method              | GPU Composited? | jank risk |
|---------------------------|--------------------|--------------------|-----------|
| Particle canvas           | requestAnimationFrame | ❌ CPU-bound     | High on mobile |
| Orb breathing animation   | CSS transitions     | ✅ transform       | Low       |
| Scroll reveal             | CSS transitions     | ✅ opacity/transform| Low      |
| Sound bar waves           | CSS keyframes       | ✅ transform       | Low       |
| Sleep visualizer bars     | setInterval + inline styles | ❌ layout thrash | High |
| Nav hide/show             | CSS transform       | ✅                 | Low       |

### 4.2 Sleep Visualizer — Layout Thrashing

**Location:** `index.html:937`

```javascript
sleepVisualIv = setInterval(() => {
  bars.forEach(b => {
    b.style.height = (Math.random() * 50 + 10) + 'px';
    b.style.opacity = (Math.random() * .6 + .2).toFixed(2);
  });
}, 200);
```

**Impact:** Every 200ms, 40 bars have their `height` and `opacity` modified via inline styles. Changing `height` triggers layout recalculation (reflow) for each bar. This is a classic layout thrashing pattern.

**Fix:** Use CSS `transform: scaleY()` instead of `height` changes:
```javascript
bars.forEach(b => {
  b.style.transform = `scaleY(${Math.random() * 3 + 0.5})`;
  b.style.opacity = (Math.random() * .6 + .2).toFixed(2);
});
```

`transform` and `opacity` are composited properties — they don't trigger layout.

---

### 4.3 Timer Accuracy

Multiple `setInterval(fn, 1000)` and `setInterval(fn, 500)` calls are used for timers (breathwork, meditation, sleep). These are not guaranteed to fire at exact intervals — they can drift by 10-100ms per tick.

**Impact:** Timer displays may show inaccurate elapsed times over long sessions (e.g., an 8-hour sleep session could drift by several minutes).

**Fix:** Calculate elapsed time from `Date.now() - startTime` rather than incrementing a counter:
```javascript
// Current (drifts):
elapsed++;

// Fixed (accurate):
elapsed = Math.floor((Date.now() - startTime) / 1000);
```

Note: The code already uses this pattern for some timers — good. But the breathwork cycle counter uses `setInterval` without drift correction.

---

## 5. Memory Management

### 5.1 Memory Leaks

| Leak Source                    | Severity | Description                          |
|-------------------------------|----------|--------------------------------------|
| Object URLs for sounds        | Medium   | `URL.createObjectURL()` never revoked |
| Object URLs for narration     | Medium   | Same issue for TTS audio blobs       |
| IntersectionObservers         | Low      | Never disconnected                   |
| setIntervals                  | Medium   | Meditation phase check never cleared |
| Audio elements for narration  | Low      | `new Audio(url)` created, never removed |

### 5.2 localStorage Growth

- `zm_users` — grows with each registered user
- `zm_ex_{userId}` — capped at 200 entries per user
- `zm_session` — single entry, overwritten

**Risk:** On a shared device with many users, `zm_users` could grow indefinitely. The 200-entry cap on exercises prevents runaway growth per user.

---

## 6. Mobile-Specific Performance

### 6.1 Battery Impact

| Feature                   | Battery Impact | Recommendation           |
|---------------------------|---------------|--------------------------|
| Canvas particles (always on) | High       | Pause when not visible   |
| backdrop-filter (10+ elements) | Medium   | Reduce on mobile         |
| requestAnimationFrame loop   | Medium     | Pause offscreen          |
| 200ms sleep visualizer      | Medium      | Reduce frequency         |
| Audio context (Web Audio)    | Low-Medium  | Suspend when idle        |

### 6.2 Touch Performance

- No `touch-action` CSS property set — may cause 300ms tap delay on older browsers
- No `passive: true` on touch event listeners (though the scroll listener does use `{ passive: true }`)
- Modal overlays don't prevent background scrolling

### 6.3 Estimated Mobile Performance

| Device Tier              | Load Time (est.) | Runtime FPS | Experience     |
|--------------------------|-----------------|-------------|----------------|
| High-end (iPhone 15)     | <1s             | 60fps       | Smooth         |
| Mid-range (Pixel 7a)     | 1-2s            | 45-60fps    | Acceptable     |
| Low-end (budget Android) | 2-4s            | 20-30fps    | Janky          |

---

## 7. Recommendations

### P0 — Critical

| #   | Action                                    | Impact          | Effort |
|-----|-------------------------------------------|-----------------|--------|
| 1   | Pause particles when tab hidden/offscreen | Battery, CPU    | 30 min |
| 2   | Clear meditation phase interval on stop   | Memory leak     | 15 min |
| 3   | Revoke Object URLs after use              | Memory leak     | 30 min |

### P1 — High

| #   | Action                                    | Impact          | Effort |
|-----|-------------------------------------------|-----------------|--------|
| 4   | Add `defer` to Supabase script            | Faster load     | 5 min  |
| 5   | Add `display=swap` to fonts               | No FOIT         | 5 min  |
| 6   | Replace sleep visualizer height with transform | Layout thrash | 30 min |
| 7   | Reduce backdrop-filter on mobile          | GPU compositing | 30 min |

### P2 — Medium

| #   | Action                                    | Impact          | Effort |
|-----|-------------------------------------------|-----------------|--------|
| 8   | Share single IntersectionObserver          | Memory, perf    | 30 min |
| 9   | Subset fonts to Latin + remove unused weights | 100KB savings | 15 min |
| 10  | Minify HTML/CSS/JS or add build step      | 50% size reduction | 1 hour |
| 11  | Add resource hints (preconnect, preload)  | Faster load     | 15 min |

### P3 — Low

| #   | Action                                    | Impact          | Effort |
|-----|-------------------------------------------|-----------------|--------|
| 12  | Use CSS sprite for SVG icons              | Fewer DOM nodes | 30 min |
| 13  | Add `passive: true` to touch listeners    | Scroll perf     | 15 min |
| 14  | Suspend AudioContext when idle             | Battery         | 30 min |

---

## Summary

Zenith Mind's performance is acceptable for a desktop prototype but has significant issues for mobile users. The continuously running particle animation, multiple unclosed intervals, and memory leaks from Object URLs will degrade the experience over time. The most impactful fixes are:

1. **Pause offscreen animations** — biggest battery/CPU win
2. **Clear intervals properly** — prevents memory leaks
3. **Optimize CSS compositing** — reduce `backdrop-filter` on mobile
4. **Add build tooling** — minification alone cuts load time by 40%

---

*Generated by performance audit — Zenith Mind repository*
