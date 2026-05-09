#!/usr/bin/env bash
#
# Brain Arena — delete expired session rows from Postgres.
#
# Run on a schedule via systemd timer (scripts/brain-arena-clean.timer).
# Safe to run any time; idempotent. Touches only sessions whose
# expiresAt is already in the past — so an active player's cookie is
# never invalidated.
#
# Manual run:
#   bash scripts/clean-sessions.sh

set -euo pipefail

DELETED=$(sudo -u postgres psql -d brainarena -tA -c \
  "DELETE FROM sessions WHERE \"expiresAt\" < NOW() RETURNING token;" \
  2>&1 | grep -v "could not change directory" | grep -c . || true)

REMAINING=$(sudo -u postgres psql -d brainarena -tA -c \
  "SELECT count(*) FROM sessions;" 2>&1 | grep -v "could not change directory" | head -1)

echo "[$(date -Iseconds)] sessions cleanup: deleted=$DELETED remaining=$REMAINING"
