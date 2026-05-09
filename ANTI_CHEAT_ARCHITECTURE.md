# Brain Arena — Anti-Cheat Architecture

How Brain Arena enforces honest play. The threat model, the
evidence we collect, the actions we take, and the roadmap from
"timing heuristics" to "engine-correlation + replay validation."

---

## Threat model

Three distinct attackers, each with a different mitigation.

| Attacker | Goal | Mitigation |
| --- | --- | --- |
| **Tampered client** in solo games | Submit a winning score they didn't earn (modify the JS to claim 50/50 in a math sprint) | Server-authoritative scoring + bounds + replay validation |
| **External engine** in chess | Use Stockfish/Komodo to choose moves, climb leaderboard | Move-by-move engine correlation + timing audit |
| **Account abuser / smurf** | Multiple accounts, alt-accounts to inflate one ego account, abandoning matches | Email verification, ban surface, abandon penalty, cross-account fingerprint |

We do NOT defend against:

- Casual collusion (two friends play each other on alts to throw matches). The
  PvP loop has too few players in beta for collusion to matter; revisit at M3.
- DDoS. That's nginx/Cloudflare's problem, not ours.

---

## Trust boundary

The chess server is **server-authoritative**. The client never tells
the server "the game ended" — the server runs `chess.js` and decides.
The client merely emits move intents (`{from, to, promotion?}`).

The solo games are **server-bounded but client-computed**. The client
runs the deterministic question generator, computes its own score,
and POSTs the result to `/api/matches`. The server validates:

- the gameId exists in the registry
- result is `win|loss|draw`
- score in 0–200, rounds in 1–200, durationMs in 500ms–15min
- recomputes `lpDelta`/`xpGained` server-side from `computeReward(...)`

This catches the dumb client tamper (claim 999-0 or "lpDelta = +5000")
but NOT a sophisticated tamper that submits a plausible-looking 8/2
math sprint with realistic timing. **Replay validation closes that
gap.**

---

## Replay validation (framework + math validator shipped)

Each solo-game submission to `/api/matches` includes an optional
`inputs` field — a compact representation of the player's input stream.
The schema is shipped:

```ts
// On MatchResult — actually in prisma/schema.prisma now
inputs           Json?
inputsValidated  Boolean  @default(false)
auditFlags       String[] @default([])  // ['answer_too_fast', 'score_mismatch', …]
```

The validator registry is at `app/lib/games/replay/index.ts`. Math
validator (`app/lib/games/replay/math.ts`) shipped this turn and
enforces:

  - ≥ 100 ms per answer (anything faster is bot-speed)
  - ≤ 30 000 ms per answer (anything longer = walked away, doesn't
    count toward total)
  - Score reconciliation: claimed `scoreSelf` must equal the count of
    inputs where `chosenIndex === correctIndex`
  - Total answer count ≤ rounds (= sprint duration in seconds)
  - Sum of per-answer ms ≤ `durationMs * 1.1` (10% slack)

On validator failure, `/api/matches` POST clamps `lpDelta` to 0,
saves the flags on `MatchResult.auditFlags`, and writes an
`AuditEvent` row with `category="replay"`. The match is still
recorded — we want the data — just no progression for it.

What the math validator DOES NOT yet defend (M2 follow-up): a
cheater that submits inputs with fabricated `correctIndex`. True
server-deterministic replay would regenerate the same question set
from `matchSeed` and verify `correctIndex` from the generator.
Math's question pipeline currently uses fresh client-side seeds per
refill batch which makes that non-trivial. Fix: switch math to a
single match-bound seed + larger initial batch, then this
validator gains a "regenerate set, verify correctIndex" step.

**Per-game `inputs` shape:**

| Game | Shape |
| --- | --- |
| math | `{questions: [{idx, ms, answer, correct}]}` — answer is the user's chosen value, idx into the deterministic generated set |
| memory | `{turns: [{cardA, cardB, ms, matched}]}` — card indices into the shuffled deck |
| reaction | `{rounds: [{rt: number}]}` — reaction time per round, -1 = false start |
| quiz / arena | `{answers: [{idx, choice, ms}]}` |

**Server-side per-game validator** (M2 work item):

```ts
async function validateSoloMatch(input: MatchInput, inputs: GameInputs):
  Promise<{valid: true} | {valid: false; flags: string[]}>
```

Each validator:

1. Re-runs the deterministic question generator with the match seed
2. Replays the input stream
3. Computes the canonical `scoreSelf` from the inputs
4. Compares to the submitted `scoreSelf`
5. Sanity-checks individual answer timings (e.g. < 100ms per math
   question is implausible)

If `inputs` is provided AND validation succeeds → `inputsValidated =
true`, no flags.
If `inputs` is missing → record the match but flag
`inputs_missing`. (Backwards compat for older client builds.)
If `inputs` is provided AND validation FAILS → record the match but
flag `replay_mismatch`, AND clamp `lpDelta` to 0 (no LP for cheaters,
but don't error — log and move on so we can study the attempt).

This stays as `inputs Json?` because we want each game to evolve its
schema independently.

---

## Chess engine-correlation (M2)

The chess audit today is timing-only (in `app/lib/matchmaking.ts:
auditChessMatch`):

- `instant_moves` if > 40% of moves are < 200ms (after move 8)
- `metronomic_timing` if mean > 500ms but stddev/mean < 0.15

These are good leading indicators but trivially defeated. The next
layer:

**Stockfish correlation:**

Run each move through Stockfish at depth 12 (~50ms per move on a
beta-scale VPS) and compute "centipawn loss per move."

- A 1500-rated human typically averages 50–80 cp loss
- A 2200-rated human typically averages 20–40 cp loss
- Stockfish at depth 20 averages 0–5 cp loss against itself
- A player whose centipawn-loss distribution looks identical to
  Stockfish's at depth N is almost certainly using Stockfish at
  depth N

Implementation outline:

1. After `endChessMatch`, asynchronously enqueue the PGN to a worker
2. Worker runs `stockfish` via the `chess.js`-compatible UCI binding
3. Computes per-move CP loss; aggregates mean + stddev + median +
   "blunder count" (moves losing > 200cp)
4. Writes flags to `audit_events` if the distribution is suspiciously
   close to Stockfish at any fixed depth

This is genuinely a week of work and depends on having a Stockfish
binary available on the VPS. Holding for M2.

---

## Audit log (this turn's work)

**Schema:**

```prisma
model AuditEvent {
  id          String   @id @default(uuid())
  matchId     String?
  match       Match?   @relation(fields: [matchId], references: [id], onDelete: SetNull)
  userId      String?
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  category    String   // "chess_timing" | "abandon" | "replay" | "rate_limit" | "ban"
  severity    String   // "info" | "warn" | "alert"
  flags       String[]
  details     Json?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt(sort: Desc)])
  @@index([matchId])
  @@index([category, createdAt(sort: Desc)])
  @@map("audit_events")
}
```

**Writes (this turn):**

- `category: "chess_timing"` after every chess match end (replaces
  the stdout-only journal lines)
- `category: "abandon"` whenever the 30s reconnect grace expires and
  the abandoner gets the LP penalty
- `category: "ban"` on every admin ban/unban action

**Reads (this turn):**

- Admin endpoint `GET /api/admin/users/:id` joins recent audit events
  for the user
- Admin endpoint `GET /api/admin/matches/:id` joins audit events for
  the match
- Future: `GET /api/admin/audit?category=...&since=...` for triage

**Retention:** none yet. With 2 users we get a few rows per day. At
M3 we'll add a 90-day rolling window via the same systemd-timer
pattern as session cleanup.

---

## Action ladder

A flag fires → what happens?

| Flag count for a user | Action |
| --- | --- |
| 1 timing flag | log only; no UI consequence |
| 2 timing flags within a 7-day window | flag the user account in admin dashboard with a yellow banner |
| 3+ timing flags OR any `replay_mismatch` | the next ranked match's LP gain is 0 (silent shadowban from progression); admin notified |
| Engine-correlation flag with high confidence | admin manually reviews PGN; `POST /api/admin/users/:id/ban` if confirmed |
| Confirmed ban | account flagged `bannedAt`, all future logins return "Account suspended"; their LP/wins frozen |

**No automated bans.** A human has to confirm. We will get false
positives early, especially on `engine-correlation` for grandmaster-
level human players. False bans are catastrophic for trust.

---

## What an admin sees

Endpoints land this turn (env-token-gated). Future UI on top of them.

```
GET  /api/admin/users           — list, sortable by lp, signups, suspicious_score
GET  /api/admin/users/:id       — drill in: profile, recent matches, audit events, IP/UA history
POST /api/admin/users/:id/ban   — { reason } → set bannedAt
POST /api/admin/users/:id/unban — clear bannedAt
GET  /api/admin/matches         — recent matches across all games
GET  /api/admin/matches/:id     — PGN/inputs + audit events + result
GET  /api/admin/audit           — filter by category/severity/since
```

For beta we operate via curl + jq. A web admin dashboard is M3.

---

## What we trust the client to NOT do

- Client computes its own score in solo games — server bounds + (M2)
  replay validates
- Client picks a username at signup — uniqueness enforced by DB
- Client times each move on chess — server has its own clock too
- Client manages its session cookie — server validates every request

What we DO trust the client for:

- Honest network reporting on disconnect (we don't fake-ping the
  client to verify it's really offline)
- Honest reporting of "I clicked a card" in memory match (server
  doesn't see the literal click)

We do NOT trust:

- Reported lpDelta or xpGained — server recomputes
- Reported "I won" — server adjudicates (chess) or bounds-checks
  (solo)
- Reported userId on socket events — server uses the cookie-bound id
- Reported clock time — server has authoritative clock

---

## Roadmap

| Capability | Milestone | Status |
| --- | --- | --- |
| Server-bounded solo scoring | M1 | shipped |
| Chess timing audit (stdout) | M1 | shipped |
| Audit-log persistence to DB | M1 | shipped this turn |
| Abandon penalty + audit event | M1 | shipped this turn |
| Ban surface + admin API | M1 | shipped this turn |
| `inputs` field on MatchResult (framework) | M2 | next turn (schema additive) |
| Per-game replay validators (math, memory, reaction, quiz) | M2 | M2 |
| Stockfish correlation chess anti-cheat | M2 | M2 |
| Admin web dashboard | M3 | M3 |
| Cross-account behavioral fingerprint | post-GA | not committed |
| Manual review queue UI | post-GA | not committed |

---

*Companion: `COMPETITIVE_SYSTEMS.md` (what we protect),
`SCALING_PLAN.md` (where the audit pipeline scales out).*
