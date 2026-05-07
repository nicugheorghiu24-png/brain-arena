# Brain Arena — self-hosted deployment

Brain Arena is now a fully self-hosted Postgres + Prisma + Next.js
stack. No third-party SaaS is required to run it end-to-end.

The data layer (`app/lib/db/`) gracefully degrades:

| `DATABASE_URL` | Backend | Auth backend |
|---|---|---|
| **set** | Prisma → Postgres (real persistence) | HTTP-only session cookies via `/api/auth/*` |
| **unset** | localStorage in the browser | Local fakeAuth (dev convenience only) |

The frontend behaves identically either way; the difference is whether
data survives a browser restart and whether real password hashes guard
the accounts.

---

## 1 · Local dev — fastest path

```powershell
copy .env.example .env.local
docker compose up -d db
$env:DATABASE_URL="postgresql://brainarena:brainarena@localhost:5432/brainarena"
npm install
npm run db:migrate:dev    # applies the Prisma migrations
npm run dev
```

Open http://localhost:3000 and you can register a real account; the
session is stored in `sessions` and the cookie `ba_session` is set
HTTP-only. Without `DATABASE_URL` everything still works against
localStorage — that's the no-DB dev path.

## 2 · Local dev with the full stack in Docker

```powershell
docker compose up --build           # boots Postgres + app
docker compose exec app npm run db:migrate:deploy   # apply schema
```

Brain Arena is then available at http://localhost:3000. The Postgres
data lives in a named volume (`brain-arena-db`), so `down -v` is the
only way to nuke it.

## 3 · Self-hosted production deployment

### Recommended target

A small VPS works fine for a beta:

| Component | Sizing |
|---|---|
| App | 1 vCPU, 1–2 GB RAM (Node + Next runtime) |
| Postgres | 1 vCPU, 2 GB RAM, 20 GB SSD |
| OS | Ubuntu 24.04 LTS or Debian 12 |
| TLS | Caddy or nginx + Let's Encrypt |

For higher concurrency: scale the app container horizontally behind a
load balancer; Postgres stays single-instance until traffic justifies
read replicas / connection pooling (PgBouncer).

### Step-by-step

1. **Provision a server**, install Docker + Docker Compose plugin.
2. **Clone the repo** and create `.env` from `.env.example`.
3. **Set a real `DATABASE_URL`** pointing at your Postgres host. If you
   run Postgres in the same Docker network, the compose value works as-is;
   if you use a managed/external Postgres, point at it and remove the
   `db` service from `docker-compose.yml`.
4. **Generate strong DB credentials**. Never ship the
   `brainarena/brainarena` placeholder to production.
5. **Apply migrations once on the server**:

   ```bash
   docker compose run --rm app npm run db:migrate
   ```

6. **Start the stack**:

   ```bash
   docker compose up -d --build
   ```

7. **Front it with TLS** (Caddy example):

   ```caddy
   brain-arena.example.com {
     reverse_proxy localhost:3000
   }
   ```

8. **Set up backups**: `pg_dump` on a cron + offsite storage. Even a
   tiny daily snapshot is enough for a beta.

### Environment variables

See `.env.example`. The minimum required for production:

```env
DATABASE_URL=postgresql://USER:STRONG_PASSWORD@DB_HOST:5432/brainarena?sslmode=require
NODE_ENV=production
```

### Updating the app

```bash
git pull
docker compose build app
docker compose up -d app
docker compose run --rm app npm run db:migrate
```

The Prisma `migrate deploy` step is idempotent and safe to run on every
deploy — it applies any new migrations and exits if the DB is up to
date.

---

## 4 · Database migrations

| Workflow | Command |
|---|---|
| Dev — create a new migration after editing `prisma/schema.prisma` | `npm run db:migrate:dev -- --name describe_change` |
| Dev — sync schema without recording a migration | `npm run db:push` |
| Production — apply pending migrations | `npm run db:migrate` |
| Inspect data | `npm run db:studio` (Prisma Studio at http://localhost:5555) |

The first migration creates: `users`, `sessions`, `profiles`, `matches`,
`match_results`, `season_leaderboard_entries`, `achievements`,
`user_achievements`, `seen_questions`, `wallets`, `transactions`. Every
table has an explicit `@@map` so the SQL names are stable even if the
Prisma model is renamed.

---

## 5 · Architecture summary

```
┌───────────────────────────────────────────────────────────────┐
│  Frontend (Next.js client components)                         │
│       ↓                                                       │
│  app/lib/auth (validates → /api/auth/* OR fakeAuth fallback)  │
│       ↓                                                       │
│  /api/auth/{signup,login,logout,me}  ─────┐                   │
│       ↓                                   │                   │
│  app/lib/auth/server                      │                   │
│  (bcrypt, sessions, cookies)              │                   │
│       ↓                                   │                   │
│  app/lib/services/* (Prisma queries)      │                   │
│       ↓                                   │                   │
│  Prisma client → Postgres                 │                   │
│                                           ↓                   │
│  app/lib/db (router) ──┬─→ prismaDb (uses services)           │
│                        └─→ localDb (browser storage fallback) │
└───────────────────────────────────────────────────────────────┘
```

Deterministic match generation (`app/games/match/`) is unchanged: the
match seed is captured in `Match.matchSeed` so any past match is fully
replayable. RNG and question generators live in
`app/games/questions/` — the only thing that changed is *where* the
60-day no-repeat history is stored (localStorage today, `seen_questions`
table when Postgres is on).

---

## 6 · Future Netopia integration

`Wallet` and `Transaction` models exist in `prisma/schema.prisma` as
**placeholders**. No application code references them yet. Wiring up
real payments requires:

1. A signed Netopia merchant agreement.
2. A legal review confirming Brain Arena's competitive ranking system
   does not constitute gambling under Romanian law (skill-based
   exemption).
3. Implementation of `/api/payments/*` route handlers and a Netopia
   webhook receiver.
4. Strong reconciliation: every `transactions` row should be uniquely
   tied to a Netopia `externalRef` and reconciled daily.

**Until that work is complete, do not enable any payment UI.**

---

## 7 · Next steps before beta

- [ ] Add `proxy.ts` (Next 16 middleware replacement) to refresh near-expiry
      sessions on every request.
- [ ] Server-side score plausibility checks before persisting a match
      (anti-cheat).
- [ ] Rate limiting on `/api/auth/*` (a Postgres-backed token-bucket
      is enough for a beta).
- [ ] Email verification flow (the schema and the `User.email` field
      are ready; needs an SMTP provider + `email_verifications` table).
- [ ] Password reset flow.
- [ ] Move achievements unlocking from `FAKE_ACHIEVEMENTS` to real
      `user_achievements` writes inside `applyMatchOutcome`.
- [ ] Real PvP matchmaking (replace the simulated 5.2s queue in
      `MatchmakingShell` with a Postgres queue + WebSocket pairing).
- [ ] Daily backup automation (`pg_dump` + offsite copy).
- [ ] `prisma migrate diff` checks in CI to catch unintended schema drift.
