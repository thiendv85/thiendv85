# V16 Deployment Guide — 2026-05-08

## Bundle results

| Stage | Initial JS+CSS raw | Initial gzip | Notes |
|-------|--------------------|--------------|-------|
| **Original** | ~1133 KB | 312 KB + 850 KB CDN | Tailwind+FA loaded from CDN at runtime |
| **Post-CRITICAL fixes** | 770 KB | 197 KB | CDN eliminated, xlsx lazy, genai removed |
| **Iteration 1** (lazy Settings) | 651 KB | 171.7 KB | SettingsPage now lazy |
| **Iteration 3** (FA deferred) | 644 KB | 170.3 KB | FA loaded non-blocking via `media="print"` |
| **Final** | **644 KB** | **170.6 KB** | UX tokens added (no impact) |

**Net win**: 312 KB gz → 170.6 KB gz initial, plus 850 KB CDN runtime eliminated. ~70% reduction in critical-path bytes.

## Manual deployment steps the user must run

These cannot be automated:

```bash
cd D:\App\V16

# 1. Install new deps locally and verify
npm install
npm run typecheck   # zero errors
npm run build       # produces dist/

# 2. CRITICAL: Apply RLS migration on Supabase
#    Choose ONE:
supabase db push                                              # if using Supabase CLI
# OR paste D:\App\V16\supabase\migrations\009_proper_rls_policies.sql in Studio SQL editor

# 3. Deploy Gemini proxy Edge Function
supabase secrets set GEMINI_API_KEY=YOUR_KEY
supabase functions deploy gemini-proxy
# Optionally tighten allowed origins (replaces CORS *):
supabase secrets set ALLOWED_ORIGINS="https://app.example.com,https://app.example.com.vercel.app"

# 4. Redeploy updated send-approval-email Edge Function (now requires Bearer auth)
supabase functions deploy send-approval-email

# 5. Redeploy updated check-escalation (N+1 fixed)
supabase functions deploy check-escalation

# 6. Set Vercel env vars (Project Settings → Environment Variables)
#    REQUIRED:
#      VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
#      VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_ANON_KEY

# 7. Trigger redeploy
git add -A
git commit -m "v16: security/perf hardening + refactor + bundle 312KB→170KB gz initial"
git push       # Vercel auto-deploys
```

## Post-deploy verification

1. **RLS active** — run in Supabase SQL editor:
   ```sql
   SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY 1, 2;
   ```
   Should show new policies like `snapshot_metadata_insert_admin`, no `USING (true)` rows.

2. **Bundle deployed** — open the Vercel URL, view-source on `index.html`. Expect:
   - No `<script src="https://cdn.tailwindcss.com">`.
   - No `<link href="https://cdnjs.cloudflare.com/.../font-awesome/6.5.1/css/all.min.css">`.
   - No `<script type="importmap">`.
   - `<link rel="stylesheet" href="/fa/all.min.css" media="print" onload="this.media='all'">` present.

3. **Auth + role check** — log in as a non-admin user, attempt to save monthly data via Settings. Should be blocked by RLS, surfaced as error.

4. **Gemini proxy** — open SimulationLab on a SKU, click "Smart Forecast". Should return a valid prediction or fall back to weighted average. Inspect Network tab → request goes to `${SUPABASE_URL}/functions/v1/gemini-proxy`, no Gemini key visible.

5. **Headers** — `curl -I https://your-app.vercel.app` should show `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`.

## Rollback plan

```bash
# Code rollback
git revert HEAD..main

# DB rollback (RLS migration is mostly idempotent; revert by re-applying old rls_policies.sql,
# but old USING(true) policies grant LESS than new ones for non-admin users — only admins
# should rollback if writes are blocking legitimate users):
psql -h <host> -U <user> -d <db> -f supabase/rls_policies.sql

# Vercel rollback: go to Deployments → previous successful → Promote
```

## Known follow-ups (deferred from this pass)

- **Font Awesome → lucide-react** (365 usages). Plan: incremental migration, ~1 sprint.
- **Profiles RLS write** — migration 009 allows admin-only updates to role/approval_levels. If a "user can edit own avatar/full_name" feature exists, the `profiles_update_self_safe` policy supports it; verify with end-users.
- **send-approval-email RESEND_API_KEY** — already required server-side; ensure rotated quarterly.
- **`cloud_storage` schema** — currently used as a JSONB key-value store with `ILIKE 'monthly_index_%'` scans. Migrate to a dedicated `monthly_snapshots` table when next touching this code path.
