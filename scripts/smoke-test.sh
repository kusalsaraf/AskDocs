#!/usr/bin/env bash
# Smoke test for AskDocs backend.
# Requires: curl, docker compose (for local), or set BACKEND_URL for remote.
#
# Usage (local):
#   cd AskDocs && ./scripts/smoke-test.sh
#
# Usage (remote):
#   BACKEND_URL=https://askdocs-api.fly.dev ./scripts/smoke-test.sh

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
SMOKE_EMAIL="smoke-test@askdocs-internal.test"
PASS=0
FAIL=0

# ── helpers ───────────────────────────────────────────────────────────────────

green()  { printf '\033[32m✓ %s\033[0m\n' "$*"; }
red()    { printf '\033[31m✗ %s\033[0m\n' "$*"; }
info()   { printf '\033[36m→ %s\033[0m\n' "$*"; }

check() {
  local label="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    green "$label"
    PASS=$((PASS + 1))
  else
    red "$label"
    FAIL=$((FAIL + 1))
  fi
}

# ── Step 1: Health check ──────────────────────────────────────────────────────

info "Step 1: Health check"
HEALTH=$(curl -sf "${BACKEND_URL}/api/health/" || echo "FAIL")
check "Health check returns 200" "$( [ "$HEALTH" = '{"status":"ok"}' ] && echo true || echo false )"

# ── Step 2: Get JWT and workspace ID from Django shell ────────────────────────

info "Step 2: Getting JWT and workspace ID via Django shell"

SHELL_OUTPUT=$(docker compose -f backend/docker-compose.yml exec -T web python manage.py shell << 'PYEOF'
from apps.accounts.models import User
from apps.workspaces.services import create_personal_workspace
from apps.workspaces.models import Membership
from rest_framework_simplejwt.tokens import RefreshToken

email = "smoke-test@askdocs-internal.test"
user, created = User.objects.get_or_create(
    email=email,
    defaults={"first_name": "Smoke", "last_name": "Test"}
)
if created:
    ws = create_personal_workspace(user)
    print(f"CREATED_USER=1")
else:
    print(f"CREATED_USER=0")

membership = Membership.objects.filter(user=user).select_related("workspace").first()
ws = membership.workspace if membership else None

if ws is None:
    ws = create_personal_workspace(user)

refresh = RefreshToken.for_user(user)
print(f"TOKEN={str(refresh.access_token)}")
print(f"WS_ID={str(ws.id)}")
PYEOF
)

TOKEN=$(echo "$SHELL_OUTPUT" | grep '^TOKEN=' | cut -d= -f2)
WS_ID=$(echo "$SHELL_OUTPUT" | grep '^WS_ID=' | cut -d= -f2)

check "Got access token" "$( [ -n "$TOKEN" ] && echo true || echo false )"
check "Got workspace ID" "$( [ -n "$WS_ID" ] && echo true || echo false )"

if [ -z "$TOKEN" ] || [ -z "$WS_ID" ]; then
  red "Cannot continue without token and workspace ID"
  exit 1
fi

# ── Step 3: /me endpoint ──────────────────────────────────────────────────────

info "Step 3: GET /me"
ME=$(curl -sf "${BACKEND_URL}/api/v1/me/" \
  -H "Authorization: Bearer ${TOKEN}")
ME_EMAIL=$(echo "$ME" | python3 -c "import sys,json; print(json.load(sys.stdin)['email'])" 2>/dev/null || echo "")
check "/me returns correct email" "$( [ "$ME_EMAIL" = "$SMOKE_EMAIL" ] && echo true || echo false )"

# ── Step 4: Workspace list ────────────────────────────────────────────────────

info "Step 4: List workspaces"
WS_LIST=$(curl -sf "${BACKEND_URL}/api/v1/workspaces/" \
  -H "Authorization: Bearer ${TOKEN}")
WS_COUNT=$(echo "$WS_LIST" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
check "Workspace list returns ≥ 1 item" "$( [ "$WS_COUNT" -ge 1 ] && echo true || echo false )"

# ── Step 5: Supported providers (public endpoint) ─────────────────────────────

info "Step 5: GET /providers/supported/ (public)"
PROVIDERS=$(curl -sf "${BACKEND_URL}/api/v1/providers/supported/")
PROV_COUNT=$(echo "$PROVIDERS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
check "Supported providers returns 7 entries" "$( [ "$PROV_COUNT" -eq 7 ] && echo true || echo false )"

# ── Step 6: Create a conversation ─────────────────────────────────────────────

info "Step 6: Create conversation"
CONV=$(curl -sf -X POST "${BACKEND_URL}/api/v1/workspaces/${WS_ID}/conversations/" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"title": "Smoke test conversation"}')
CONV_ID=$(echo "$CONV" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
check "Created conversation" "$( [ -n "$CONV_ID" ] && echo true || echo false )"

# ── Step 7: Send a message (may fail if no READY documents or no LLM key) ─────

info "Step 7: Send a chat message (streaming)"
MSG_RESPONSE=$(curl -sf -X POST \
  "${BACKEND_URL}/api/v1/workspaces/${WS_ID}/conversations/${CONV_ID}/messages/" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"content": "What documents are available?"}' \
  --max-time 30 2>&1 || echo "STREAM_ERROR")

if echo "$MSG_RESPONSE" | grep -q "event: token\|event: complete\|event: error"; then
  check "Streaming response received (token/complete/error event)" "true"
else
  check "Streaming response received" "false"
  info "Note: This may fail if no READY documents exist or LLM key is not configured"
fi

# ── Step 8: Quota endpoint ────────────────────────────────────────────────────

info "Step 8: GET /chat/quota/"
QUOTA=$(curl -sf "${BACKEND_URL}/api/v1/workspaces/${WS_ID}/chat/quota/" \
  -H "Authorization: Bearer ${TOKEN}")
QUOTA_OK=$(echo "$QUOTA" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if 'user_remaining' in d else 'false')" 2>/dev/null || echo "false")
check "Quota endpoint returns user_remaining" "$QUOTA_OK"

# ── Step 9: Non-member isolation check ────────────────────────────────────────

info "Step 9: Isolation check — other user cannot access this workspace"
OTHER_TOKEN=$(docker compose -f backend/docker-compose.yml exec -T web python manage.py shell << 'PYEOF' | grep '^OTHER_TOKEN=' | cut -d= -f2
from apps.accounts.models import User
from rest_framework_simplejwt.tokens import RefreshToken
user, _ = User.objects.get_or_create(email="smoke-other@askdocs-internal.test",
    defaults={"first_name": "Other"})
print(f"OTHER_TOKEN={str(RefreshToken.for_user(user).access_token)}")
PYEOF
)

if [ -n "$OTHER_TOKEN" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "${BACKEND_URL}/api/v1/workspaces/${WS_ID}/conversations/" \
    -H "Authorization: Bearer ${OTHER_TOKEN}")
  check "Non-member gets 403 on workspace conversations" "$( [ "$STATUS" = "403" ] && echo true || echo false )"
else
  info "Skipping isolation check (could not create other user)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
printf "Results: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n" "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
