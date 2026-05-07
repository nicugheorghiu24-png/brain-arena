# Brain Arena — Production Deployment Guide

End-to-end recipe for taking Brain Arena from `git clone` to a live
private beta on a single VPS, fronted by Cloudflare for HTTPS and DDoS.
Every step has been verified against the current code.

For the broader system overview see `ARCHITECTURE.md`.
For go-live tracking, see `BETA_LAUNCH_CHECKLIST.md`.

---

## 0 · Architecture decision: why a single VPS, not Vercel

Brain Arena's matchmaking and chess engine run **inside the same Node
process** as Next.js, attached to the same HTTP server via Socket.IO.
Vercel's edge / serverless model can't host long-lived websockets
([reference](https://vercel.com/guides/do-vercel-serverless-functions-support-websocket-connections)),
so **the app cannot be split across Vercel + a separate WS service
without a non-trivial rewrite**.

The supported deployment shape for the May 10 beta is therefore:

```
                   ┌──────────────────┐
   Players ─HTTPS─▶│   Cloudflare     │── proxy ──▶  VPS:443/80
                   │ (DNS + TLS edge) │              │
                   └──────────────────┘              ▼
                                              Docker stack
                                              ┌──────────────┐
                                              │ brain-arena  │ :3000
                                              │   (app)      │
                                              └──────┬───────┘
                                                     │
                                              ┌──────▼───────┐
                                              │  postgres 16 │ :5432
                                              └──────────────┘
```

Cloudflare proxies HTTP/HTTPS *and* websockets transparently — no
extra config required other than enabling websockets in the Cloudflare
dashboard (it is on by default for free plans).

---

## 1 · What you need to buy / configure

| Item | Recommendation | Approx. cost |
|---|---|---|
| **VPS** | Hetzner Cloud `CX22` (2 vCPU, 4 GB RAM, 40 GB SSD), Ubuntu 24.04. Any modern x86 VPS with ≥ 2 GB RAM works. | ~€4–7 / mo |
| **Domain** | A `.com` or `.gg` from any registrar (Cloudflare Registrar is fine). | €10–25 / yr |
| **Cloudflare account** | Free tier covers HTTPS, DDoS, WS proxy, DNS. | Free |
| **Postgres** | Bundled in `docker-compose.yml` (good for beta). For production scale use a managed Postgres (DigitalOcean / Neon / Supabase / RDS). | Free → €15 / mo |

You do **not** need Vercel, Kubernetes, a load balancer, or a managed
Redis for the private beta.

---

## 2 · One-time VPS prep

```bash
ssh root@YOUR_VPS_IP
adduser brainarena && usermod -aG sudo brainarena
ssh-copy-id brainarena@YOUR_VPS_IP   # from your laptop
ssh brainarena@YOUR_VPS_IP

# Install Docker + Compose plugin (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Sanity check
docker run --rm hello-world
docker compose version

# Firewall: only let Cloudflare (and you) talk to the VPS.
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

> **Tip:** if you want to lock the VPS to Cloudflare-only for the web
> ports, replace the 80/443 rules with the
> [Cloudflare IP list](https://www.cloudflare.com/ips/). For a private
> beta, accepting all is fine.

---

## 3 · Pull the code

```bash
sudo apt-get install -y git
git clone https://github.com/YOUR_ORG/brain-arena.git
cd brain-arena
```

(Or copy a tarball / use rsync — anything that lands the repo on the
VPS.)

---

## 4 · Configure the production environment

Create `/home/brainarena/brain-arena/.env` next to `docker-compose.yml`:

```bash
cat > .env <<'EOF'
NODE_ENV=production

# Postgres — the docker-compose db service handles this for you in beta.
# For managed Postgres later, change this to your provider's URL and
# add `?sslmode=require`.
DATABASE_URL=postgresql://brainarena:brainarena@db:5432/brainarena

# REQUIRED: the public URL Cloudflare will hand out. Comma-separated
# if you want apex + www both accepted.
PUBLIC_ORIGIN=https://brainarena.example,https://www.brainarena.example

PORT=3000
APP_PORT=3000   # host port; map to 80 if you want to skip Cloudflare
EOF
chmod 600 .env
```

Validate before bringing the stack up:

```bash
# Print the resolved env Docker will use (without booting):
docker compose config | grep -E 'NODE_ENV|DATABASE_URL|PUBLIC_ORIGIN|PORT'
```

The full env-var reference is in `.env.example`. The `app/lib/env.ts`
module fails the boot in production if any of these are missing or
malformed.

---

## 5 · Boot the stack

```bash
docker compose up --build -d
docker compose exec app npm run db:migrate
docker compose logs -f app
```

You should see:

```
[env] node_env=production port=3000 db=configured origin=https://brainarena.example
> Ready on http://0.0.0.0:3000 (env=production)
```

Sanity-test from the VPS itself:

```bash
curl http://127.0.0.1:3000/api/health
#  → {"status":"ok","uptimeSec":3,"ts":"..."}

curl http://127.0.0.1:3000/api/healthz
#  → {"status":"ok","db":"reachable"}
```

---

## 6 · Wire up DNS + HTTPS via Cloudflare

1. **Add the domain** to Cloudflare → choose Free plan → update the
   nameservers at your registrar.
2. **DNS records** (Cloudflare dashboard → DNS):
   - `A    @     YOUR_VPS_IP    Proxied (orange cloud)`
   - `A    www   YOUR_VPS_IP    Proxied (orange cloud)`
3. **SSL/TLS mode**: set to **Full** (preferred) or **Flexible** if you
   don't want to install a cert on the VPS for the beta. Full requires
   a cert on the origin — easiest is to put nginx + Let's Encrypt in
   front of `docker-compose`. For a private beta, **Flexible** with the
   Cloudflare proxy turned on is acceptable.
4. **Always Use HTTPS** → On (SSL/TLS → Edge Certificates).
5. **Network → WebSockets** → already On for free plans, just confirm.
6. **Page Rules** (optional): exclude `/api/health` and `/api/healthz`
   from caching:
   `*example.com/api/health*  →  Cache Level: Bypass`

After ~1 minute, `https://brainarena.example` should serve the app.

---

## 7 · Smoke test

From your laptop:

```bash
# Liveness
curl -fsS https://brainarena.example/api/health
# Readiness
curl -fsS https://brainarena.example/api/healthz
# Game hub
curl -sS https://brainarena.example/games | grep -c "Chess Arena"   # → 1
```

Browser:

1. Open `https://brainarena.example` and register an account.
2. Confirm the dashboard loads, no console errors.
3. Open `/games` → click Chess Arena → confirm matchmaking page loads.
4. From a second device or browser, repeat. Both should match each
   other and land on `/chess?matchId=…`.

---

## 8 · Operations

### Deploys

```bash
ssh brainarena@VPS
cd brain-arena
git pull
docker compose up --build -d
docker compose exec app npm run db:migrate
```

The `restart: unless-stopped` policy in `docker-compose.yml` keeps the
app alive across reboots.

### Logs

The app logs single-line JSON in production. Pipe to anything:

```bash
docker compose logs --tail=200 -f app
docker compose logs app | jq 'select(.level=="error")'
```

### Backup

```bash
docker compose exec -T db pg_dump -U brainarena brainarena | \
  gzip > "brainarena-$(date +%F).sql.gz"
```

Add a daily cron entry:

```bash
echo '0 3 * * * cd /home/brainarena/brain-arena && \
  docker compose exec -T db pg_dump -U brainarena brainarena | \
  gzip > /home/brainarena/backups/brainarena-$(date +\%F).sql.gz' \
  | crontab -
mkdir -p /home/brainarena/backups
```

### Rollback

```bash
git log --oneline | head    # find the previous good commit
git checkout <sha>
docker compose up --build -d
```

### Stop everything

```bash
docker compose down           # keeps volumes (DB data)
docker compose down -v        # nukes the database, too
```

---

## 9 · Going beyond beta (out of scope for May 10)

- Move to managed Postgres + remove the `db` service from compose.
- Put Caddy or nginx + Let's Encrypt on the VPS so the origin runs
  HTTPS too (then Cloudflare SSL/TLS mode = Full (strict)).
- Move log shipping to a real aggregator (Loki, Datadog, etc.).
- Add Redis-backed match state so the app container is restartable
  without dropping live games.
- Multi-VPS + Cloudflare Tunnel.
