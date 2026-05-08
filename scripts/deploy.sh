#!/usr/bin/env bash
#
# Brain Arena — single-command production deploy.
#
# Idempotent: safe to run repeatedly. Aborts loudly on any check that
# would put the site into a partially-deployed state. Designed for the
# bare-metal VPS path (Linux + Node + nohup/systemd/PM2).
#
# Usage:
#   bash scripts/deploy.sh
#
# Optional env (mostly for advanced overrides — defaults are correct):
#   APP_DIR             — defaults to the script's parent ($PROJECT_ROOT)
#   APP_PORT            — defaults to 3000
#   LOG_DIR             — defaults to /var/log/brain-arena
#   PM_MODE             — auto | nohup | pm2 | systemd. Default: auto
#                         (pm2 if installed, else systemd if a unit
#                         named brain-arena.service exists, else nohup)
#   SKIP_PULL=1         — don't run git pull (useful for local rebuilds)
#   SKIP_KILL=1         — don't kill existing process (advanced)
#
# Exit codes:
#   0 — deploy succeeded, smoke checks passed
#   non-zero — aborted at one of the labeled steps; output explains why

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${APP_DIR:-$PROJECT_ROOT}"
APP_PORT="${APP_PORT:-3000}"
LOG_DIR="${LOG_DIR:-/var/log/brain-arena}"
PM_MODE="${PM_MODE:-auto}"

cd "$APP_DIR"

log() { printf '\n── %s ──\n' "$*"; }
fatal() { echo "FATAL: $*" >&2; exit 1; }

log "1. preflight: confirm we're on main, .env present, .env not tracked"
git remote -v >/dev/null 2>&1 || fatal "$APP_DIR is not a git repo"
[ "$(git branch --show-current)" = "main" ] \
  || fatal "not on main branch ($(git branch --show-current))"
[ -f .env ] || fatal ".env missing — production needs one (see .env.example)"
git check-ignore -v .env >/dev/null 2>&1 \
  || fatal ".env is NOT in .gitignore — refusing to proceed"
git ls-files .env 2>/dev/null | grep -q . \
  && fatal ".env is tracked in git — fix that before deploying" || true

log "2. preflight: .env contains the variables the app needs"
if ! grep -q '^DATABASE_URL=' .env; then
  fatal "DATABASE_URL is not set in .env"
fi
if ! grep -q '^PUBLIC_ORIGIN=' .env; then
  fatal "PUBLIC_ORIGIN is not set in .env (e.g. https://playbrainarena.com)"
fi

log "3. preflight: no MODIFIED tracked files (would block fast-forward pull)"
# Untracked files (?? prefix) are fine — they don't block a ff pull and
# we don't want to bail on stuff like a stray swap file or an app.log.
# We only care about modifications to files git is already tracking.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked files have local changes:"
  git status --short
  fatal "commit, stash, or 'git checkout -- <file>' before redeploying"
fi
if [ -n "$(git status --porcelain | grep '^??' || true)" ]; then
  echo "Note: untracked files present (will not block deploy):"
  git status --short | grep '^??' | head -5
fi

if [ -z "${SKIP_PULL:-}" ]; then
  log "4. fetch + ff-only pull"
  git fetch origin main
  BEFORE=$(git rev-parse HEAD | cut -c1-7)
  git pull --ff-only origin main
  AFTER=$(git rev-parse HEAD | cut -c1-7)
  if [ "$BEFORE" != "$AFTER" ]; then
    echo "Advancing $BEFORE → $AFTER"
    git log --oneline "$BEFORE..$AFTER"
  else
    echo "Already at $AFTER"
  fi
fi

log "5. clean install (NODE_ENV-agnostic — all build/runtime deps live in 'dependencies')"
rm -rf node_modules .next .next.old
npm ci

log "6. prisma generate"
npx prisma generate

log "7. (optional) prisma migrate deploy if any pending migrations exist"
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  echo "No prisma/migrations directory — skipping (project uses prisma db push)"
fi

log "8. production build"
NODE_ENV=production npm run build

log "9. confirm key routes are in the build"
for r in api/matches api/leaderboard api/auth/me api/auth/login api/auth/signup; do
  [ -d ".next/server/app/$r" ] || fatal "build missing route: /$r"
done
echo "BUILD_ID: $(cat .next/BUILD_ID)"

if [ -z "${SKIP_KILL:-}" ]; then
  log "10. stop any old process (port :$APP_PORT or 'tsx server.js' / 'next-server')"
  PIDS_PORT=$(ss -tlnp 2>/dev/null | grep ":$APP_PORT " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  PIDS_CMD=$(pgrep -af 'tsx.*server\.js|next-server|next start' 2>/dev/null | awk '{print $1}' | sort -u || true)
  ALL_PIDS=$(printf '%s\n%s\n' "${PIDS_PORT:-}" "${PIDS_CMD:-}" | sort -u | grep -v '^$' || true)
  if [ -n "$ALL_PIDS" ]; then
    for p in $ALL_PIDS; do
      echo "  pid=$p $(ps -p "$p" -o cmd= 2>/dev/null || echo gone)"
    done
    echo "$ALL_PIDS" | xargs -r kill -TERM
    sleep 4
    for p in $ALL_PIDS; do
      if kill -0 "$p" 2>/dev/null; then
        echo "  pid=$p still alive → SIGKILL"
        kill -KILL "$p" 2>/dev/null || true
      fi
    done
    sleep 1
  fi
  if ss -tlnp 2>/dev/null | grep -q ":$APP_PORT "; then
    fatal ":$APP_PORT still bound after kill — something else is holding it"
  fi
  echo "✓ :$APP_PORT free"
fi

log "11. choose process manager and start"

start_via_pm2() {
  if pm2 jlist 2>/dev/null | grep -q '"name":"brain-arena"'; then
    pm2 restart brain-arena --update-env
  else
    pm2 start npm --name brain-arena --time -- start
  fi
  pm2 save || true
  echo "Started via pm2"
}

start_via_systemd() {
  systemctl restart brain-arena.service
  echo "Started via systemd (brain-arena.service)"
}

start_via_nohup() {
  mkdir -p "$LOG_DIR"
  local logfile="$LOG_DIR/app-$(date +%Y%m%d-%H%M%S).log"
  ln -sf "$logfile" "$LOG_DIR/current.log"
  nohup env NODE_ENV=production npm start > "$logfile" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
  echo "Started via nohup; log: $logfile"
}

case "$PM_MODE" in
  pm2)      start_via_pm2 ;;
  systemd)  start_via_systemd ;;
  nohup)    start_via_nohup ;;
  auto)
    if command -v pm2 >/dev/null 2>&1; then
      start_via_pm2
    elif systemctl list-unit-files 2>/dev/null | grep -q '^brain-arena.service'; then
      start_via_systemd
    else
      start_via_nohup
    fi
    ;;
  *) fatal "unknown PM_MODE: $PM_MODE (use auto|nohup|pm2|systemd)" ;;
esac

log "12. wait up to 30 s for the app to bind :$APP_PORT and respond"
for i in $(seq 1 30); do
  if curl -s --max-time 2 "http://127.0.0.1:$APP_PORT/api/health" > /dev/null 2>&1; then
    echo "  responding after ${i}s"
    break
  fi
  sleep 1
done
if ! curl -s --max-time 2 "http://127.0.0.1:$APP_PORT/api/health" > /dev/null 2>&1; then
  fatal "app did not start responding within 30 s — inspect logs"
fi

log "13. smoke checks"
echo "/api/health:"
curl -s "http://127.0.0.1:$APP_PORT/api/health"; echo
echo "/api/leaderboard (expect JSON):"
LB=$(curl -s --max-time 5 "http://127.0.0.1:$APP_PORT/api/leaderboard")
echo "$LB" | head -c 200
echo "$LB" | grep -q '^{"ok"' || fatal "/api/leaderboard returned non-JSON; build is wrong"
echo
echo "/api/matches GET unauth (expect 401):"
curl -s -w "  HTTP %{http_code}\n" -o /dev/null "http://127.0.0.1:$APP_PORT/api/matches"

log "14. cookie check — must match deployment transport"
ORIGIN_PROTO=$(grep ^PUBLIC_ORIGIN .env | sed 's/^PUBLIC_ORIGIN=//' | sed 's/^"//;s/"$//' | awk -F:// '{print $1}')
TS=$(date +%s)
SC=$(curl -s -i --max-time 10 -X POST "http://127.0.0.1:$APP_PORT/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"deploy-${TS}@brain-arena.test\",\"password\":\"deploy-${TS}-pw\",\"username\":\"dpl${TS}\"}" \
  | grep -i "^set-cookie:" || true)
echo "$SC"
if [ -z "$SC" ]; then
  fatal "signup did not return Set-Cookie"
fi
if [ "$ORIGIN_PROTO" = "https" ]; then
  echo "$SC" | grep -qi "Secure" || fatal "PUBLIC_ORIGIN says https but cookie is missing Secure"
  echo "✓ HTTPS deployment: cookie has Secure (correct)"
else
  if echo "$SC" | grep -qi "Secure"; then
    fatal "PUBLIC_ORIGIN says http but cookie has Secure (browsers will drop it)"
  fi
  echo "✓ HTTP deployment: cookie does NOT have Secure (correct)"
fi

log "15. redirect check — /login authenticated"
JAR=$(mktemp)
curl -s -c "$JAR" -X POST "http://127.0.0.1:$APP_PORT/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"redir-${TS}@brain-arena.test\",\"password\":\"redir-${TS}-pw\",\"username\":\"rdr${TS}\"}" > /dev/null
WITH=$(curl -s -b "$JAR" "http://127.0.0.1:$APP_PORT/login" | grep -oE "Already signed in|Sign In" | head -1)
NO=$(curl -s             "http://127.0.0.1:$APP_PORT/login" | grep -oE "Already signed in|Sign In" | head -1)
echo "/login WITH cookie: $WITH"
echo "/login NO cookie:   $NO"
[ "$WITH" = "Already signed in" ] || fatal "/login does not redirect authenticated users"
[ "$NO" = "Sign In" ] || fatal "/login does not show form to anonymous users"
rm -f "$JAR"

log "✓ DEPLOY COMPLETE"
echo "  HEAD: $(git rev-parse HEAD)"
echo "  BUILD_ID: $(cat .next/BUILD_ID)"
echo "  Listener:"
ss -tlnp 2>/dev/null | grep ":$APP_PORT "
