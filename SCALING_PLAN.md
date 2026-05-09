# Brain Arena — Scaling Plan

How Brain Arena gets from "1 VPS, 2 users" to "1 VPS, ~500 concurrent
users" and beyond. This is the architecture roadmap for capacity, not
the operational playbook (`DEPLOYMENT.md` for that).

---

## Where we are today

- 1 Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD)
- 1 Node.js process (`tsx server.js`, supervised by systemd)
- 1 Postgres 16 process (loopback :5432)
- 1 nginx process (TLS termination + reverse proxy)
- All state for matchmaking + chess match flow lives in **process
  memory** in the Node process

Traffic so far is two real users and an occasional smoke-test. We
have ample headroom on this hardware — the limit isn't capacity, it's
**single-process state.**

---

## The single-process bottleneck

Three distinct in-memory state types in `app/lib/matchmaking.ts`:

```ts
class MatchmakingQueue {
  private queue:                Map<gameId, MatchmakingPlayer[]>
  private activeMatches:        Map<matchId, Match>
  private activeChessMatches:   Map<matchId, ChessMatchState>
  private playerToMatch:        Map<socketId, matchId>
}
```

These maps have three failure modes:

1. **Process restart kills active games.** Today: `systemctl restart
   brain-arena.service` during a live chess match → both players
   disconnect, neither gets credited; the maps are gone forever.
2. **Can't horizontally scale.** A second Node process can't see the
   first process's queue. Two players queueing on different replicas
   never match.
3. **No durability.** A crash during `endChessMatch` mid-DB-write
   could leave a Match row with no MatchResult rows (orphan match).
   Today the in-memory state is still authoritative for "this match
   is in progress" so we recover, but only as long as the process
   survives.

For 1 VPS at beta scale: acceptable. **The fix lands at M3 when we
need a second VPS for redundancy or capacity, whichever comes first.**

---

## The plan

Three layers in order of when they bind.

### Layer 1 — Vertical scale on one VPS (works through M2)

Today's setup will hold up to ~200–300 concurrent matches without
breaking a sweat on the CX22. The bottlenecks at this scale are:

- **bcryptjs blocking the event loop** on signup/login. Native
  `bcrypt` swap (this turn) takes the per-call cost from ~250ms
  blocking to ~30ms, AND moves it to a worker thread inside the
  native binding. Big win for free.
- **Prisma per-query overhead.** At ~5ms baseline per query, the
  match-end path does ~6 queries (Match update + 2 MatchResult creates
  + 2 Profile queries + 2 Profile updates) → 30ms. Acceptable.
- **Single nginx worker.** Default config has `worker_processes auto`
  which will use both cores. Fine.

Improvements deliverable in M1/M2 without architectural change:

- ✅ Native bcrypt (this turn)
- ⏭ Prisma `$transaction` for the match-end path → fewer round-trips
- ⏭ A single `prisma.profile.findMany({ where: { userId: { in: [...] } } })`
  instead of two `findUnique` calls in `endChessMatch`
- ⏭ Connection pool tuning (`?connection_limit=10&pool_timeout=10`)
  in the DATABASE_URL

### Layer 2 — Redis-backed state (M3 — required to scale past one Node process)

When we need a second Node replica:

#### Move queue to Redis

```
KEYS:
  ba:queue:<gameId>         → Redis List of {userId, lp, joinedAt} JSON entries
  ba:queue-by-user:<userId> → Redis String of gameId for "where am I queued"

operations:
  enqueue:  LPUSH ba:queue:<gameId> + SET ba:queue-by-user:<userId>
  dequeue:  RPOP ba:queue:<gameId> + DEL the user index
  cancel:   read ba:queue-by-user:<userId>, LREM from ba:queue:<gameId>
```

The matchmaker becomes "any replica that pulls 2 players from the same
list pairs them" — distributed coordination via Redis atomic ops.

#### Move active match state to Redis

The chess match state (FEN, clocks, draw offers, move history) is
per-match data that any replica should be able to handle. Pattern:

```
KEYS:
  ba:match:<matchId>     → Redis Hash of state fields
  ba:match:<matchId>:moves → Redis List of moves (append-only audit)

publish/subscribe for live updates:
  channel ba:match:<matchId>:events → JSON payloads broadcast to all replicas
```

When a player connects to replica B but their match was created on
replica A, B reads the match state from Redis. When player A makes a
move on replica A, replica A writes to Redis AND publishes to channel
`ba:match:<matchId>:events`. Replica B is subscribed and pushes the
update to player B's socket.

This is the "Socket.IO + Redis Adapter" canonical pattern. Library:
`@socket.io/redis-adapter`. Plugged in like:

```ts
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

That much alone gives us multi-replica Socket.IO broadcast. The
matchmaking state still needs the explicit Redis schema above.

#### What we get

- 2nd Node replica (active/active behind the same nginx upstream
  block) — load distributes naturally
- A Node restart on one replica doesn't kill matches; the other
  replica keeps serving
- Players see consistent state regardless of which replica they
  connected to

#### What we still don't have

- No Redis persistence. If Redis itself dies, all live matches die.
  Production Redis needs RDB snapshots + a replica.
- No automatic failover. Manual nginx upstream config + a dead-replica
  detection layer is M4.

#### Estimated cost

- Redis instance: another ~€4/mo or shared on the same VPS for ~free
- Engineering: ~1 week to spec, ~1 week to ship + test
- Operationally: one more service to monitor

Hold for M3 unless beta cohort exceeds 50 active.

### Layer 3 — Horizontally scaled (post-M3, conditional on traction)

If beta hits ~500+ concurrent users sustained, the topology becomes:

```
Cloudflare DNS + WAF + edge cache
  ↓
nginx ingress (1 small VPS)
  ↓
[Node replica A] [Node replica B] [Node replica C]
  ↘                  ↓                  ↙
        Redis (queue + pub/sub)
            ↓
        Postgres (managed: Hetzner Cloud Database, Supabase, Neon)
```

Postgres becomes the bottleneck if we ever need write throughput
beyond what one box can do. At our query shape (~6 writes per
match_end, ~10 reads per /api/auth/me) the math is:

- 1 write @ 5ms = 200 writes/sec/core
- 10 reads @ 1ms = 10000 reads/sec/core

A 4-core managed Postgres → ~800 writes/sec, ~40000 reads/sec. That
covers ~80 match_ends/sec → ~5000 matches/min → ~300k matches/hour.
We'll never see that load in beta.

Past Layer 3 is genuinely "GA scale" territory and not worth speccing
in detail until we see the traffic curve. The current architecture
will handle the next 2–3 orders of magnitude with the changes above.

---

## Performance hot-path inventory

What we'd profile if we had a perf budget. Not all of these are
issues today; listing for completeness.

| Path | Today | Risk | Mitigation |
| --- | --- | --- | --- |
| `POST /api/auth/login` | bcryptjs ~250ms event-loop blocking | High at scale | **Native bcrypt this turn** |
| `POST /api/auth/signup` | bcryptjs + 1 user-existence query + Prisma transaction | Medium | Same fix as login |
| `POST /api/matches` | 1 read + 1 transaction (4 writes) | Low | Already `$transaction` |
| `endChessMatch` (Socket.IO event handler) | ~6 sequential Prisma queries | Medium at M3 | Bundle into `$transaction` |
| `/api/auth/me` (server component on every dynamic page) | 1 query | Low | Could memoize via `unstable_cache` |
| `/api/leaderboard` | 1 query, 50 rows | Low | Add a `revalidate=10` cache later |
| Socket.IO broadcast on every move | 2 emits per move | Low | Inherent — websocket is already cheap |
| Server boot | 1 Prisma client init + Next build | Low | Build is in `.next` ahead of time; init is ~1s |

---

## Observability

What we have today (this turn lands the metrics endpoint):

- `journalctl -u brain-arena.service` — app stdout
- `/var/log/brain-arena/systemd.log` — same, file
- `/var/log/nginx/access.log` and `error.log` — web layer
- `/api/health` — public liveness probe
- `/api/metrics` — admin-token-gated counters: total users, profiles
  by tier, total matches, matches in last 24h, active session count,
  queue depth per game, connected sockets
- `audit_events` table — anti-cheat + ban events

What's missing (M3):

- Prometheus/OpenMetrics endpoint format (today is JSON only — easy
  upgrade)
- Structured JSON logs (pino) instead of `console.log`
- Sentry / similar for runtime exception capture
- A scheduled job that exports a summary of `/api/metrics` to a
  long-term store (postgres `system_metrics_daily` or Grafana Cloud)

What's missing (M4 / GA):

- Per-route latency histograms
- Per-user error budget alerts
- A/B testing framework (probably not native to Brain Arena)

---

## Cost projection

| Phase | Infra | Roughly |
| --- | --- | --- |
| Closed beta (now) | 1 CX22 + Let's Encrypt | €4–7 / mo |
| Open beta (M2/M3) | Same + Redis (~€4/mo) | €8–12 / mo |
| Public beta scale-out | 2× CX22 + managed Postgres + Redis | €30–50 / mo |
| GA early | 4× scale + monitoring | €100–200 / mo |

We are nowhere near needing to talk about cost as a constraint.
Documented for when we are.

---

## Anti-goals

- **No Kubernetes.** The complexity is not worth it at any of the
  scales above. Plain VPSes + nginx + systemd suffice through
  thousands of concurrent users.
- **No Vercel.** Custom Socket.IO server can't run on Vercel's edge.
  We've already made this decision; documented in `DEPLOYMENT.md`.
- **No microservices.** One Node process owns auth + game logic +
  matchmaking. Splitting it adds operational cost without buying
  anything at our scale.
- **No CDN-cached HTML.** All pages are dynamic per-request because
  the layout reads cookies. We could add `revalidate` to
  unauthenticated routes (homepage, leaderboard) but the gain is
  small.

---

*Companion: `DEPLOYMENT.md` for operations, `PRODUCT_ROADMAP.md` for
when each layer ships.*
