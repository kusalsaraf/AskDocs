# Deployment

> **Draft — completed in Phase 6.** This document describes the planned production deployment architecture. AskDocs has not yet been deployed to production. Steps marked as "TODO" will be filled in during Phase 6.

## Target Infrastructure

All services run on free-tier plans suitable for a portfolio project.

| Service | Platform | Plan | Purpose |
|---|---|---|---|
| Frontend | Vercel | Hobby (free) | Next.js 14 App Router |
| Backend API | Fly.io | Machines (free tier) | Django + Gunicorn |
| Celery Worker | Fly.io | Machines (free tier) | Background document ingestion |
| PostgreSQL + pgvector | Supabase | Free tier | Database |
| Object Storage | Supabase Storage | Free tier (1 GB) | Document file storage |
| Redis | Upstash | Serverless (10,000 req/day free) | Celery broker + cache |

**Total monthly cost at portfolio scale: $0.**

## Why These Platforms

**Vercel** — zero-config Next.js deployment. Handles SSR, Edge Functions, and preview deployments per PR. No Docker knowledge required for the frontend.

**Fly.io** — runs Docker containers close to users in any region. Free tier includes enough compute for a demo-scale API. Supports persistent volumes for file storage, though we'll use Supabase Storage instead to keep the API stateless.

**Supabase** — managed PostgreSQL with the pgvector extension pre-installed. No need to configure the extension manually. The free tier includes 500 MB database + 1 GB file storage. Supabase Storage is an S3-compatible object store that integrates cleanly with Django's storage backends.

**Upstash** — serverless Redis billed per request. The free tier (10,000 requests/day) is sufficient for rate limiting + Celery at portfolio scale. No always-on Redis instance means no idle cost.

## Pre-Deployment Checklist

- [ ] All environment variables documented and stored in Fly.io secrets + Vercel environment variables
- [ ] `DJANGO_DEBUG=False` in production settings
- [ ] `DJANGO_ALLOWED_HOSTS` set to the production domain
- [ ] `CORS_ALLOWED_ORIGINS` set to the Vercel frontend URL
- [ ] `JWT_SIGNING_KEY` is a strong random string (not the Django `SECRET_KEY`)
- [ ] `PROVIDER_ENCRYPTION_KEY` is set and backed up securely
- [ ] Database migrations run successfully against the Supabase production DB
- [ ] Static files served via WhiteNoise or a CDN
- [ ] Production smoke test passes locally against production env vars
- [ ] Celery worker image builds and connects to Upstash Redis

## Step-by-Step Deploy

**TODO: Complete during Phase 6.**

```bash
# 1. Install Fly.io CLI
brew install flyctl
flyctl auth login

# 2. Create Fly.io apps
flyctl apps create askdocs-api
flyctl apps create askdocs-worker

# 3. Set secrets
flyctl secrets set DJANGO_SECRET_KEY="..." --app askdocs-api
flyctl secrets set DATABASE_URL="postgresql://..." --app askdocs-api
# ... (all env vars from .env.example)

# 4. Deploy API
flyctl deploy --app askdocs-api

# 5. Run migrations
flyctl ssh console --app askdocs-api -C "python manage.py migrate"

# 6. Deploy worker
flyctl deploy --app askdocs-worker

# 7. Deploy frontend
# Push to GitHub → Vercel auto-deploys from main branch
```

## Post-Deploy Verification

After deploy, run the production smoke test:

```bash
BACKEND_URL=https://askdocs-api.fly.dev ./scripts/smoke-test.sh
```

Manual checklist:
- [ ] `GET https://askdocs-api.fly.dev/api/health/` returns `{"status": "ok"}`
- [ ] Google OAuth login works (check CORS + OAuth redirect URIs)
- [ ] A test document can be ingested (status reaches READY)
- [ ] A chat message returns a streaming response with citations
- [ ] Provider test connection works for at least one BYOK provider

## Monitoring and Observability

**Fly.io logs:**
```bash
flyctl logs --app askdocs-api
flyctl logs --app askdocs-worker
```

**Supabase dashboard:** Real-time query stats, slow query identification, table sizes.

**Upstash console:** Redis key count, request rate, error rate.

**What to check daily (at portfolio scale):** Fly.io shows if the machine is running. Supabase shows DB connection count. Nothing else needs daily review unless users report issues.

## Backup and Restore

**Database:** Supabase automatically takes daily backups on the free tier. To manually export:
```bash
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql
```

**Encryption key:** `PROVIDER_ENCRYPTION_KEY` must be backed up separately. If this key is lost, all stored BYOK API keys become unrecoverable and users will need to re-enter them.

**What NOT to back up separately:** Document files (stored in Supabase Storage, replicated), Redis data (ephemeral — rate limit counters and cache, both safe to lose).

---

**What's next:** [operations.md](operations.md) — the day-to-day runbook.
