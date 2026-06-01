# Testing

## Test Pyramid

AskDocs uses a three-level test strategy:

| Level | What we test | Location | Speed |
|---|---|---|---|
| Unit | Pure logic — chunking, caching, rate limits, provider crypto | `tests/test_chunking.py`, `tests/test_limits.py`, `tests/test_provider_*.py` | Very fast (no DB) |
| Integration | HTTP endpoints with a real test database | `tests/test_multi_tenancy.py`, `tests/test_permissions.py`, `tests/test_chat_*.py` | Moderate (DB writes) |
| Smoke | Full pipeline: upload → ingest → query → stream | `scripts/smoke-test.sh` | Slow (real API calls) |

pytest is configured in `backend/pyproject.toml` with `DJANGO_SETTINGS_MODULE=config.settings.testing`.

## Running the Suite

```bash
# Full suite
docker compose exec web pytest -v

# With coverage report
docker compose exec web pytest --cov=apps --cov-report=term-missing

# Only a specific file
docker compose exec web pytest tests/test_chat_streaming.py -v

# Match tests by name keyword
docker compose exec web pytest -k "isolation" -v

# Stop at first failure and drop into pdb
docker compose exec web pytest -x --pdb

# Re-run only previously failed tests
docker compose exec web pytest --lf
```

## Coverage Targets

| App | Current target | Notes |
|---|---|---|
| `apps/chat` | > 80% | Critical path — high value |
| `apps/providers` | > 75% | Encryption + registry logic |
| `apps/workspaces` | > 80% | Multi-tenancy enforcement |
| `apps/documents` | > 70% | Pipeline tested via integration |
| `apps/accounts` | > 60% | OAuth flow is hard to unit test |
| `apps/core` | > 90% | Mixins and permissions are foundational |

## Critical Test Categories

### Multi-Tenancy Isolation (`tests/test_multi_tenancy.py`)

Verifies that users cannot access another workspace's data under any circumstances:
- User A cannot list User B's conversations
- User A cannot list User B's documents
- User A cannot read or write User B's provider config
- A MEMBER cannot access a workspace they don't belong to
- Objects returned by the API always belong to the requesting user's workspace

### Permission Enforcement (`tests/test_permissions.py`)

Verifies that role checks work correctly:
- `IsWorkspaceMember` allows members, blocks non-members
- `IsWorkspaceAdmin` blocks MEMBER and VIEWER roles
- `IsWorkspaceMemberOrAdmin` blocks VIEWER role

### Chat Streaming (`tests/test_chat_streaming.py`)

Verifies the SSE pipeline end-to-end:
- Token events arrive in sequence
- Complete event includes `message_id` and `citations`
- Citations map correctly to retrieved chunk UUIDs
- Cached responses return `is_cached=true`
- Cache hit returns the same text without calling the provider

### Provider Failure Handling (`tests/test_chat_failures.py`)

Verifies graceful degradation when the LLM provider fails:
- `ProviderAuthError` → SSE error event with `code: provider_auth_error`
- `ProviderRateLimitError` → SSE error event with `code: provider_rate_limited`
- `ProviderTimeoutError` → SSE error event with `code: provider_timeout`
- Error message is stored on the assistant `Message` row

### Rate Limiting (`tests/test_chat_limits.py`)

Verifies Redis-backed rate limit logic:
- User limit blocks after N messages per day
- Global budget blocks platform-default workspaces
- BYOK workspaces are not subject to the global budget
- Redis keys expire after 24 hours

### Provider Factory (`tests/test_provider_factory.py`)

Verifies `PROVIDER_REGISTRY` completeness:
- All 7 providers can be instantiated from a config object
- Unsupported provider names raise `ProviderConfigInvalid`
- `SUPPORTED_PROVIDERS` list contains all 7 entries with required fields

### Chunking (`tests/test_chunking.py`)

Verifies semantic chunking logic:
- Title/Header elements flush pending prose and start a new chunk
- Tables are kept whole (up to 2000 tokens)
- Long prose is split at ≤ 512 tokens with 50-token overlap
- All chunks have non-empty `element_type`

## End-to-End Smoke Test Recipe

Run this sequence manually to verify the system works after a major change or before deployment:

1. **Health check**
   ```bash
   curl http://localhost:8000/api/health/
   ```

2. **Get a JWT** (skip Google OAuth — create user directly):
   ```bash
   docker compose exec web python manage.py shell -c "
   from apps.accounts.models import User
   from rest_framework_simplejwt.tokens import RefreshToken
   user, _ = User.objects.get_or_create(email='smoke@test.com', defaults={'first_name': 'Smoke'})
   t = RefreshToken.for_user(user)
   ws = user.memberships.first().workspace
   print('TOKEN:', str(t.access_token))
   print('WS_ID:', str(ws.id))
   "
   ```

3. **Upload a test document** (once document API is available in Phase 6; currently via Django shell):
   ```python
   from apps.documents.models import Document
   from apps.documents.tasks import ingest_document
   import base64
   doc = Document.objects.create(
       workspace=ws, uploaded_by=user,
       filename="test.txt", mime_type="text/plain"
   )
   content = b"AskDocs is a RAG platform. It supports multiple workspaces and BYOK providers."
   ingest_document.delay(str(doc.id), base64.b64encode(content).decode())
   ```

4. **Poll until READY**
   ```bash
   # Repeat until status=ready
   docker compose exec web python manage.py shell -c "
   from apps.documents.models import Document
   d = Document.objects.latest('created_at')
   print(d.status, d.error_message)
   "
   ```

5. **Create a conversation**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/workspaces/${WS_ID}/conversations/" \
     -H "Authorization: Bearer ${TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"title": "Smoke test"}'
   ```

6. **Send a question and verify streaming response with citations**
   ```bash
   curl -X POST \
     "http://localhost:8000/api/v1/workspaces/${WS_ID}/conversations/${CONV_ID}/messages/" \
     -H "Authorization: Bearer ${TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"content": "What does AskDocs support?"}'
   ```
   You should see `event: token` lines followed by `event: complete` with a `citations` object.

7. **Verify the cited chunks are relevant**
   ```bash
   curl "http://localhost:8000/api/v1/workspaces/${WS_ID}/conversations/${CONV_ID}/messages/${MSG_ID}/sources/" \
     -H "Authorization: Bearer ${TOKEN}"
   ```
   The returned chunks should contain the text from the uploaded document.

8. **Check quota**
   ```bash
   curl "http://localhost:8000/api/v1/workspaces/${WS_ID}/chat/quota/" \
     -H "Authorization: Bearer ${TOKEN}"
   ```

## Automated Smoke Test Script

`scripts/smoke-test.sh` automates the above sequence. It uses Django management commands to obtain a token and workspace ID, then runs the full chat flow.

```bash
cd AskDocs
./scripts/smoke-test.sh
```

The script exits with code 0 on success, non-zero on failure. Suitable for CI post-deploy verification.

## Manual Testing Checklists

### New provider added
- [ ] Factory returns the correct class for the new `provider_name`
- [ ] `test_connection()` succeeds with a valid test key
- [ ] `test_connection()` returns a proper error (not exception) for invalid key
- [ ] `complete()` returns a `CompletionResult`
- [ ] `stream()` yields at least one `StreamChunk` and terminates
- [ ] Provider appears in `GET /api/v1/providers/supported/`
- [ ] `PUT /api/v1/workspaces/{id}/provider/` with the new provider saves without error
- [ ] Chat works end-to-end with the new provider

### Permission change
- [ ] Non-member gets 403 on all workspace-scoped endpoints
- [ ] VIEWER gets 403 on `POST .../messages/`
- [ ] MEMBER cannot reach admin-only endpoints (`/provider/`, `/members/{id}/` PATCH/DELETE)
- [ ] ADMIN can reach all endpoints

### Multi-tenancy change
- [ ] User A cannot see User B's conversations, documents, or messages
- [ ] `WorkspaceScopedQuerysetMixin` filters correctly for the changed model

## Debugging Guide

**Tests fail with `relation "X" does not exist`**
Migrations haven't run. Use `--reuse-db` to skip DB creation, or let pytest recreate it:
```bash
docker compose exec web pytest --create-db
```

**Test hits rate limits in CI**
Rate limits use the Django cache, which is an in-memory cache in testing (`django.core.cache.backends.locmem.LocMemCache`). The test fixtures clear the cache with `cache.clear()` in `autouse` fixtures. If tests bleed into each other, check that the `_clear` fixture is present.

**Streaming test hangs**
The `StreamingHttpResponse` must be consumed. Use the `_consume_sse(resp)` helper in test files, which handles both streaming and non-streaming responses.

**Provider test fails in CI with no API key**
Provider tests that require a real API call should be marked `@pytest.mark.skip(reason="requires live API key")` or use `unittest.mock.patch` to mock the provider client.

---

**What's next:** [deployment.md](deployment.md) — the Phase 6 deployment plan.
