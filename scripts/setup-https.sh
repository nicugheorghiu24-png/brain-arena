#!/usr/bin/env bash
#
# Brain Arena — first-time HTTPS setup on the VPS.
#
# Run ONCE on the production VPS as root, after DNS is pointed at the
# server's IP. Idempotent — safe to re-run if it fails partway.
#
# What this does:
#   1. Installs nginx + certbot if they aren't present (apt).
#   2. Drops the brain-arena nginx site config into /etc/nginx.
#   3. Obtains a Let's Encrypt cert for playbrainarena.com (and www).
#   4. Reloads nginx so :443 starts serving real TLS.
#   5. Installs the brain-arena.service systemd unit if not already.
#   6. Updates .env: PUBLIC_ORIGIN=https://playbrainarena.com,...
#   7. Restarts the app so the cookie Secure flag flips on.
#
# After this script, scripts/deploy.sh works as the day-to-day deploy
# command and does not need to know about HTTPS — the certbot timer
# auto-renews, nginx is the front door, the Node app stays on :3000.

set -euo pipefail

DOMAIN="playbrainarena.com"
WWW_DOMAIN="www.playbrainarena.com"
EMAIL="${LE_EMAIL:-}"      # set LE_EMAIL=you@example.com or pass interactively
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$EUID" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/setup-https.sh" >&2
  exit 1
fi

log() { printf '\n── %s ──\n' "$*"; }
fatal() { echo "FATAL: $*" >&2; exit 1; }

log "1. confirm DNS resolves to this host"
SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org || true)
RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1)
echo "  Server public IP: ${SERVER_IP:-unknown}"
echo "  $DOMAIN resolves to: ${RESOLVED:-unresolved}"
if [ -n "$SERVER_IP" ] && [ -n "$RESOLVED" ] && [ "$SERVER_IP" != "$RESOLVED" ]; then
  echo "  WARNING: DNS does not yet point here. certbot will fail."
  echo "  If DNS just changed, wait for propagation then re-run this script."
  read -r -p "  Continue anyway? [y/N] " yn
  [ "$yn" = "y" ] || exit 1
fi

log "2. install nginx + certbot if needed"
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx

log "3. install brain-arena nginx site + security headers"
mkdir -p /var/www/certbot
cp "$PROJECT_ROOT/scripts/nginx-brain-arena.conf" /etc/nginx/sites-available/brain-arena
ln -sf /etc/nginx/sites-available/brain-arena /etc/nginx/sites-enabled/brain-arena
# Server-wide security headers (HSTS, X-Frame-Options, etc.) loaded
# at the http level via conf.d.
cp "$PROJECT_ROOT/scripts/nginx-brain-arena-headers.conf" /etc/nginx/conf.d/brain-arena-headers.conf
# Don't leave the default landing page enabled
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "4. obtain Let's Encrypt cert (interactive if EMAIL not set)"
CERTBOT_ARGS=(--nginx -d "$DOMAIN" -d "$WWW_DOMAIN" --redirect --non-interactive --agree-tos)
if [ -n "$EMAIL" ]; then
  CERTBOT_ARGS+=(--email "$EMAIL")
else
  echo "  No LE_EMAIL set — falling back to interactive certbot."
  CERTBOT_ARGS=(--nginx -d "$DOMAIN" -d "$WWW_DOMAIN" --redirect)
fi
certbot "${CERTBOT_ARGS[@]}"

log "5. install / refresh systemd unit"
cp "$PROJECT_ROOT/scripts/brain-arena.service" /etc/systemd/system/brain-arena.service
mkdir -p /var/log/brain-arena
systemctl daemon-reload
systemctl enable brain-arena.service

log "6. update .env: PUBLIC_ORIGIN to HTTPS (back up first)"
ENV_FILE="$PROJECT_ROOT/.env"
[ -f "$ENV_FILE" ] || fatal ".env missing at $ENV_FILE"
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
NEW_ORIGIN="https://$DOMAIN,https://$WWW_DOMAIN"
if grep -q '^PUBLIC_ORIGIN=' "$ENV_FILE"; then
  sed -i "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=$NEW_ORIGIN|" "$ENV_FILE"
else
  echo "PUBLIC_ORIGIN=$NEW_ORIGIN" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
echo "  $(grep ^PUBLIC_ORIGIN "$ENV_FILE")"

log "7. start the app via systemd (auto-restart, survives ssh disconnect)"
# Stop any nohup'd instance from previous deploys before systemd takes over.
pkill -f 'tsx.*server\.js' 2>/dev/null || true
pkill -f 'next-server'    2>/dev/null || true
sleep 2
systemctl restart brain-arena.service
sleep 5
systemctl --no-pager status brain-arena.service | head -15

log "8. smoke checks"
echo "  /api/health (loopback HTTP, should be 200):"
curl -s "http://127.0.0.1:3000/api/health"; echo
echo "  https://$DOMAIN/api/health (real public TLS, should be 200):"
curl -s "https://$DOMAIN/api/health"; echo
echo "  http://$DOMAIN (should be 301 → https):"
curl -s -o /dev/null -w "  HTTP %{http_code}  Location: %{redirect_url}\n" "http://$DOMAIN"

echo
echo "✓ HTTPS SETUP COMPLETE"
echo "  Site: https://$DOMAIN"
echo "  systemd: systemctl status brain-arena.service"
echo "  logs:    journalctl -u brain-arena.service -f"
echo "  next deploys: bash scripts/deploy.sh"
