# Brain Arena — Next Steps

What to do, in priority order, to take Brain Arena from **closed
private beta** to **open public beta** to **GA**. Everything in this
list is *not* in scope for the May 10 push but each item is sized so
you can chunk it independently.

---

## Tier 1 — Before opening signups beyond the invite list

These are quality-of-life and integrity gaps that won't bite a
20-person friends-and-family beta but will bite the first viral spike.

### 1. Replay-validate solo-game outcomes
- **What:** Send the player's input stream (answer indices + per-question
  ms) along with the match outcome. Server replays against the seed
  and rejects mismatches.
- **Why:** Today's `POST /api/matches` validates bounds only — a
  tampered client could submit a plausible 12-7 win and gain LP.
- **Where:** Extend `app/lib/games/recordMatch.ts` and
  `app/api/matches/route.ts` with an `inputs` array; add a per-game
  replay function in `app/games/replay/`.
- **Effort:** ~1 day per game, ~3 days total + tests.

### 2. Native bcrypt
- **What:** Swap `bcryptjs` for `bcrypt` (native).
- **Why:** Pure-JS bcrypt blocks the event loop ~150–300 ms per
  signup/login. Native bcrypt is ~10× faster.
- **Where:** `package.json` + `app/lib/auth/server.ts`.
- **Effort:** 30 min including container rebuild test.

### 3. Password reset flow
- **What:** "Forgot password" → email a one-time link → set new
  password.
- **Why:** No reset today; lost passwords need a manual DB edit.
- **Effort:** ~2 days including SMTP wiring (Resend or Postmark).

### 4. Email verification
- **What:** Signup sends a magic link; account is read-only until
  verified.
- **Why:** Today anyone can sign up with any email. Spammers will.
- **Effort:** ~1 day building on the same SMTP path as #3.

### 5. Move `middleware.ts` → `proxy.ts`
- **What:** Run `npx @next/codemod@canary middleware-to-proxy`.
- **Why:** Eliminates the Next.js 16 deprecation warning emitted on
  every build. Future minor versions will drop the alias.
- **Effort:** 5 minutes.

### 6. Proper Socket.IO rate limits
- **What:** Per-event rate limit (e.g. 30 moves/min, 5 chat/sec) using
  a small in-memory bucket per socket.
- **Why:** A logged-in attacker can flood `make_move` with illegal
  inputs; chess.js rejects them but the server still does the work.
- **Where:** `app/lib/matchmaking.ts` — wrap each handler.
- **Effort:** ~2 hours.

---

## Tier 2 — Before opening to public traffic

### 7. Multi-replica state
- **What:** Move `matchmakingQueue` and `activeChessMatches` out of
  process memory, into Redis (or Postgres with `LISTEN/NOTIFY`).
- **Why:** Today a single Node process holds all live matches. A
  restart kills every game. Horizontal scaling is impossible.
- **Where:** `app/lib/matchmaking.ts` is the entire surface.
- **Effort:** 1–2 weeks, biggest engineering item on the list.

### 8. MMR-aware matchmaking
- **What:** Pair the closest two queued players by `lp` rather than
  the front two.
- **Why:** A Bronze IV vs a Diamond I is not fun for either.
- **Effort:** ~half a day.

### 9. Region affinity
- **What:** Track `Profile.region` against socket location; prefer
  pairing within region with a falloff after 30 s of no match.
- **Effort:** ~1 day.

### 10. Engine-correlation chess anti-cheat
- **What:** For chess matches, run the moves through Stockfish at
  fixed depth and compute correlation. Flag suspiciously high
  agreement.
- **Why:** Today's `auditChessMatch` only checks timing.
- **Effort:** ~1 week, including the Stockfish worker pool.

### 11. Automated test suite
- **What:** Vitest for unit tests, Playwright for E2E. Cover at
  minimum: signup/login, /api/matches POST + GET, leaderboard, chess
  match end-to-end.
- **Why:** All current verification is manual.
- **Effort:** ~1 week to bootstrap and write the core flows.

### 12. Metrics + observability
- **What:** Prometheus-compatible `/metrics` endpoint; structured
  logging (pino); error tracking (Sentry or similar).
- **Effort:** ~3 days.

---

## Tier 3 — Polish for GA

### 13. Multiple chess time controls
- 1+0 bullet, 3+0 / 3+2 blitz, 10+5 rapid, 30+0 classical.

### 14. Premove + animation polish
- Click-and-hold to pre-queue a move; piece slide animation.

### 15. Three-fold repetition / 50-move-rule "claim draw" UI
- Engine recognises both today; UI doesn't expose them.

### 16. i18n
- Today's copy mixes English and Romanian. Add a language toggle.

### 17. Real human PvP for question games
- Today Logic/Memory/Reaction/Math are all vs AI. Wire them through
  `MatchmakingShell` so the existing matchmaking infra spawns real
  PvP rooms with shared seeds.

### 18. Mobile chess landscape redesign
- Sidebar beside the board on landscape phones; portrait stacks.

### 19. Achievements catalog seed
- The schema and `unlockIfExists(...)` hook are wired but no rows
  exist in `achievements`. Seed a starter set (first win, 10 wins,
  first checkmate, 7-day streak, etc.).

### 20. Audit logs to Postgres
- Today `auditChessMatch` writes to stdout. Add a `chess_audit_flag`
  table and persist alongside the match.

---

## Tier 4 — Out of scope until legal review

- Payments, wallets, deposits, withdrawals.
- Random rewards, loot boxes, spin wheels.
- Crypto / web3 / NFTs.

These are explicitly excluded by `FAIRNESS.md`. The Prisma `wallets` /
`transactions` models are scaffolded but no application code touches
them. Do **not** wire them up without separate sign-off.
