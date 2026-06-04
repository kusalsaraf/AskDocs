# Deployment Guide

AskDocs deploys on free tiers across three services:

| Component | Platform | Plan |
|-----------|----------|------|
| Frontend (Next.js) | Vercel | Hobby (free) |
| Backend API (Django) | Render | Free web service |
| Celery Worker | Render | Free worker |
| Redis | Render | Free Redis |
| PostgreSQL + pgvector | Supabase | Free tier |
| LLM + Embeddings | Google Gemini | Free API tier |

## Prerequisites

- [GitHub](https://github.com) account with the AskDocs repo pushed
- [Supabase](https://supabase.com) account
- [Render](https://render.com) account
- [Vercel](https://vercel.com) account
- [Google Cloud Console](https://console.cloud.google.com) project with OAuth 2.0 credentials
- [Google AI Studio](https://ai.google.dev) Gemini API key

---

## Step 1 — Supabase (Database)

1. Create a new Supabase project (any region close to you)
2. Once the project is ready, go to **SQL Editor** and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Go to **Settings > Database > Connection string** and copy the **URI** format:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
   Use the **Transaction (port 6543)** pooling mode URL for Django.

4. Save this as your `DATABASE_URL` — you'll need it for Render.

## Step 2 — Render (Backend)

### Option A: Blueprint Deploy (recommended)

1. Go to [Render Dashboard](https://dashboard.render.com) > **Blueprints** > **New Blueprint Instance**
2. Connect your GitHub repo
3. Render will detect `render.yaml` and create all three services:
   - `askdocs-api` (web service)
   - `askdocs-worker` (background worker)
   - `askdocs-redis` (Redis instance)
4. Set the environment variables marked `sync: false` in the Render dashboard:

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `DATABASE_URL` | Supabase connection string | Step 1 |
| `CORS_ALLOWED_ORIGINS` | `https://your-app.vercel.app` | Set after Vercel deploy (Step 3) |
| `FRONTEND_URL` | `https://your-app.vercel.app` | Set after Vercel deploy (Step 3) |
| `GOOGLE_OAUTH_CLIENT_ID` | Your Google OAuth Client ID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Your Google OAuth Client Secret | Same as above |
| `PROVIDER_ENCRYPTION_KEY` | Fernet key | Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DEFAULT_PLATFORM_GEMINI_API_KEY` | Your Gemini API key | [Google AI Studio](https://ai.google.dev) |

**Important:** Set the same `DATABASE_URL`, `PROVIDER_ENCRYPTION_KEY`, and `DEFAULT_PLATFORM_GEMINI_API_KEY` on both the `askdocs-api` and `askdocs-worker` services.

### Option B: Manual Setup

If you prefer manual setup, create each service individually:

1. **Redis:** New Redis > Free plan > Create
2. **Web Service:** New Web Service > Connect repo > Docker > Free plan
   - Root directory: `backend`
   - Docker context: `backend`
   - Start command: `bash scripts/start.sh`
   - Set all env vars from the table above
3. **Worker:** New Background Worker > Same repo > Docker > Free plan
   - Root directory: `backend`
   - Docker context: `backend`
   - Start command: `celery -A config worker --loglevel=info --concurrency=2`
   - Set same env vars

### Post-Deploy Verification

Once the API is deployed, verify:

```bash
curl https://askdocs-api.onrender.com/api/health/
# Expected: {"status":"ok","version":"0.1.0","checks":{"database":"ok","redis":"ok"}}
```

Swagger docs: `https://askdocs-api.onrender.com/api/docs/`

## Step 3 — Vercel (Frontend)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) > **Add New Project**
2. Import the GitHub repo
3. Set **Root Directory** to `frontend`
4. Framework preset: **Next.js** (auto-detected)
5. Add environment variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://askdocs-api.onrender.com/api/v1` |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | Your Google OAuth Client ID |

6. Deploy

### Google OAuth — Update Authorized Origins

After deploying to Vercel, go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and add your Vercel URL to the OAuth 2.0 Client:

- **Authorized JavaScript origins:** `https://your-app.vercel.app`
- **Authorized redirect URIs:** `https://your-app.vercel.app`

Then update Render's `CORS_ALLOWED_ORIGINS` and `FRONTEND_URL` with the Vercel URL.

## Step 4 — Verify End-to-End

1. Visit your Vercel URL
2. Sign in with Google
3. Upload a document (PDF, DOCX, or TXT, max 5 MB)
4. Wait for ingestion to complete (check document status)
5. Ask a question about the document
6. Verify citations appear in the response

---

## Free Tier Limitations

| Service | Constraint | Impact |
|---------|-----------|--------|
| Render Free Web | Spins down after 15 min inactivity | Cold start takes ~30s on first request |
| Render Free Redis | 25 MB, no persistence | Cache/rate limit data lost on restart |
| Supabase Free | 500 MB storage, pauses after 7 days inactivity | Ping periodically to prevent pause |
| Gemini Free | 15 requests/minute, 1M tokens/day | Adequate for demo usage |
| Vercel Hobby | 100 GB bandwidth/month | More than enough |

## Production Considerations

For a real production deployment beyond the free tier:

- **Render Starter ($7/mo):** No cold starts, more RAM, persistent Redis
- **Supabase Pro ($25/mo):** No auto-pause, 8 GB storage, daily backups
- **Celery Beat:** Add a scheduled task runner for `reap_stuck_documents` (runs every 10 min)
- **Custom domain:** Configure DNS on both Vercel and Render
- **Monitoring:** Add Sentry for error tracking, Datadog or Render metrics for performance
