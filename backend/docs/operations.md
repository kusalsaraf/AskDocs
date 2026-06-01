# Operations

This runbook covers common operational tasks, diagnostic procedures, and useful Django shell snippets for working with a running AskDocs instance.

## Common Operational Tasks

### Add a workspace member manually

```python
# Django shell
from apps.accounts.models import User
from apps.workspaces.models import Workspace, Membership

user = User.objects.get(email="newmember@example.com")
workspace = Workspace.objects.get(slug="my-workspace-ab12cd")
Membership.objects.create(workspace=workspace, user=user, role=Membership.Role.MEMBER)
```

### Change a member's role

```python
Membership.objects.filter(workspace=workspace, user=user).update(role=Membership.Role.ADMIN)
```

### Reset a stuck document (re-queue ingestion)

```python
from apps.documents.models import Document

doc = Document.objects.get(id="<uuid>")
print("Current status:", doc.status)
print("Error:", doc.error_message)

# Reset to pending (next step: dispatch the task again with the original file bytes)
doc.status = "pending"
doc.error_message = ""
doc.save(update_fields=["status", "error_message"])
```

### View and rotate a workspace's BYOK API key

```python
from apps.providers.models import ProviderConfig
config = ProviderConfig.objects.get(workspace__slug="my-workspace-ab12cd")
print("Provider:", config.provider_name)
print("Key last 4:", config.api_key_last_4)
print("Last test status:", config.last_test_status)

# To rotate: use the API endpoint
# PUT /api/v1/workspaces/{id}/provider/ with new api_key
```

### Delete a workspace's provider config (revert to platform default)

```python
from apps.providers.models import ProviderConfig
ProviderConfig.objects.filter(workspace__slug="my-workspace-ab12cd").delete()
```

### Create a superuser for Django admin access

```bash
docker compose exec web python manage.py createsuperuser --email admin@example.com
# Visit http://localhost:8000/admin/
```

## Diagnosing Common Issues

### Ingestion stuck in PROCESSING

**Symptoms:** Document status stays `processing` for more than 5 minutes.

**Likely cause:** Celery worker crashed or is not running; or embedding API is down.

**Diagnosis:**
```bash
docker compose ps                            # Is the worker container running?
docker compose logs worker --tail=50        # Any exceptions?
docker compose exec worker celery -A config.celery inspect active  # Running tasks?
```

**Fix:**
```bash
docker compose restart worker
```

If the worker logs show an embedding API error (rate limit, auth failure), fix the API key in `.env`, restart, and reset the document to PENDING.

### Retrieval returns no results

**Symptoms:** Chat responds "I couldn't find relevant information" for queries that should match.

**Likely cause:** Documents aren't READY; wrong embedding provider; or `min_score` threshold too high.

**Diagnosis:**
```python
from apps.documents.models import Document, DocumentChunk
from apps.workspaces.models import Workspace

ws = Workspace.objects.get(slug="my-workspace-ab12cd")
print("Documents:", Document.objects.filter(workspace=ws, status="ready").count())
print("Chunks:", DocumentChunk.objects.filter(workspace=ws).count())
```

If chunk count is 0, the document pipeline hasn't completed successfully. Check document status and worker logs.

To test retrieval directly:
```python
from apps.chat.retrieval import retrieve_chunks_for_query
chunks = retrieve_chunks_for_query(ws.id, "your test query", top_k=5, min_score=0.3)
for c in chunks:
    print(f"score={c.score:.3f} | doc={c.document_filename} | {c.content[:80]}")
```

If you get 0 results with `min_score=0.3`, the embedding provider used for ingestion may differ from the one used for querying. Check `EMBEDDING_PROVIDER` — it must be consistent.

### Streaming hangs or returns nothing

**Symptoms:** The `POST .../messages/` endpoint connects but no events arrive, or the connection drops immediately.

**Likely cause:** LLM provider is down or the API key is invalid; or the streaming response is being buffered.

**Diagnosis:**
```bash
docker compose logs web --tail=20    # Look for provider errors
```

Test the provider directly:
```bash
curl -X POST "http://localhost:8000/api/v1/workspaces/${WS_ID}/provider/test/" \
  -H "Authorization: Bearer ${TOKEN}"
```

If `test_connection` fails, fix the provider config.

### Login fails (Google OAuth error)

**Symptoms:** After Google OAuth popup, the frontend shows an error or redirects to an error page.

**Likely causes:**
- `GOOGLE_OAUTH_CLIENT_ID` or `GOOGLE_OAUTH_CLIENT_SECRET` is wrong
- The redirect URI in Google Cloud Console doesn't match the frontend URL
- `CORS_ALLOWED_ORIGINS` doesn't include the frontend URL
- Django's `SITE_ID` is not set (allauth requires it)

**Diagnosis:**
```bash
docker compose logs web --tail=30    # Look for allauth errors
```

Check that `CORS_ALLOWED_ORIGINS=http://localhost:3000` is in `.env`.

## Database Health Queries

```sql
-- Table row counts
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Index sizes
SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - pg_stat_activity.query_start > interval '5 seconds'
ORDER BY duration DESC;

-- Chunk count per workspace
SELECT w.name, COUNT(c.id) AS chunks
FROM apps_documents_documentchunk c
JOIN apps_workspaces_workspace w ON w.id = c.workspace_id
GROUP BY w.name
ORDER BY chunks DESC;
```

## Celery Task Monitoring

```bash
# See active tasks (currently running)
docker compose exec worker celery -A config.celery inspect active

# See scheduled/reserved tasks
docker compose exec worker celery -A config.celery inspect reserved

# See worker stats (processed count, etc.)
docker compose exec worker celery -A config.celery inspect stats

# Monitor in real-time
docker compose exec worker celery -A config.celery events --dump
```

Check queue depth in Redis:
```bash
docker compose exec redis redis-cli llen celery
```

## Rate Limit and Budget Overrides

To reset a user's daily message count (e.g., after a billing issue):
```python
from django.core.cache import cache
from datetime import date

user_id = "550e8400-e29b-41d4-a716-446655440000"
key = f"chat:user:{user_id}:{date.today().isoformat()}"
cache.delete(key)
print("User quota reset")
```

To reset the global budget counter:
```python
from django.core.cache import cache
from datetime import date
key = f"chat:global_budget:{date.today().isoformat()}"
cache.delete(key)
print("Global budget reset")
```

To check current usage:
```python
from apps.chat.limits import get_user_messages_used_today, get_remaining_global_budget
from apps.accounts.models import User

user = User.objects.get(email="alice@example.com")
print("Messages used today:", get_user_messages_used_today(user.id))
print("Global budget remaining:", get_remaining_global_budget())
```

## Useful Django Shell One-Liners

```python
# All workspaces and member counts
from apps.workspaces.models import Workspace, Membership
for ws in Workspace.objects.all():
    print(ws.name, Membership.objects.filter(workspace=ws).count(), "members")

# Documents by status across all workspaces
from apps.documents.models import Document
from django.db.models import Count
Document.objects.values("status").annotate(count=Count("id"))

# Total chunks in the system
from apps.documents.models import DocumentChunk
print(DocumentChunk.objects.count(), "chunks")

# Messages per day (last 7 days)
from apps.chat.models import Message
from django.db.models import Count
from django.db.models.functions import TruncDate
Message.objects.filter(role="user").annotate(day=TruncDate("created_at")).values("day").annotate(count=Count("id")).order_by("-day")[:7]

# Provider config summary
from apps.providers.models import ProviderConfig
for pc in ProviderConfig.objects.select_related("workspace"):
    print(pc.workspace.name, pc.provider_name, pc.last_test_status)
```
