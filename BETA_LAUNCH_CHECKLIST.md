# Brain Arena — May 10 Beta Launch Checklist

Tick these in order. Anything starred (★) is a hard gate — do not let
players in until it's green.

For step-by-step deployment commands see `DEPLOYMENT.md`.

---

## T-7 days · Infrastructure

- [ ] ★ Domain purchased (registrar of choice).
- [ ] ★ Cloudflare account created, domain added, nameservers
      delegated to Cloudflare.
- [ ] ★ VPS provisioned (≥ 2 GB RAM, ≥ 2 vCPU). Hetzner CX22 / DO 4 GB
      droplet / equivalent.
- [ ] ★ Non-root user `brainarena` set up with SSH key auth, password
      auth disabled (`/etc/ssh/sshd_config: PasswordAuthentication no`).
- [ ] ★ UFW enabled, only 22 / 80 / 443 open.
- [ ] Docker + Compose plugin installed and working
      (`docker run hello-world`).
- [ ] DNS records pointed at the VPS, Cloudflare proxy enabled (orange
      cloud).
- [ ] Cloudflare WebSockets enabled (Network tab — on by default but
      confirm it).

## T-3 days · Application

- [ ] ★ Latest code pulled to the VPS.
- [ ] ★ `.env` created on the VPS (mode 600) with:
  - [ ] `NODE_ENV=production`
  - [ ] `DATABASE_URL=` (Compose default OR managed Postgres URL)
  - [ ] `PUBLIC_ORIGIN=https://your-domain` (apex + www, comma-sep)
  - [ ] `PORT=3000`
- [ ] ★ `docker compose config` shows correct values, no warnings.
- [ ] ★ `docker compose up --build -d` boots without errors.
- [ ] ★ `docker compose exec app npm run db:migrate` applies
      cleanly.
- [ ] ★ `curl http://127.0.0.1:3000/api/health` → 200, `status: ok`.
- [ ] ★ `curl http://127.0.0.1:3000/api/healthz` → 200,
      `db: reachable`.
- [ ] ★ `curl -fsS https://your-domain/api/health` from a laptop →
      200 (Cloudflare proxy is healthy).
- [ ] Container HEALTHCHECK shows `healthy` in `docker ps`.
- [ ] Backup cron job installed and tested
      (`pg_dump | gzip > … .sql.gz`).
- [ ] Boot logs reviewed:
  - [ ] No `[env:error]` lines.
  - [ ] `Ready on http://…` line present.
  - [ ] `[anti-cheat]` lines visible (will only appear after a chess
        match completes).

## T-1 day · Functional QA (two-browser)

Use `BETA_TESTING.md` scenarios:

- [ ] ★ S1 Game Hub renders all 5 tiles.
- [ ] ★ S2 Two browsers can match each other in chess.
- [ ] ★ S3 Pawn promotion works (white and black).
- [ ] ★ S4 Clock under 30 s turns amber, under 10 s turns red,
      timeout fires correctly.
- [ ] ★ S5 Disconnect grace banner appears + reconnect works
      within 30 s.
- [ ] ★ S6 Resign / draw / rematch all settle correctly.
- [ ] S7 Spectator mode works (`?spectate=1`).
- [ ] S8 Duplicate queue rejected with toast.
- [ ] S8 Refresh mid-game restores state.
- [ ] S9 Quiz / memory / math / reaction all open.
- [ ] S10 Login / logout cycle.
- [ ] Match history populates on dashboard after a played game.
- [ ] Leaderboard updates after a played game.

## Launch day · Players in

- [ ] Beta tester list compiled (≤ 50 emails for first wave is fine).
- [ ] `BETA_TESTING.md` link prepared for the welcome email.
- [ ] Engineering on call for first 2 hours.
- [ ] `docker compose logs -f app` running on a side terminal during
      go-live; watching for `[env:error]`, `level: error`, or repeated
      `[anti-cheat]` flags.
- [ ] Cloudflare Analytics tab open to watch traffic.
- [ ] Smoke test from a clean phone (cellular, not wifi) to catch
      anything CDN / TLS that the VPS-local check missed.

## After launch

- [ ] Daily backup verified.
- [ ] Skim logs each morning for `level: error` lines.
- [ ] Triage `[anti-cheat]` flags — they're advisory only, no auto
      action.
- [ ] Track tester feedback against `KNOWN_LIMITATIONS.md` so we
      don't re-investigate documented gaps.

## Hard NOs for the beta

- [ ] No payments / wallets / gambling — schema placeholders only,
      no UI, no API. See `FAIRNESS.md`.
- [ ] No broadcast emails to players outside the beta list.
- [ ] No shared admin credentials. Each engineer with VPS access has
      their own SSH key.

---

## Risks to know about before May 10

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Single-process state — restart drops live games | Medium | Match interrupted | Reconnect grace covers wifi blips, not full restarts. Beta size is small enough that this is acceptable. |
| Socket.IO trusts client `userId` | Medium | Identity spoofing inside chess room | Bind to verified session in next push. Beta scope is private, so risk is low. |
| Engine-assisted chess (Stockfish) | Medium | Unfair wins | Detection not implemented. Audit logs (`[anti-cheat]`) will help spot outliers manually. |
| `fakeAuth` / real-auth divergence after refresh | Low | Brief UI flicker | Reconciles on next render. |
| `middleware.ts` Next 16 deprecation warning | Low | None — cosmetic | Rename to `proxy.ts` post-launch. |
| No automated tests | Medium | Regressions sneak in | Manual `BETA_TESTING.md` run before each deploy. |
| Single VPS — no failover | Low | Outage during beta | Acceptable for private beta. Document `docker compose up` recovery in DEPLOYMENT.md. |
