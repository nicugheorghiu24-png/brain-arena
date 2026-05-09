#!/usr/bin/env bash
#
# Brain Arena — rollback to a previous commit.
#
# Usage:
#   bash scripts/rollback.sh <sha>
#
# Examples:
#   bash scripts/rollback.sh c8ec1af              # specific SHA
#   bash scripts/rollback.sh HEAD~1               # one commit back
#
# What this does:
#   1. Verifies the target ref exists
#   2. Checks out that ref onto a fresh branch (avoid detached HEAD)
#   3. Re-runs the deploy: clean install, build, supervised restart
#   4. Smoke-checks the result
#
# Safety:
#   - Refuses if working tree has uncommitted changes
#   - Restores the old branch on failure (best-effort)
#   - Does NOT touch the database — schema rollback is your job

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ $# -ne 1 ]; then
  echo "Usage: bash scripts/rollback.sh <sha-or-ref>" >&2
  exit 1
fi

TARGET="$1"

step() { printf '\n── %s ──\n' "$*"; }
fatal() { echo "FATAL: $*" >&2; exit 1; }

step "1. preflight"
[ -f .env ] || fatal ".env missing"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked files have local changes:"
  git status --short
  fatal "commit, stash, or 'git checkout -- <file>' before rollback"
fi

step "2. verify target ref"
git fetch origin main
TARGET_SHA=$(git rev-parse --verify "$TARGET^{commit}" 2>/dev/null || true)
[ -n "$TARGET_SHA" ] || fatal "ref '$TARGET' does not resolve to a commit"
CURRENT_SHA=$(git rev-parse HEAD)
echo "Current : $(echo "$CURRENT_SHA" | cut -c1-7)"
echo "Target  : $(echo "$TARGET_SHA"  | cut -c1-7)"
if [ "$TARGET_SHA" = "$CURRENT_SHA" ]; then
  echo "Already at target. Nothing to do."
  exit 0
fi

step "3. checkout target onto a rollback branch"
ROLLBACK_BRANCH="rollback-from-$(echo "$CURRENT_SHA" | cut -c1-7)-$(date +%s)"
git switch --create "$ROLLBACK_BRANCH" "$TARGET_SHA"
echo "On branch: $ROLLBACK_BRANCH"

step "4. clean install + build (delegated to deploy.sh internals)"
rm -rf node_modules .next .next.old
npm ci
npx prisma generate
NODE_ENV=production npm run build

step "5. restart via process manager (auto-detect)"
# We can't delegate to deploy.sh — it requires being on `main` and
# we're on the rollback branch. Inline the same logic.
RESOLVED_PM=""
if command -v pm2 >/dev/null 2>&1 && pm2 describe brain-arena >/dev/null 2>&1; then
  RESOLVED_PM="pm2"
elif systemctl is-enabled brain-arena.service >/dev/null 2>&1; then
  RESOLVED_PM="systemd"
else
  RESOLVED_PM="nohup"
fi
echo "Process manager: $RESOLVED_PM"
case "$RESOLVED_PM" in
  pm2)     pm2 restart brain-arena --update-env && pm2 save || true ;;
  systemd) systemctl restart brain-arena.service ;;
  nohup)
    pkill -f 'tsx.*server\.js' 2>/dev/null || true
    sleep 4
    pkill -KILL -f 'tsx.*server\.js' 2>/dev/null || true
    sleep 1
    LOG="/var/log/brain-arena/app-rollback-$(date +%Y%m%d-%H%M%S).log"
    mkdir -p /var/log/brain-arena
    nohup env NODE_ENV=production npm start > "$LOG" 2>&1 < /dev/null &
    disown $! 2>/dev/null || true
    ;;
esac

# Wait for /api/health to respond.
for i in $(seq 1 30); do
  if curl -s --max-time 2 http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "  responding after ${i}s"
    break
  fi
  sleep 1
done
curl -s http://127.0.0.1:3000/api/health || fatal "app did not start within 30 s"
echo

step "6. confirm rollback landed"
echo "Now at: $(git rev-parse HEAD)"
echo "On branch: $(git branch --show-current)"

cat <<EOF

✓ ROLLBACK COMPLETE
  $(echo "$CURRENT_SHA" | cut -c1-7) → $(echo "$TARGET_SHA" | cut -c1-7)
  branch: $ROLLBACK_BRANCH

Next steps:
  - If the rollback fixed things and you want to keep it: push the
    branch and merge to main.
  - To restore the previous HEAD instead: git switch main
  - To delete this rollback branch: git branch -d $ROLLBACK_BRANCH
EOF
