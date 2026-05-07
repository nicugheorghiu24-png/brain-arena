# Brain Arena — Architecture

A snapshot of how the system fits together as of the May 10 production push.
This is the source of truth for "what runs where". For the operating
limits / non-goals, see `KNOWN_LIMITATIONS.md`. For the fairness model,
see `FAIRNESS.md`.

## Topology

Single Node.js process behind one HTTP port (default `3000`):

```
┌──────────────────────────────────────────────────┐
│ tsx server.js                                    │
│   ├─ Next.js 16 (App Router, RSC)                │
│   │     pages, API routes, middleware            │
│   └─ Socket.IO (same HTTP server)                │
│         matchmaking + live chess + spectators    │
└──────────────────────────────────────────────────┘
                     │
                     ▼
              Postgres (Prisma)
```

- The custom `server.js` boots Next via the programmatic API and attaches
  Socket.IO to the same HTTP server. There is no separate websocket
  service.
- `tsx` transpiles TypeScript on demand, both for the bootstrap and for
  the in-memory chess engine in `app/lib/matchmaking.ts`.
- All persistent state lives in Postgres via Prisma. The Docker stack
  ships the database alongside the app.

## Source layout

```
app/
  api/auth/             real session-cookie auth (login / signup / me / logout)
  arena/                Logic 1v1 game (quiz)
  chess/                chess UI + ChessBoard component
  components/           shared UI primitives (Buttons, Toast, Avatar, …)
  dashboard/            player dashboard
  games/                game registry, matchmaking shell, shared HUD
  games/questions/      deterministic question engine + 60-day no-repeat filter
  leaderboard/          live leaderboard view
  lib/auth/             server-side auth helpers (bcrypt, sessions)
  lib/matchmaking.ts    Socket.IO server: queue, chess engine, clocks, audit
  lib/services/         rankings (LP/MMR), leaderboard, anti-cheat, achievements
  matchmaking/          client-side matchmaking page
  memory/, math/,
  reaction/             additional games

prisma/schema.prisma    User, Profile, Session, Match, MatchResult, …
server.js               custom Next + Socket.IO bootstrap
Dockerfile              multi-stage prod image (deps → build → runner)
docker-compose.yml      app + Postgres for self-hosted dev / prod
```

## Game registry & routing

Every game registers itself in `app/games/registry.ts`. `GameTile` reads
from this registry to render the Game Hub. The Play button always points
at `/matchmaking?game=<id>`, and that page redirects the player to the
game's `routePath` once a match is found.

Adding a new game = (1) add a registry entry, (2) build a page at
`routePath`, (3) optionally add a server-side branch in
`MatchmakingQueue.tryMatch` if the game needs server-authoritative state.

## Matchmaking lifecycle

```
client                       server (MatchmakingQueue)
─────────────                ───────────────────────────────────
join_queue ────────────────▶ queue add (rejects duplicates)
                             tryMatch picks 2 oldest entries
match_found ◀───────────────  emit to both players
                             chess: createChessMatchState + startTurn
                             other games: setPlayerReady handshake (legacy)

(chess) join_match ────────▶ rebind socketId, send match_state
make_move ─────────────────▶ validate (chess.js), charge clock,
                              apply increment, broadcast
                              schedule timeoutTimer for next color

resign / offer_draw / ─────▶ endChessMatch → broadcast match_end →
  request_rematch              schedule reap (60 s)

disconnect ────────────────▶ chess: schedule 30 s grace forfeit timer
                             non-chess: drop match immediately
join_match (reconnect) ────▶ cancel grace timer, rebind socketId
```

State stores (in-memory, single process):

- `queue`: `gameId → MatchmakingPlayer[]`, FIFO.
- `activeMatches`: `matchId → Match`.
- `activeChessMatches`: `matchId → ChessMatchState` (engine, clocks,
  draw offers, spectators, audit data).
- `playerToMatch`: `socketId → matchId`.

Ended matches are reaped from memory after 60 seconds so reconnecting
clients can still see the final position, but we don't accumulate
forever.

## Server-authoritative chess

`app/lib/matchmaking.ts` owns the full chess engine via
[`chess.js`](https://www.npmjs.com/package/chess.js). The client only
ever sends `{ from, to, promotion? }`. The server:

1. Verifies the sender owns the current turn.
2. Validates the move via `chess.move({ … })`. Promotion is allow-listed
   to `q | r | b | n` before reaching chess.js.
3. Charges the mover their elapsed think-time, applies the +5 s
   increment, hands the clock to the opponent, and reschedules the
   timeout timer.
4. Broadcasts a `match_state` payload with `{ fen, turn, moveHistory,
   clocks, serverNow, … }`. The same builder is used for live broadcasts
   and reconnect snapshots, so payload shape never drifts.
5. Detects checkmate / stalemate / draws via chess.js and ends the
   match accordingly.
6. Records per-move think times for the timing audit (see
   `auditChessMatch`).

Time control is hard-coded at **5+5** today (`CHESS_INITIAL_MS` and
`CHESS_INCREMENT_MS` in `matchmaking.ts`). A future "select time
control" UI would plumb a per-match `timeControl` through `tryMatch`.

## Auth

- Real auth path: `/api/auth/{signup,login,me,logout}` write/read
  Postgres-backed sessions and use an HttpOnly `ba_session` cookie.
- `app/lib/fakeAuth.ts` is a client-side fallback that mirrors the real
  user when the API is reachable, and stands in when no `DATABASE_URL`
  is set so dev still works without Postgres.
- The Socket.IO connection authenticates by the `userId` the client
  asserts. Hardening this to a verified session token is on the
  pre-launch list (see `KNOWN_LIMITATIONS.md`).

## Persistence

| Table | Used for |
|---|---|
| `users` | account credentials |
| `sessions` | server-side session tokens |
| `profiles` | username, tier, division, LP, level, XP, win/loss |
| `matches` | one row per match: gameId, seed, difficulty, durationMs |
| `match_results` | one row per participant: result, score, lpDelta, xpGained |
| `seen_questions` | per-user 60-day anti-repeat for question games |
| `achievements`, `user_achievements` | locked / unlocked badges |
| `season_leaderboard_entries` | snapshot table for season closes |
| `wallets`, `transactions` | **schema only** — wallet/payment **NOT** implemented |

`Wallet` and `Transaction` exist purely as schema placeholders. **No
application code reads or writes them.** Brain Arena is and will remain
100% skill-based — no payments, no chance-based outcomes, no random
rewards. See `FAIRNESS.md`.

## Build / deploy

- Local dev: `npm run dev` (alias for `tsx server.js`).
- Production image: `docker compose up --build -d`. The runner stage
  ships `.next/`, `app/`, `prisma/`, `node_modules/`, `server.js`, and
  the configs needed by `tsx` and Next at runtime.
- Migrations: `npm run db:migrate` (Prisma).

## Observability today

- Connection / disconnect logs in stdout.
- `console.warn` on chess timing audit flags, tagged `[anti-cheat]`.
- Match metadata persisted to Postgres (queryable for replays).

There is no metrics endpoint and no structured log shipping yet.
