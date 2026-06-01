# Zenith Mind — Product Roadmap

**Date:** 2026-06-01
**Scope:** Product strategy, user retention, monetization, accessibility, competitive positioning

---

## Executive Summary

Zenith Mind has a compelling product vision — "The Operating System for Human Consciousness" — and a visually premium aesthetic that differentiates it from competitors like Calm, Headspace, and Insight Timer. The current prototype covers the core wellness verticals (breathwork, meditation, sleep, journaling) with a unique AI-powered soundscape system via ElevenLabs.

However, the product has significant gaps in retention mechanics, accessibility, and monetization infrastructure. This roadmap outlines a phased approach to move from prototype to production-ready product.

**Product Readiness Score: 4/10** — Strong vision, weak execution infrastructure.

---

## 1. Current Product Analysis

### 1.1 Feature Inventory

| Feature                | Status      | Quality | Notes                          |
|------------------------|-------------|---------|--------------------------------|
| Mood check-in          | ✅ Complete  | Good    | 6 moods, static responses      |
| Breathwork (5 patterns)| ✅ Complete  | Good    | Visual orb + audio integration  |
| Meditation (6 sessions)| ✅ Complete  | Good    | Gated content, phase-based      |
| Sleep (4 protocols)    | ✅ Complete  | Good    | Visual bars + audio             |
| Sound sanctuary (12)   | ✅ Complete  | Great   | ElevenLabs AI-generated         |
| Journal                | ✅ Complete  | Basic   | Text entry + mood tracking      |
| Analytics dashboard    | ✅ Complete  | Basic   | Streak + session counts         |
| Premium tiers          | ⚠️ Partial  | Broken  | Client-side gating, no Stripe   |
| Auth (Supabase)        | ✅ Complete  | Good    | Dual-mode with localStorage     |
| Atmosphere modes       | ✅ Complete  | Good    | 5 color themes                  |
| AI narration           | ✅ Complete  | Good    | ElevenLabs TTS                  |

### 1.2 Unique Differentiators

1. **AI-generated soundscapes** — No competitor offers real-time ElevenLabs sound generation
2. **Binaural beat integration** — Frequency-specific audio for each exercise
3. **"Consciousness OS" positioning** — Premium, aspirational brand identity
4. **Glassmorphism aesthetic** — Visually distinctive from competitors' flat designs
5. **Mood-adaptive experience** — Selecting a mood changes recommendations

### 1.3 Gaps vs. Competitors

| Feature                | Zenith Mind | Calm    | Headspace | Insight Timer |
|------------------------|-------------|---------|-----------|---------------|
| Guided library (100+)  | ❌ (6)       | ✅       | ✅         | ✅              |
| Social/community       | ❌           | ❌       | ❌         | ✅              |
| Progress tracking      | Basic        | Good    | Great     | Good          |
| Offline mode           | ❌           | ✅       | ✅         | ✅              |
| Wearable integration   | ❌           | ✅       | ❌         | ❌              |
| Personalized plans     | ❌           | ✅       | ✅         | ❌              |
| Family sharing         | ❌           | ✅       | ✅         | ❌              |
| AI coaching            | ❌           | ❌       | ❌         | ❌              |
| Sound variety          | 12 (AI)      | 100+    | 50+       | 200+          |

---

## 2. User Retention Analysis

### 2.1 Current Retention Mechanics

| Mechanic               | Implementation | Effectiveness |
|------------------------|---------------|---------------|
| Day streak counter     | ✅              | Medium        |
| Session history        | ✅              | Low           |
| Weekly stats           | ✅              | Low           |
| Mood tracking          | Partial        | Low           |
| Push notifications     | ❌              | —             |
| Email re-engagement    | ❌              | —             |
| Personalized plans     | ❌              | —             |
| Social features        | ❌              | —             |
| Achievements/badges    | ❌              | —             |
| Daily prompts          | Journal only   | Low           |

### 2.2 Retention Gaps

**Critical Gap: No re-engagement loop**

Once a user closes the tab, there is no mechanism to bring them back:
- No push notifications
- No email sequences
- No "streak at risk" alerts
- No daily meditation reminders

**Critical Gap: No onboarding flow**

New users land on the homepage with no guidance:
- No "what brings you here?" questionnaire
- No personalized starting recommendation
- No tutorial or walkthrough
- No "first session" guided experience

**Critical Gap: No progression system**

The analytics dashboard shows stats but doesn't create a sense of advancement:
- No levels, milestones, or unlockables
- No "you've completed 10 sessions — here's your next challenge"
- No skill trees or learning paths
- No comparison to personal bests

### 2.3 Retention Recommendations

| Priority | Feature                  | Expected Impact | Effort |
|----------|--------------------------|-----------------|--------|
| P0       | Onboarding questionnaire | +20% D1 retention | 1 week |
| P0       | Push notification opt-in | +15% D7 retention | 3 days |
| P1       | Daily streak reminders   | +10% D30 retention | 2 days |
| P1       | Personalized daily plan  | +25% engagement | 2 weeks |
| P2       | Achievement badges       | +10% engagement | 1 week |
| P2       | Weekly email digest       | +5% re-engagement | 1 week |
| P3       | Social sharing           | +5% viral growth | 2 weeks |

---

## 3. Accessibility Audit

### 3.1 Current Accessibility State

**Accessibility Score: 3/10** — Significant barriers for users with disabilities.

### 3.2 WCAG 2.1 Compliance

| Criterion              | Level | Status | Issues                          |
|------------------------|-------|--------|---------------------------------|
| 1.1.1 Non-text Content | A     | ⚠️     | Emoji icons have no alt text    |
| 1.3.1 Info & Relationships | A | ⚠️     | Semantic HTML used but incomplete |
| 1.4.1 Use of Color     | A     | ❌      | Color-only state indicators     |
| 1.4.3 Contrast (Min)   | AA    | ⚠️     | Low contrast on muted text      |
| 1.4.11 Non-text Contrast | AA | ⚠️     | Border contrast issues          |
| 2.1.1 Keyboard         | A     | ❌      | Modals not keyboard-navigable   |
| 2.1.2 No Keyboard Trap | A     | ⚠️     | Modal focus management missing  |
| 2.4.1 Bypass Blocks    | A     | ❌      | No skip navigation link         |
| 2.4.3 Focus Order      | A     | ⚠️     | Tab order not managed           |
| 2.4.7 Focus Visible    | AA    | ❌      | No custom focus styles          |
| 3.1.1 Language of Page | A     | ✅      | `lang="en"` present             |
| 4.1.2 Name, Role, Value | A   | ⚠️     | Buttons missing aria-labels     |

### 3.3 Critical Accessibility Issues

**Issue 1: Keyboard Navigation**
- Modal dialogs (`authModal`, `medPlayer`, `sleepPlayer`) cannot be opened or operated via keyboard
- No focus trapping inside modals
- No visible focus indicators on any interactive element
- Tab order follows DOM order, which may not match visual layout

**Issue 2: Screen Reader Support**
- No ARIA landmarks (`role="navigation"`, `role="main"`, etc.)
- No ARIA labels on icon buttons (close buttons, play buttons)
- Mood cards use emoji with no text alternative
- Breathing orb state changes not announced
- Timer values not announced to screen readers

**Issue 3: Color and Contrast**
- `--text-muted: #4a4540` on `--bg-deep: #06060f` — contrast ratio ~2.8:1 (fails AA)
- `--text-secondary: #8a8078` on dark backgrounds — contrast ratio ~4.2:1 (borderline)
- State indicated by color only (selected mood card, active sound card)
- No high-contrast mode option

**Issue 4: Motion Sensitivity**
- No `prefers-reduced-motion` media query
- Particle animation runs continuously
- Orb breathing animation cannot be paused
- Scroll reveal animations trigger on every section

### 3.4 Accessibility Recommendations

| Priority | Action                                        | WCAG | Effort |
|----------|-----------------------------------------------|------|--------|
| P0       | Add visible focus indicators                  | 2.4.7 | 2 hours |
| P0       | Add `prefers-reduced-motion` support          | 2.3.3 | 1 hour  |
| P0       | Add ARIA labels to icon buttons               | 4.1.2 | 1 hour  |
| P0       | Ensure keyboard navigation for modals         | 2.1.1 | 3 hours |
| P1       | Increase contrast on muted text               | 1.4.3 | 30 min  |
| P1       | Add skip navigation link                      | 2.4.1 | 15 min  |
| P1       | Add ARIA landmarks                            | 1.3.1 | 30 min  |
| P2       | Add screen reader announcements for timers    | 4.1.3 | 2 hours |
| P2       | Add text alternatives for emoji icons         | 1.1.1 | 1 hour  |
| P3       | Add high-contrast mode                        | 1.4.11 | 2 hours |

---

## 4. Monetization Strategy

### 4.1 Current Pricing Model

| Tier             | Price  | Features                                      |
|------------------|--------|-----------------------------------------------|
| Awakening (Free) | $0     | 3 meditations, basic breathwork, mood check-in |
| Transcendence    | $12/mo | Unlimited meditations, AI sessions, sleep, analytics, journal |
| Illumination     | $39/mo | Everything + AI coach, biofeedback, corporate, priority |

### 4.2 Monetization Gaps

1. **No payment infrastructure** — Stripe links are placeholders
2. **No free trial mechanism** — No way to experience premium before paying
3. **No tier enforcement** — Client-side gating is broken
4. **No annual pricing** — Missing ~20% revenue from annual commits
5. **No usage-based upselling** — No "you've used 3/3 free meditations" prompts

### 4.3 Revenue Projections (Conservative)

| Metric                    | Month 1 | Month 6 | Month 12 |
|---------------------------|---------|---------|----------|
| Monthly visitors          | 500     | 5,000   | 20,000   |
| Free signups              | 100     | 1,000   | 4,000    |
| Free → Paid conversion    | 2%      | 5%      | 7%       |
| Paid subscribers          | 2       | 50      | 280      |
| Avg revenue/sub           | $12     | $15     | $18      |
| MRR                       | $24     | $750    | $5,040   |
| ARR                       | —       | $9,000  | $60,480  |

*Assumes Illumination tier at $39 has ~10% of paid subs, raising average.*

### 4.4 Monetization Recommendations

| Priority | Action                                      | Revenue Impact | Effort |
|----------|---------------------------------------------|---------------|--------|
| P0       | Wire Stripe payment links                   | Enables revenue | 1 day |
| P0       | Implement server-side tier enforcement      | Prevents theft | 2 days |
| P1       | Add 7-day free trial                        | +50% conversion | 3 days |
| P1       | Add annual pricing ($99/yr, $299/yr)        | +20% ARPU | 1 day |
| P2       | Add usage-based upgrade prompts             | +15% conversion | 1 week |
| P2       | Add "refer a friend" program                | +10% growth | 1 week |
| P3       | Add gift subscriptions                      | +5% seasonal revenue | 3 days |

---

## 5. Scalability Roadmap

### 5.1 Technical Scaling

| Phase   | Infrastructure           | User Capacity | Cost/mo |
|---------|--------------------------|---------------|---------|
| Current | GitHub Pages + Supabase free | ~1,000 users | $0      |
| Phase 1 | Supabase Pro + CDN       | ~10,000 users | $25     |
| Phase 2 | Supabase Pro + Edge Functions | ~50,000 users | $75    |
| Phase 3 | Dedicated DB + CDN       | ~200,000 users | $300   |

### 5.2 Content Scaling

| Phase   | Content                          | Source              | Timeline |
|---------|----------------------------------|---------------------|----------|
| Current | 6 meditations, 12 sounds         | Hardcoded           | —        |
| Phase 1 | 20 meditations, 30 sounds        | Content team        | Month 1-2 |
| Phase 2 | 50+ meditations, user-generated  | AI + creators       | Month 3-6 |
| Phase 3 | 100+ library, live sessions       | Partners + AI       | Month 6-12 |

### 5.3 Feature Scaling

| Phase   | Features                                    | Timeline   |
|---------|---------------------------------------------|------------|
| Phase 1 | Onboarding, push notifications, Stripe      | Month 1-2  |
| Phase 2 | Personalized plans, achievements, offline    | Month 3-4  |
| Phase 3 | Social features, wearable integration, AI coach | Month 5-8 |
| Phase 4 | Mobile app (React Native), live sessions     | Month 9-12 |

---

## 6. Competitive Strategy

### 6.1 Positioning

**Zenith Mind** occupies a unique niche: **AI-powered premium consciousness platform**.

| Competitor    | Position               | Price   | Weakness              |
|---------------|------------------------|---------|-----------------------|
| Calm          | Mass-market wellness   | $70/yr  | Generic, not premium  |
| Headspace     | Structured meditation  | $70/yr  | Clinical, not spiritual|
| Insight Timer | Community + free content | $60/yr | Not premium           |
| Waking Up     | Intellectual/spiritual | $100/yr | Niche, not accessible |
| **Zenith Mind** | **Premium AI consciousness** | **$144/yr** | **Small library, new** |

### 6.2 Moat Strategy

1. **AI-generated content** — ElevenLabs sounds are unique and cannot be replicated by competitors without the same prompt engineering
2. **Frequency-specific audio** — Binaural beats tuned to each exercise's brain state
3. **Premium brand identity** — "Operating System for Human Consciousness" positioning
4. **Data-driven personalization** — Future AI coach that learns from user patterns

### 6.3 Growth Channels

| Channel              | Strategy                                    | Expected CAC |
|----------------------|---------------------------------------------|-------------|
| Content marketing    | YouTube meditation guides, blog posts       | $0-5        |
| Social media         | Instagram/TikTok aesthetic clips            | $2-8        |
| Influencer partnerships | Wellness influencers, podcasters          | $10-20      |
| SEO                  | "guided meditation", "breathwork app"       | $0-3        |
| Referral program     | "Give 1 month, get 1 month"                 | $0-5        |
| App Store (future)   | Organic discovery                           | $0-2        |

---

## 7. Phased Roadmap

### Phase 0: Fix & Secure (Week 1-2)
- [ ] Move API keys to server-side proxy
- [ ] Fix premium content gating
- [ ] Remove Base64 passwords
- [ ] Sanitize innerHTML rendering
- [ ] Add CSP headers
- [ ] Fix canvas particle performance

### Phase 1: Retain & Monetize (Month 1-2)
- [ ] Build onboarding flow (3-step questionnaire)
- [ ] Wire Stripe payment links
- [ ] Implement server-side tier enforcement
- [ ] Add 7-day free trial
- [ ] Add push notification opt-in
- [ ] Add daily streak reminders
- [ ] Add annual pricing option
- [ ] Build 5 additional meditations

### Phase 2: Grow & Personalize (Month 3-4)
- [ ] Personalized daily plans based on mood/history
- [ ] Achievement/badge system
- [ ] Weekly email digest
- [ ] Offline mode (Service Worker)
- [ ] Expand to 20+ meditations
- [ ] Add 10+ new soundscapes
- [ ] Referral program

### Phase 3: Scale & Differentiate (Month 5-8)
- [ ] AI consciousness coach (GPT integration)
- [ ] Wearable biofeedback (Apple Watch, Oura)
- [ ] Social features (community, sharing)
- [ ] Creator program (external meditation teachers)
- [ ] Live group sessions
- [ ] Corporate wellness portal

### Phase 4: Platform (Month 9-12)
- [ ] React Native mobile app
- [ ] App Store / Play Store launch
- [ ] Widget for Apple Watch / Wear OS
- [ ] Voice assistant integration (Alexa, Google)
- [ ] Internationalization (10+ languages)
- [ ] B2B API for wellness platforms

---

## 8. Key Metrics to Track

| Metric                    | Definition                          | Target (Month 6) |
|---------------------------|-------------------------------------|-------------------|
| DAU/MAU ratio             | Daily active / Monthly active       | >25%              |
| D1 retention              | % users returning day after signup  | >40%              |
| D7 retention              | % users returning 7 days after      | >25%              |
| D30 retention             | % users returning 30 days after     | >15%              |
| Sessions per user/week    | Average sessions per active user    | >3                |
| Avg session duration      | Minutes per session                 | >8                |
| Free → Paid conversion    | % free users upgrading              | >5%               |
| MRR                       | Monthly recurring revenue           | >$500             |
| NPS                       | Net Promoter Score                  | >50               |
| CAC                       | Customer acquisition cost           | <$10              |

---

## Summary

Zenith Mind has a strong product vision and a visually premium prototype. The path to a viable product requires:

1. **Security fixes** (Week 1-2) — Must be done before any user acquisition
2. **Retention mechanics** (Month 1-2) — Onboarding, notifications, streaks
3. **Monetization infrastructure** (Month 1-2) — Stripe, tier enforcement, trials
4. **Content expansion** (Month 2-4) — More meditations, more sounds
5. **Differentiation** (Month 5-8) — AI coach, wearable integration, social

The biggest risk is **premature scaling** — acquiring users before retention and monetization are in place. Focus on Phase 0-1 before any marketing spend.

---

*Generated by product roadmap analysis — Zenith Mind repository*
