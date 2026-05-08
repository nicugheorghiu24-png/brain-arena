# Brain Arena — Security Notes

What we've shipped, what we've explicitly chosen not to ship, and what
remains a known soft spot for the May 10 private beta.

## Authentication

- **Sessions** are random 32-byte hex tokens (256 bits) generated with
  `node:crypto.randomBytes`. They live in the `sessions` Postgres table
  with an `expiresAt`. The token is set in an HttpOnly + SameSite=Lax
  cookie, `Secure` flag enabled when `NODE_ENV=production`. TTL is
  30 days.
- **Passwords** are hashed with `bcryptjs` at cost 12. The pure-JS
  implementation is slower than native bcrypt — fine for beta scale,
  swap to `bcrypt` (native) before opening to public traffic.
- **Login timing** is equalized: when no user matches the email, we
  still run `bcrypt.compare` against a static dummy hash so an attacker
  can't distinguish "email exists" from "wrong password" by latency.
- **Signup duplicate handling** translates Prisma `P2002` (unique
  constraint violation) into a 409 "Email or username already taken."
  This closes the TOCTOU race between the existence pre-check and the
  insert.
- **Server-side validation** for both signup and login uses zod schemas
  inside the route handler. The same rules are enforced client-side in
  `app/lib/auth/index.ts` for UX, but the server is authoritative.

## Sessions and refresh

- The `Navbar` component calls `/api/auth/me` once on mount. If the
  server reports a logged-in user but the client's `fakeAuth`
  localStorage is missing or stale, the client rehydrates from the
  server response. This fixes the "cleared localStorage but still have
  cookie" UX bug.

## Match recording

- `POST /api/matches` is the **only** server-authoritative way to
  persist a solo-game outcome. The endpoint:
  - Requires a valid session cookie (returns 401 otherwise).
  - Validates the body via zod (gameId in registry; result ∈ {win, loss,
    draw}; scores 0–200; rounds 1–200; durationMs 500 ms–15 min).
  - **Recomputes `lpDelta` and `xpGained` server-side** from
    `computeReward(...)`. The client cannot send a forged reward.
  - Writes via Prisma transaction: a `match` row + one `match_result`
    row + a `profile` update (LP, XP, level, tier, division, wins,
    losses).
- The optimistic reward shown on the client's result screen is
  reconciled with the server's response after the POST resolves, so
  the player always sees the truth.

## Socket.IO

- Connections now go through a handshake middleware
  (`io.use(...)`) that parses the `ba_session` cookie and binds a
  server-trusted `{ userId, username }` onto `socket.data.auth`. Every
  privileged event (`join_queue`, `make_move`, `offer_draw`, `resign`,
  `request_rematch`) ignores any client-supplied `userId` and uses the
  bound identity. Anonymous sockets can still subscribe but cannot
  queue, move, or resign.
- Spectator joins are explicitly allowed without auth via
  `join_match` with `spectate: true`.
- **Not yet hardened**: Socket.IO has no per-event rate limit. A
  malicious authenticated user could flood `make_move` events; chess.js
  rejects illegal moves but the server still does the work to validate.

## Match seeds

- Match seeds for shared question generation are now derived from
  `node:crypto.randomBytes(6)` — 48 bits of CSPRNG-grade randomness.
  `Math.random()` is no longer used for any user-visible identifier.
- 48 bits = ~2.8 × 10^14 distinct seeds, which is enough to defeat
  pre-computation against the question pool.

## Inputs / payloads

- Every API route validates JSON with zod and returns a generic
  "Invalid input." 400 on failure. Stack traces never reach the
  response body.
- The middleware-layer rate limiter caps `/api/*` (excluding health
  probes) to 60 requests / IP / minute. The map is per-process and
  best-effort GC'd every 60 s. For multi-replica deploys this needs
  to move to a shared store.

## Secrets / env

- `.env` and any `.env.*` (except the explicitly whitelisted
  `.env.example`) are git-ignored. `git ls-files .env*` should only
  ever list `.env.example`.
- `app/lib/env.ts` validates required env at boot. In production with
  missing/invalid `DATABASE_URL` or `PUBLIC_ORIGIN`, the server
  refuses to start (`process.exit(1)`).
- The `wallets` / `transactions` Prisma models are present in schema
  but **no application code reads or writes them**. They will stay
  dormant.

## Known soft spots (acceptable for closed beta)

- **No CSRF token** on POST endpoints. SameSite=Lax cookies are the
  primary defense. If we add cross-origin form posts later we'd add
  a CSRF token.
- **Bcryptjs blocks the event loop** ~150–300 ms per signup/login.
  Acceptable at beta scale; switch to native bcrypt or worker-thread
  before public.
- **Match-result anti-cheat is bounds-only.** No replay validation;
  no anomaly detection across a player's match history. The chess
  timing audit is log-only.
- **No automated security scan in CI.** ESLint runs but `npm audit`,
  Snyk, etc. are not wired up.
- **Cloudflare WAF** sits in front of the deploy and provides default
  bot-mitigation; we have not customized rules beyond the defaults.
