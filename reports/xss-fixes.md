# Zenith Mind — XSS Vulnerability Fixes

**Date:** 2026-06-01
**Reference:** security-audit.md (V-08)
**Scope:** All `innerHTML` rendering in `index.html`

---

## Summary

Added an `escapeHtml()` utility function and applied it to all `innerHTML` locations that render dynamic data. **No UI behavior was changed** — all visual output remains identical for legitimate data. The fixes only sanitize output to prevent script injection.

---

## Fix Applied

### New Function: `escapeHtml()`

**Location:** `index.html:589-598`

```javascript
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

Replaces the 5 HTML-significant characters (`&`, `<`, `>`, `"`, `'`) with their entity equivalents. This prevents an attacker from breaking out of HTML context or injecting script tags/event handlers.

---

## Locations Fixed

### 1. `renderHistory()` — CRITICAL (user-controlled data)

**Location:** `index.html:976-984`
**Risk:** HIGH — Data comes from Supabase `exercises` table or `localStorage`, both of which can be manipulated.

**Before:**
```javascript
return `<div class="history-item glass">
  <span class="history-icon">${icon}</span>
  <div class="history-info">
    <h4>${ex.name}</h4>
    <span class="history-meta">${dateStr} · ${dur}${ex.cycles ? ' · ' + ex.cycles + ' cycles' : ''}</span>
  </div>
  <span class="history-badge ${ex.type}">${ex.type}</span>
</div>`;
```

**After:**
```javascript
const safeType = escapeHtml(ex.type);
const safeCycles = ex.cycles ? ' · ' + Number(ex.cycles) + ' cycles' : '';
return `<div class="history-item glass">
  <span class="history-icon">${icon}</span>
  <div class="history-info">
    <h4>${escapeHtml(ex.name)}</h4>
    <span class="history-meta">${dateStr} · ${dur}${safeCycles}</span>
  </div>
  <span class="history-badge ${safeType}">${safeType}</span>
</div>`;
```

**Fields sanitized:**
| Field      | Injection Vector | Fix Applied       |
|------------|-----------------|-------------------|
| `ex.name`  | `<h4>` content  | `escapeHtml()`    |
| `ex.type`  | CSS class + text | `escapeHtml()`    |
| `ex.cycles`| Text content    | `Number()` cast   |

**Attack prevented:** A stored XSS payload like `ex.name = "<img src=x onerror=alert(document.cookie)>"` would previously execute. Now it renders as literal text.

---

### 2. `renderMedGrid()` — Defense-in-depth (hardcoded data)

**Location:** `index.html:855`
**Risk:** LOW — Data comes from the hardcoded `meditations` array. Sanitized as defense-in-depth.

**Before:**
```javascript
grid.innerHTML = meditations.map((m, i) =>
  `... onclick="openMedPlayer('${m.id}')">
    <span class="med-card-tag">${m.tag}</span>
    <h3>${m.title}</h3>
    <p>${m.desc}</p>
  ...`).join('');
```

**After:**
```javascript
grid.innerHTML = meditations.map((m, i) =>
  `... onclick="openMedPlayer('${escapeHtml(m.id)}')">
    <span class="med-card-tag">${escapeHtml(m.tag)}</span>
    <h3>${escapeHtml(m.title)}</h3>
    <p>${escapeHtml(m.desc)}</p>
  ...`).join('');
```

**Fields sanitized:** `m.id`, `m.tag`, `m.title`, `m.desc`

---

### 3. `renderSleepGrid()` — Defense-in-depth (hardcoded data)

**Location:** `index.html:919`
**Risk:** LOW — Data comes from the hardcoded `sleepExercises` array. Sanitized as defense-in-depth.

**Before:**
```javascript
grid.innerHTML = sleepExercises.map((s, i) =>
  `... onclick="openSleepPlayer('${s.id}')">
    <span class="sleep-icon">${s.icon}</span>
    <h3>${s.title}</h3>
    <p>${s.desc}</p>
    <span class="sleep-tag">${s.tag}</span>
  ...`).join('');
```

**After:**
```javascript
grid.innerHTML = sleepExercises.map((s, i) =>
  `... onclick="openSleepPlayer('${escapeHtml(s.id)}')">
    <span class="sleep-icon">${escapeHtml(s.icon)}</span>
    <h3>${escapeHtml(s.title)}</h3>
    <p>${escapeHtml(s.desc)}</p>
    <span class="sleep-tag">${escapeHtml(s.tag)}</span>
  ...`).join('');
```

**Fields sanitized:** `s.id`, `s.icon`, `s.title`, `s.desc`, `s.tag`

---

### 4. `renderSoundGrid()` — Defense-in-depth (hardcoded data)

**Location:** `index.html:1233-1240`
**Risk:** LOW — Data comes from the hardcoded `AMBIENT_SOUNDS` array. Sanitized as defense-in-depth.

**Before:**
```javascript
grid.innerHTML = AMBIENT_SOUNDS.map(s => `
  <div class="sound-card glass" id="sc_${s.id}" onclick="SE.play(AMBIENT_SOUNDS.find(x=>x.id==='${s.id}'))">
    <span class="sound-card-icon">${s.icon}</span>
    <div class="sound-card-name">${s.name}</div>
    <div class="sound-card-mood">${s.mood}</div>
    ...
  </div>`).join('');
```

**After:**
```javascript
grid.innerHTML = AMBIENT_SOUNDS.map(s => `
  <div class="sound-card glass" id="sc_${escapeHtml(s.id)}" onclick="SE.play(AMBIENT_SOUNDS.find(x=>x.id==='${escapeHtml(s.id)}'))">
    <span class="sound-card-icon">${escapeHtml(s.icon)}</span>
    <div class="sound-card-name">${escapeHtml(s.name)}</div>
    <div class="sound-card-mood">${escapeHtml(s.mood)}</div>
    ...
  </div>`).join('');
```

**Fields sanitized:** `s.id`, `s.icon`, `s.name`, `s.mood`

---

## Locations Reviewed — No Fix Needed

| Line | Code | Reason Safe |
|------|------|-------------|
| 648 | `authSwitch.innerHTML = 'Don\'t have an account? ...'` | Static string literal, no dynamic data |
| 654 | `authSwitch.innerHTML = 'Already have an account? ...'` | Static string literal, no dynamic data |
| 796 | `breathCount.innerHTML = '&mdash;'` | Static HTML entity |
| 817 | `breathCount.innerHTML = '&mdash;'` | Static HTML entity |
| 866 | `playerCount.innerHTML = '&mdash;'` | Static HTML entity |
| 933 | `sleepVisual.innerHTML = ''` | Clearing content (empty string) |
| 973 | `list.innerHTML = '<div class="history-empty">Sign in...'` | Static string literal |
| 975 | `list.innerHTML = '<div class="history-empty">No exercises...'` | Static string literal |
| 997 | `dots.innerHTML = ''` | Clearing content (empty string) |

---

## Behavioral Impact

**None.** All changes are purely defensive:
- For legitimate data (no HTML special characters), output is byte-identical
- For malicious payloads, HTML entities render as visible text instead of executing
- All visual styling, animations, click handlers, and layout remain unchanged

---

## Verification

To verify the fix works:

1. Open the app and sign in
2. Manually inject a test payload via console:
   ```javascript
   store.addExercise('test@test.com', {
     type: 'meditation',
     name: '<img src=x onerror=alert("XSS")>',
     tag: '<script>alert(1)</script>',
     duration: 60,
     created_at: new Date().toISOString()
   });
   renderHistory();
   ```
3. Expected: The literal text `<img src=x onerror=alert("XSS">` and `<script>alert(1)</script>` should render as visible text, not execute
4. No alert dialogs should appear

---

*Generated by XSS fix audit — Zenith Mind repository*
