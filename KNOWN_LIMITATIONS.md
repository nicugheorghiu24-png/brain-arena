# Brain Arena — Known Limitations

Honest list of what Brain Arena is *not* yet on the May 10 push. These
are tracked here so we don't ship marketing claims that overpromise.

## Multiplayer / scaling

- **Single-process state.** The matchmaking queue and live chess matches
  live in memory in one Node.js process. A restart drops every active
  match. Horizontal scaling needs a Redis (or Postgres-backed) state
  store — not in scope for this push.
- **No region affinity.** Matchmaking is FIFO across the global queue.
  Players from EU and SA will be paired without checking latency.
- **No MMR-aware matchmaking.** The first two compatible players in the
  queue get paired regardless of LP. A high Bronze can be matched
  against a Diamond in the first slot.
- **Reconnect grace is fixed at 30 s.** Real chess sites tune this per
  time control; we don't.

## Chess

- **One time control.** 5+5 is hard-coded. There is no UI to pick
  bullet/blitz/rapid/classical.
- **No clock pause on disconnect.** Disconnected players' clocks keep
  ticking during the 30 s grace, and a timeout can fire before the
  grace timer.
- **No premove.** A player can't queue a move while the opponent is
  thinking.
- **No move sound, no animations.** The board updates instantly; pieces
  jump rather than slide.
- **No three-fold repetition / 50-move rule UI.** The engine recognises
  these as draws and the match ends, but there is no "claim draw"
  affordance for the player.
- **Achievements are referenced but not seeded.** `chess_checkmate` and
  `chess_participant` are unlocked via `unlockIfExists`, which silently
  no-ops if the row is missing from the `achievements` table. Run a
  seed before launch if these badges should appear.
- **Chess audit is log-only.** `auditChessMatch` flags timing
  anomalies but no auto-action is taken; flags are not yet persisted to
  a queryable table.

## Auth / sessions

- **`fakeAuth` shadows real auth on the client.** `Navbar` reads from
  `fakeAuth` for the username display; on mount it now resyncs from
  `/api/auth/me` so a stale localStorage state recovers within one
  paint. The dual store is still a sharp edge — long-term we want a
  single source of truth.
- **No password reset flow.** Lost passwords currently require a manual
  database edit.
- **No email verification.** Signup grants an active account
  immediately.

## Solo games (Logic Quiz, Memory, Reaction, Math Sprint)

- **Opponent is a deterministic AI.** All four are framed as duels but
  pit the player against a server-deterministic bot. Copy on the games
  hub now says "vs AI" so this isn't a surprise.
- **Server-authoritative scoring.** Match outcomes flow through
  `POST /api/matches`, which validates the body, recomputes
  `lpDelta`/`xpGained` from `computeReward(...)`, and persists via
  Prisma. The client cannot self-award LP.
- **Sanity bounds, not replay.** Validation caps `scoreSelf`/`scoreOpponent`
  at 200, `rounds` at 200, `durationMs` between 500 ms and 15 min. We
  do **not** replay the player's input stream against the seed yet —
  someone who tampers with their client and submits a plausible-looking
  outcome can still gain LP. A match-replay validator is queued
  post-launch.
- **localStorage fallback for anonymous play.** If the user hasn't
  signed up, the match is stored in `localStorage` only. Server
  endpoints return 401 in that case and `recordSoloMatchOutcome`
  falls back transparently.

## Anti-cheat

- **Question-game heuristics are basic.** The thresholds in
  `app/lib/services/antiCheat.ts` (>100 score, <100 ms per answer,
  identical answer timings, ≥8 of 10 wins) are starting points, not a
  tuned policy.
- **Chess engine-correlation detection is not implemented.** A user
  playing Stockfish-perfect moves will not be flagged today.
- **Audit logs are stdout-only.** They survive only as long as the
  container does.

## Payments / wallets / gambling

- **Not implemented and will not be implemented in this push.** The
  `wallets` and `transactions` tables exist as schema placeholders
  only; no application code reads or writes them. See `FAIRNESS.md`.

## Question engine

- **Fixed pool is small.** `app/games/questions/fixed.ts` ships a
  starter pool. Procedural generators fill the rest, but variety is
  modest at high difficulty.
- **`SeenQuestion` is per-user, not per-region.** A migrating user keeps
  their no-repeat history globally, which is correct, but it grows
  unboundedly. There is no GC job today.

## Operations

- **No metrics endpoint.** Health beyond "the HTTP server responds" is
  not exposed.
- **No rate limit on socket events.** The HTTP layer has a 60 req/min
  middleware (per-IP, per-process); the Socket.IO layer does not.
- **HTTP rate limiter is per-process.** Won't aggregate across replicas.
  Not an issue for the single-VPS beta deploy. Map is best-effort
  GC'd every 60 s.
- **No CDN / static asset caching.** Next handles default caching but
  there is no edge layer in front of the app container.
- **`middleware.ts` deprecation warning.** Next 16 prefers `proxy.ts`;
  the rename is queued but not landed in this push.

## UI/UX

- **Mobile chess is functional, not great.** The board adapts to
  viewport width but the sidebar (clocks + history + controls) stacks
  below it on phones in a way that requires scrolling between moves.
- **No animations on capture / check.** Visual feedback is colour-only.
- **No accessibility audit.** Keyboard play of chess is partial
  (squares are buttons, but there's no keyboard navigation between
  them).
- **No i18n.** Some copy is in Romanian (dashboard greetings); the
  rest is English. There is no language toggle.

## Tests

- **There is no automated test suite.** Verification is manual: TypeScript,
  ESLint, `next build`, Docker rebuild, HTTP smoke checks. No
  Playwright/Vitest yet.
