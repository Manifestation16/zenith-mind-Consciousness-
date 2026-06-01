# Zenith Mind — One-Time Setup (Do This Once, Never Again)

After this, every change auto-deploys. Claude handles the rest.

---

## STEP 1 — Enable GitHub Pages (2 minutes)

1. Go to: https://github.com/Manifestation16/zenith-mind-Consciousness-/settings/pages
2. Source → "GitHub Actions" (NOT "Deploy from branch")
3. Click Save
4. Done — the Action will deploy automatically on your next push

---

## STEP 2 — Supabase Database (5 minutes)

1. Go to https://supabase.com and open your project
2. Click "SQL Editor" in the left sidebar
3. Paste the entire contents of `supabase-setup.sql` and click Run
4. Go to Project Settings → API
5. Copy your:
   - Project URL (e.g. https://xxxx.supabase.co)
   - anon / public key

---

## STEP 3 — Add GitHub Secrets (3 minutes)

Go to: https://github.com/Manifestation16/zenith-mind-Consciousness-/settings/secrets/actions

Add these secrets (New repository secret):

| Secret Name               | Value                          |
|--------------------------|--------------------------------|
| SUPABASE_URL             | Your Supabase Project URL      |
| SUPABASE_ANON_KEY        | Your Supabase anon key         |
| STRIPE_TRANSCENDENCE_LINK| Your Stripe payment link ($12) |
| STRIPE_ILLUMINATION_LINK | Your Stripe payment link ($39) |

---

## STEP 4 — Stripe Payment Links (5 minutes)

1. Go to https://dashboard.stripe.com → Products
2. Create product "Zenith Mind Transcendence" → $12/month recurring
3. Create payment link → copy URL → add as STRIPE_TRANSCENDENCE_LINK secret
4. Create product "Zenith Mind Illumination" → $39/month recurring  
5. Create payment link → copy URL → add as STRIPE_ILLUMINATION_LINK secret

---

## STEP 5 — Upload Files to GitHub (2 minutes)

Upload these files to your repo (drag & drop in GitHub):
- index.html (the upgraded version)
- .github/workflows/deploy.yml (the auto-deploy pipeline)
- supabase-setup.sql (keep for reference)

The moment you push, GitHub Actions deploys automatically.
Your live URL: https://manifestation16.github.io/zenith-mind-Consciousness-/

---

## FROM HERE — Claude Does Everything

Tell Claude:
- "Add a new meditation" → I update index.html and commit
- "Change the pricing" → I update and deploy
- "Add an email to the waitlist" → Done
- "Write a YouTube script for Zenith Mind" → Done
- "Build the React Native app" → In progress

You focus on the vision. I handle the execution.
