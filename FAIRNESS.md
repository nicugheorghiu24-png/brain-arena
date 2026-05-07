# Brain Arena — Fairness Model

Brain Arena is **100% skill-based**. The product is built around three
principles that show up in code, schema, and ops decisions.

## Principles

1. **Same conditions for both players.** Both sides of a 1v1 see the
   exact same starting state, the same clock, and (for question games)
   the exact same questions in the exact same order.
2. **No chance in the outcome.** Outcomes are determined by the players'
   actions, not by random rolls, RNG drops, or lootboxes. The only RNG
   in the codebase exists to *generate* the shared content — never to
   adjudicate it.
3. **No money in the loop.** Brain Arena does not implement payments,
   wallets, gambling mechanics, or random rewards. The Postgres schema
   has `wallets` and `transactions` placeholders, but **no application
   code reads or writes them**. They will stay dormant until and unless
   a separate legal/regulatory review approves a feature.

## How "same conditions" is enforced

### Question games (Logic, Memory, Math, Reaction)

The deterministic question engine lives in `app/games/questions/`.

- One match seed is chosen by the matchmaker and shared with every
  participant.
- `generateQuestionSet(gameId, count, difficulty, seed)` is a pure
  function: same `(gameId, count, difficulty, seed)` always produces the
  same `Question[]` in the same order, on any machine.
- The match's question set is generated **once per match** from that
  shared seed. Both clients reconstruct it locally and play exactly the
  same set, in exactly the same order.

The 60-day "no repeat" filter (`seen_questions` table) is a *per-user
preference layer* applied via `generateFreshQuestionSet`. It is **not**
called per-client during a match — that would break the
same-questions-for-both-players contract. It is used solo or by the
match host to bias question selection away from a particular user's
recent history.

The contract is reasserted directly in
`app/games/questions/match.ts` so future contributors can't miss it:

> In a multiplayer match, every participating client MUST be given the
> same seed (chosen once by the matchmaker / match host) and call
> `generateQuestionSet` — never `generateFreshQuestionSet`, which is
> per-user.

### Chess

Chess is server-authoritative end-to-end. The client only sends
`{ from, to, promotion? }`. The server:

- Validates every move against the current FEN with `chess.js`.
- Allow-lists promotion to `q | r | b | n` (no smuggled pieces).
- Owns the clocks. Time used is measured from the server's
  `clockTurnStartedAt`, not from any client timestamp.
- Detects checkmate / draw / stalemate from `chess.js`.

Clients cannot cause an illegal position, cannot extend their own clock,
and cannot fake a result.

## How "no chance" is enforced

The codebase contains RNG, but never to decide who wins:

| Source | Purpose | Affects outcome? |
|---|---|---|
| `mulberry32(seed)` (questions) | shuffle and pick the shared question set | **No** — both players see the same output |
| `Math.random()` in `tryMatch` | mint a fresh `match.seed` + `matchId` | **No** — only labels and content selection |
| `chess.js` engine | none — chess.js is fully deterministic given moves | **No** |

There are no random rewards, no random LP swings, and no random
matchmaking outcomes. LP changes are a deterministic Elo update with K=32
in `app/lib/services/rankings.ts`.

## How "no money" is enforced

- No payment integrations in code (`grep -ri "stripe\|paypal\|netopia"`
  → schema-only references in `prisma/schema.prisma`).
- No client UI allows depositing, withdrawing, or wagering.
- `wallets` and `transactions` exist in `schema.prisma` purely so a
  future migration is non-breaking; **they are not exposed** through any
  API route, service, or UI.

The accelerated production push explicitly excludes payments, wallets,
gambling, and crypto/web3. If those features are ever revisited they
require a separate green-light from legal *and* a Brain Arena policy
update — not just a code change.

## Audit trail

- `matches` and `match_results` capture the full per-match record
  (seed, difficulty, durationMs, outcome, lpDelta).
- Chess matches additionally undergo a per-move timing audit at
  end-of-match (`auditChessMatch`). Anomalous patterns are logged with
  the `[anti-cheat]` prefix to stdout for review. No automatic
  punishment is wired in yet — flags are advisory only and meant to be
  reviewed by humans during beta.
- Anti-cheat heuristics for question games (impossibly fast answers,
  repeated identical timings, suspicious win streaks) live in
  `app/lib/services/antiCheat.ts`.

## What "fair" does *not* mean

- It does not mean equal skill — Brain Arena explicitly rewards skill
  with LP and tier progression.
- It does not mean immune to cheating — server-authoritative chess
  prevents illegal positions, but engine-assisted play is hard to
  detect and is not yet adjudicated automatically.
- It does not mean indistinguishable from professional rated platforms.
  See `KNOWN_LIMITATIONS.md` for the honest list.
