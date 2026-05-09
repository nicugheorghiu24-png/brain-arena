# Brain Arena — Competitive Systems

How rank, progression, matchmaking, and seasons work today and where
they're heading. This is a living spec — not what the code does
*literally* in every line, but what the contract between the code and
the player should be.

---

## Player progression

Each player has one `Profile` row. Progression has two semi-orthogonal
dimensions:

| Dimension | Meaning | Where it shows |
| --- | --- | --- |
| **Tier + division** | Skill class — Bronze IV → Master I | The badge on the leaderboard, dashboard rank card, profile header |
| **LP** | Numeric Elo within a tier — 0 to ~2000 | Dashboard rank card, leaderboard primary sort |
| **XP + level** | Time-played progression, never goes down | XP card on the dashboard |
| **Wins / losses** | Lifetime totals | Dashboard PlayerStats |
| **Current streak** | Consecutive wins (resets on loss/draw) | Dashboard, post-match screen |
| **Best streak** | All-time max of `current_streak` | Dashboard PlayerStats, profile |
| **Placement matches** | 0 → 5; until 5, the player is "Provisional" | Onboarding banner, profile |

The point of having BOTH `LP` (skill) and `level` (time invested) is
that they can't be conflated. A casual player who plays a lot still
levels up; a competitive player who plays a little still climbs LP.
Neither dimension can be gamed against the other.

### Why no "MMR" separate from "LP"?

Some games separate hidden MMR (matchmaking math) from displayed LP
(climb metric). Brain Arena currently uses LP as both. Reasons:

- We have one game type that's ranked PvP (chess); the simplification
  cost is low.
- Beta-scale player counts mean we don't have data to tune two
  numbers separately.
- Showing the player exactly the number that decides who they play
  builds trust.

If queue times become unfair (Bronze waiting 5 min for any match
because they should match Diamond too), we revisit. Until then: one
number.

---

## LP changes (Elo, K=32)

```
expected = 1 / (1 + 10^((opponentLp - selfLp) / 400))
delta    = round(32 * (actualScore - expected))
newLp    = max(0, currentLp + delta)
```

`actualScore` is `1` for a win, `0` for a loss, `0.5` for a draw.
This applies for chess (the only Elo-vs-opponent game today). LP is
clamped at 0 — you can't go negative.

### Solo game LP delta

Solo games (math, memory, reaction, quiz) don't have an opponent's
LP. They use a fixed-delta formula via `app/games/reward.ts`:

```
LP win  = +22 + min(margin * 2, 8)   // margin = scoreSelf - scoreOpponent
LP draw = +4
LP loss = −14
```

Solo games are ranked but bounded. A solo grinder can absolutely climb
to Diamond. The system trusts that the bot is roughly fair — and the
anti-cheat layer prevents a tampered client from claiming impossible
scores (`ANTI_CHEAT_ARCHITECTURE.md`).

### Tier thresholds

Single source of truth: `app/lib/services/profiles.ts:tierForLp()`.

| Tier | LP range | Divisions (top → bottom) |
| --- | --- | --- |
| Master | 2000+ | I |
| Diamond | 1500–1999 | I (1800+), II (1650+), III (1500+) |
| Platinum | 1200–1499 | I (1350+), II (1275+), III (1200+) |
| Gold | 900–1199 | I (1050+), II (975+), III (900+) |
| Silver | 600–899 | I (750+), II (675+), III (600+) |
| Bronze | 0–599 | I (300+), II (150+), III (0+), IV (default for new) |

Bronze IV is the default for a new account. It is **explicitly cosmetic
during placement matches** — the player is shown "Provisional" until
they've played 5 ranked matches. After that, they're placed at
whatever tier their LP says.

---

## Streaks

| Field | Update rule | Notes |
| --- | --- | --- |
| `currentStreak` | win → +1, loss/draw → 0 | Server-applied in `applyMatchOutcome` |
| `bestStreak` | max(bestStreak, currentStreak) | Update happens in the same transaction |

Streaks ONLY count from ranked competitive matches. We don't break
streaks on a network disconnect (the server doesn't see the disconnect
as a draw — it's a forfeit, which counts as a loss for the abandoner).

---

## Placement matches

A new account plays its first 5 ranked matches as "Provisional." Two
behaviors during placement:

1. Tier display in UI is the literal "Provisional" badge, not Bronze IV.
2. LP changes are 1.5× normal magnitude. Placement is supposed to
   converge the player toward their real skill quickly.

After placement_matches_played reaches 5, the profile becomes a normal
ranked profile with the standard tier-by-LP rules.

This is now fully implemented:

- ✅ `placementMatchesPlayed` field on Profile
- ✅ Increment in `applyMatchOutcome` and `rankingsService.updatePlayerRank`
- ✅ 1.5× LP magnitude during placement (in both progression paths)
- ✅ "Provisional" badge in the dashboard's `RankCard` while
  `placementMatchesPlayed < 5` — shows placement progress instead of
  the tier-climb bar

---

## Abandon penalty

A player who closes their tab during a chess match abandons their
opponent. Today the chess server gives a 30-second reconnect grace
window. If the timer expires:

1. Match ends with `reason = "opponent disconnected"`
2. The opponent gets a normal Elo win
3. **The abandoner pays an extra LP penalty beyond the loss** (this turn's work)

The extra penalty is fixed at `−10 LP` in addition to whatever Elo
math gives on the loss. So a Bronze IV abandon costs ~24 LP total
(ish), not just ~16. The penalty:

- Doesn't drop the player below LP=0.
- Doesn't fire if the disconnect is < 30s (the player reconnected in
  time — that's a network blip, not a rage-quit).
- IS recorded in `audit_events` so a pattern of abandoning by the
  same player is visible to admins.

---

## Matchmaking

### Today (M1)

`MatchmakingQueue` in `app/lib/matchmaking.ts` is FIFO per `gameId`.
When 2 players are queued for the same game, they're paired
immediately. No LP awareness.

For chess, this is acceptable at beta scale — almost everyone is
Bronze and queue depth rarely exceeds 2.

### Next (M2)

Pair the closest-LP players in the queue, not the FIFO front two.
Concretely:

```
when player joins queue Q for game G:
  candidates = Q[G] sorted by abs(playerLp - candidate.lp)
  if candidates[0] exists AND
     (waitTime[player] > 60s
      OR abs(playerLp - candidates[0].lp) < 200):
    pair them
  else:
    keep player in queue
```

Two thresholds:
- **200 LP** — a Bronze III plays a Bronze I, but not a Bronze II vs
  Diamond II.
- **60s wait** — after a minute waiting alone, lower the bar to
  whoever's closest. Better to play a mismatched match than nothing.

Bot fallback at 60s for chess is also planned (M2). The bot's playing
strength matches the queued player's tier.

### Region affinity (M2)

Profile already has `region`. Matchmaker prefers same-region pairs but
falls back to anyone after 60s. Spec is in `SCALING_PLAN.md`.

---

## Seasons

Brain Arena has the schema for seasonal leaderboard snapshots
(`SeasonLeaderboardEntry`) but no code that turns over a season.

### Season turnover (M3)

Spec:

1. A season is a fixed wall-clock window — initially 90 days.
2. At the end of a season:
   - Every Profile's current LP is captured into
     `SeasonLeaderboardEntry` with the closing rank
   - Every Profile's LP is **soft-reset** by formula:
     `newLp = max(0, oldLp / 2)` — this preserves skill ordering but
     condenses the tier distribution back down so there's "something
     to climb again."
   - `placementMatchesPlayed` resets to 0; first 5 of the new season
     are placement.
   - Season ID increments.

The soft-reset formula is from competitive-game design literature
(LoL's "soft MMR reset"). Hard reset feels punishing; no reset feels
empty. Halving feels like a fresh start without erasing your history.

3. Past seasons are queryable for "Season 1 final standings"
   leaderboards.

### Why not now?

We need at least 4–8 weeks of single-season activity before turnover
becomes meaningful. Season 1 starts implicitly on the first launch
and runs until M3 ships season turnover.

---

## Anti-smurf protection

A "smurf" is a strong player who creates a new account to crush
beginners. Counter-measures (in priority order):

| Protection | Status |
| --- | --- |
| Email verification gate at signup | M2 |
| Anti-cheat replay validation catches "too good for placement" | M2 |
| Stockfish-correlation in chess catches engine-assisted smurfing | M2 |
| New accounts on same IP throttled at signup | M3 |
| New account's first 10 wins flagged for manual review | M3 |
| Cross-account behavioral fingerprint (timing, openings) | post-GA |

For beta scale (≤ 50 invitees), smurfing isn't a real concern. Listed
here so it's not forgotten.

---

## What we DON'T do

- **No pay-to-win.** Period. See `FAIRNESS.md`.
- **No win-streak multipliers** that compound rewards. They reward
  hot streaks disproportionately and feel addictive in the wrong way.
- **No "demote protection"** below Diamond. Below Diamond, you
  always demote when LP drops to a previous tier. We don't want
  fake-Bronze players who are really Silver-skill.
- **No private LP**. The number on the rank card is the same number
  the matchmaker uses (see "Why no MMR separate from LP" above).
- **No paid rank boosts.** Removed from consideration.
- **No external accounts (Steam, Discord OAuth) yet.** They're a
  potential M2 add but not committed.

---

*Companion: `ANTI_CHEAT_ARCHITECTURE.md` for trust enforcement,
`PRODUCT_ROADMAP.md` for milestone gating.*
