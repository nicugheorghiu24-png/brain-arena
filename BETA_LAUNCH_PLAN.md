# Brain Arena — Beta Launch Plan

This is the operational plan for moving Brain Arena from the current
**closed private beta** (2 invited users) to **open beta** (anyone can
sign up, ranked play, leaderboards meaningful).

It's the practical answer to "what specifically must be true before
we open signups?" — not the strategy doc, the runbook.

---

## Phase 1 — Closed private beta (now → +5 invited users)

**Status:** ACTIVE since 2026-05-09. Live URL is open and working,
but signup is announced only to invited people.

**Gate to expand:** none — invite anyone you trust to give honest
feedback. Cap at 5–10 to keep feedback signal high.

**What we want from this phase:**

1. **Find embarrassing UX issues** the engineering lead can't see
   without browser eyes (animation flicker, mobile reflow, copy
   weirdness, dead-end navigation).
2. **Validate the chess loop** plays start-to-finish reliably across
   browsers and reconnects.
3. **Burn through the first audit-log alerts** so the timing
   thresholds are tuned by real human play, not synthetic.
4. **Stress the matchmaking queue** with 3+ concurrent users.

**Tracking:**

- `journalctl -u brain-arena.service` for runtime errors
- `/api/admin/metrics` for queue depth + match counts
- `audit_events` table for any anti-cheat flags

**Hard exit criteria — must close before Phase 2:**

- [ ] No P0 bug reports for 7 consecutive days
- [ ] At least 3 invitees have played chess at least 2 times each
- [ ] All 5 strategy docs are read and ack'd by the owner
- [ ] First-match-guidance overlay implemented (next turn)
- [ ] Match-finished screen showing real lifetime stats (next turn)
- [ ] At least one synthetic load test of the queue (`smoke-multi-socket.mjs`
      run with 4–6 concurrent clients)

---

## Phase 2 — Soft open beta (signups limited but undocumented)

**Trigger:** Phase 1 exit criteria met.

**What changes:**

- Signup endpoint stays open; no announcement; no SEO indexing
  (`robots.txt: Disallow: /` already in place).
- Owner adds an invite link to a small Discord / Telegram / Twitter
  audience. Cap at "however many show up the first day."
- Email verification turns on — no more `@brain-arena.test`-style
  signups (the smoke test will continue to use those, but they get
  flagged via email-domain).

**Gates:**

- [ ] Email verification (M2 work item)
- [ ] Password reset (M2 work item)
- [ ] Public profile lookup endpoint (`/api/profile/[username]`)
- [ ] Onboarding flow on first signup (next turn)
- [ ] Bot-fallback at chess queue timeout — "no one online" must not
      be a dead-end
- [ ] Stockfish-correlation chess anti-cheat (M2)

**Tracking signal:** week-2 retention. We expect ≥ 30% of new signups
to play at least one match in the second week. Below that, stop and
diagnose; do NOT widen the funnel.

---

## Phase 3 — Public beta (announceable, indexable)

**Trigger:** sustained week-2 retention ≥ 30% across two consecutive
two-week cohorts.

**What changes:**

- `robots.txt` updated to allow indexing of the homepage + leaderboard
- Public sitemap.xml
- Owner can promote on social channels
- Documented onboarding ("How Brain Arena ranks you") on a `/about`
  page
- Bug bounty disclosure page (`/security`)

**Gates:**

- [ ] Multi-replica state (Redis) — single-process state cap is hard
      at maybe 200 concurrent matches; we'll hit it
- [ ] Multiple chess time controls (1+0, 3+2, 10+5, 30+0)
- [ ] Replay validation live for all solo games
- [ ] Stockfish anti-cheat actually flagging cheaters in prod
- [ ] Achievement catalog seeded
- [ ] At least one full season turnover successfully completed (M3)

---

## Per-launch checklist (every phase transition)

- [ ] `scripts/deploy.sh` ran clean against current `main`
- [ ] `scripts/smoke-multi-socket.mjs` against the live URL → PASS
- [ ] `audit_events` reviewed for anything that smells like cheating
- [ ] DB backup taken (`pg_dump` to a separate host)
- [ ] `journalctl -u brain-arena.service --since "1 hour ago"` clean
- [ ] All open-roadmap items for this phase confirmed shipped
- [ ] `KNOWN_LIMITATIONS.md` updated to reflect the new phase
- [ ] Rollback path tested at least once on the previous SHA via
      `scripts/rollback.sh` — yes, before launch, in a window where
      a brief disruption is acceptable

---

## Operational fire drills (run before phase 2)

These are scenarios that WILL happen in open beta. Practice the
response now while traffic is low.

### Drill 1 — production process crashed

Expected: systemd's `Restart=always` brings it back within ~3s. We
should:
1. confirm service is back: `systemctl status brain-arena.service`
2. check what crashed: `tail /var/log/brain-arena/systemd.log`
3. file a ticket with the stack
4. if crash is reproducible, rollback: `bash scripts/rollback.sh
   <previous-good-sha>`

### Drill 2 — a player reports they were cheated

Expected: we have audit-log persistence (this turn's work). Actions:
1. Pull the match: `GET /api/admin/matches/<id>`
2. Inspect audit flags: `audit_events WHERE matchId = ?`
3. If timing flags fire → manual review of PGN
4. If confirmed: `POST /api/admin/users/<id>/ban` with `reason`

### Drill 3 — bot hammers `/api/auth/signup`

Expected: HTTP rate limit (60/min/IP from `proxy.ts`) bounces them.
Watch for: `429`s in nginx access log, `audit_events` not flooded.

### Drill 4 — Let's Encrypt cert renewal fails

Expected: `certbot.timer` runs daily; if it fails, we get a renewal
error in journalctl. Manual recovery:
```
sudo certbot renew
sudo systemctl reload nginx
```

---

## Communication

- **Status:** owner posts a single sentence per phase transition to
  whatever channel beta users subscribe to.
- **Outage:** if production is down > 5 minutes during phase 2+, the
  owner posts an acknowledgement. The fix landing > 30 minutes warrants
  a one-paragraph post-mortem in the same channel after.
- **Bug reports:** owner triages; engineering lead reproduces in
  staging-via-rollback-branch if necessary.

---

## Out of scope for the entire beta arc

- Real-money payments / deposits / withdrawals
- Anything in Tier ∅ of `PRODUCT_ROADMAP.md`
- Native mobile apps (browser is sufficient through GA)
