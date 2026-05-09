# Brain Arena — Product Roadmap

**Owner:** engineering lead · **Last updated:** 2026-05-09 · **Production state:** stable, 2 active beta users on `https://playbrainarena.com`

This document is the single source of product priorities. It supersedes
the loose "Tier 1/2/3" lists in `NEXT_STEPS.md` and folds in the
post-stabilization product themes the owner asked for.

---

## Operating principle

Every milestone has a single retention metric we expect to move. If we
can't articulate the metric, the work is premature. The platform has 2
real users who play organic chess matches. **We will not lose those
users to bugs in features we shipped to chase the next milestone.**

A change ships when:
- it builds, lints, types, and the multi-user smoke test still passes
- it has been deployed and exercised against the live URL
- the change is rollback-able via `scripts/rollback.sh`

---

## Where we are (2026-05-09)

| | |
| --- | --- |
| Live URL | `https://playbrainarena.com` |
| Real users | 2 (the owner + 1 invited) |
| Real matches played | At least 1 complete chess game in the audit log |
| Process | systemd-supervised, `Restart=always` |
| TLS | Let's Encrypt R12, auto-renewing |
| Deploy | one-command via `scripts/deploy.sh`; one-command rollback |
| Auth | session cookie, server-authoritative, ban-aware (post-this-turn) |
| Anti-cheat | timing audit only; persisted to DB (post-this-turn) |
| Admin | env-token-gated REST API (post-this-turn) |

---

## Milestones

### M1 — "Real Beta" — close on ETA 2026-05-16 (≈ 1 week)

**Retention metric:** week-2 retention of invited users (do they come back to play more than once?).

**Hypothesis:** The platform must feel like a competitive product, not a tech demo. That requires (a) honest progression that updates correctly, (b) consequences for abandoning matches, (c) a bannable misuse surface, and (d) operator visibility.

| Work item | Owner | Status |
| --- | --- | --- |
| Streak tracking + placement-match counter on `Profile` | Backend | shipped this turn |
| Chess abandon penalty (close-tab → forfeit + extra LP loss) | Backend | shipped this turn |
| Audit-log persistence (chess timing + future flags) | Backend | shipped this turn |
| Ban-aware auth + admin API (lookup, ban/unban, match inspect) | Backend | shipped this turn |
| Native `bcrypt` (no event-loop block on signup/login) | Backend | shipped this turn |
| `/api/metrics` for ops monitoring | Backend | shipped this turn |
| **Match-finished screen polish** (stats vs lifetime, streak feedback) | Frontend | next turn |
| **First-match guidance overlay** for new users | Frontend | next turn |
| **Onboarding** — username confirmation, region pick | Frontend | next turn |
| Replay validation framework (server-side) for solo games | Backend | shipped this turn |
| Math game replay validator (bounds + score reconciliation) | Backend | shipped this turn |
| Achievement catalog + auto-awarding on match end | Backend | shipped this turn |
| 1.5× LP magnitude during placement | Backend | shipped this turn |
| `RankCard` "Provisional" badge while in placement | Frontend | shipped this turn |
| Per-game replay validators (memory, reaction, quiz) | Backend | M2 |
| Email verification + password reset | Backend + ops | M2 |

### M2 — "Open Beta" — ETA 2026-06-06 (≈ 4 weeks)

**Retention metric:** day-7 returning user fraction across new signups.

**Hypothesis:** Once the product feels real, growth is gated by (a) friction at signup, (b) "no one to play" feel for new visitors, and (c) one bad actor ruining a match for a regular.

| Work item | Why |
| --- | --- |
| MMR-aware matchmaking — pair closest LP, not FIFO | A Bronze IV vs Diamond I match isn't fun for either |
| Bot fallback at queue timeout (chess) | "Nobody else is online" is a retention killer; offer a difficulty-matched bot at 60 s |
| Friend invites (link with embedded ref) | Two friends bring a third; growth without paid acq |
| Stockfish-correlation chess anti-cheat | One cheat in beta scuttles trust |
| Replay validation per solo game | Closes the bounds-only score-tampering surface |
| Region affinity in matchmaking | EU+SA paired via a 200ms RTT path is a bad first impression |
| `next/proxy.ts` per-event Socket.IO rate limit telemetry to admin dashboard | We have the limits; we should see the throttle hits |
| Public profile lookup (`GET /api/profile/[username]`) | Right now `/profile/<other_user>` falls back to seeded data |
| Achievement catalog seed + UI | The unlock hooks exist; the table is empty |

### M3 — "Public Beta" — ETA 2026-07-15 (≈ 8 weeks)

**Retention metric:** day-30 active users.

**Hypothesis:** Once growth + trust are solid, retention is gated by content depth and competitive structure.

| Work item | Why |
| --- | --- |
| Multi-replica state (Redis-backed queue + chess match state) | Currently one Node restart kills active games; can't scale past one VPS |
| Multiple chess time controls (1+0, 3+2, 10+5, 30+0) | Single 5+5 boxes us out of bullet/blitz/rapid niches |
| Three-fold repetition / 50-move-rule "claim draw" UI | Engine recognises both; players need to claim |
| Premove + animation polish | Table-stakes for chess UX |
| Real human PvP for the question games | They're "vs AI" today; PvP is the addictive loop |
| Daily quests (e.g. "Win 3 chess matches today") | Lightweight retention hook |
| Season turnover (each season → snapshot leaderboard, soft-reset LP) | Long-term competitive structure |

### M4 — "GA" — no ETA

Conditional on traction. Not committed.

| Item | Notes |
| --- | --- |
| Spectator mode polish | Code already supports spectators on chess; needs a viewer UI |
| Mobile chess landscape redesign | Sidebar beside the board; portrait stacks |
| i18n | Some copy is in Romanian today; needs a language toggle |
| Custom rooms / private matches | Friend matches outside the queue |

### Tier ∅ — explicitly out of scope until separate legal review

Per `FAIRNESS.md`. The schema has placeholder `Wallet` / `Transaction` tables that **no application code reads or writes**. Do not enable any payment flow without dedicated counsel sign-off.

- Real-money deposits / withdrawals
- Gambling mechanics (random rewards, loot boxes, prize wheels, multipliers)
- Crypto / web3 / NFTs

---

## Decision log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-05-08 | Skill-only forever | Fairness is the brand; payments fork the product |
| 2026-05-08 | Bare-metal on Hetzner not Vercel | Custom Socket.IO server can't run on Vercel's edge |
| 2026-05-09 | systemd, not Docker on the VPS | Faster to operate; Docker compose retained as alternative path |
| 2026-05-09 | Env-token admin auth (not user roles) | Beta scale doesn't need RBAC; revisit at M3 |
| 2026-05-09 | Bounds-only solo anti-cheat for M1 | Replay framework is M1, per-game runners deferred to M2 |
| 2026-05-09 | Audit events live in Postgres `audit_events`, not stdout | Searchable, joinable to matches |

---

## Operating cadence

- Every code change → CI-green build → smoke test against live → deploy via `scripts/deploy.sh`
- Weekly: review `/api/metrics` for trends; adjust priorities
- Per-incident: rollback via `scripts/rollback.sh`, then root-cause + permanent fix in next push

---

*Companion docs: `BETA_LAUNCH_PLAN.md`, `COMPETITIVE_SYSTEMS.md`, `ANTI_CHEAT_ARCHITECTURE.md`, `SCALING_PLAN.md`.*
