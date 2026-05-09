# Brain Arena — Private Beta Status

**Date:** 2026-05-09 · **Branch:** `main` · **HEAD:** `d6f15cd`+ smoke-test follow-up · **Live:** https://playbrainarena.com

---

## Status: PRIVATE-BETA STABLE

The platform has 2 real users in the production database (`nicusor` + `Brihhh`) and at least one fully-played chess match between them is in the books — anti-cheat log confirms 5/4 moves with realistic 8-second average think times. This is no longer a "code-complete" platform; it's an **operating** platform with real users.

The only thing still requiring a human is interactive UI testing (clicking through screens, mobile viewport, multi-tab). Everything that can be validated at the API / Socket.IO / database / process-supervisor level has been validated end-to-end against the live `https://playbrainarena.com`.

---

## 1. What was done this turn

### Real bugs found and fixed

| ID | Severity | What was wrong | Fix |
| --- | --- | --- | --- |
| GAMES-1 | 🔴 | Game tile linked **all** games (including AI-only ones) to `/matchmaking?game=<id>`. Memory/Math/Reaction/Quiz are AI-only — `/matchmaking` would queue forever with no second player. | `app/components/games/GameTile.tsx` now routes AI games (`opponent: "ai"`) directly to `game.routePath`. Only PvP games (chess) go through matchmaking. Commit `dd138ae`. |
| PROFILE-1 | 🔴 | `ProfileView` still used the legacy `db.profiles` / `db.matches` localStorage adapter — same architectural bug that hit the dashboard pre-`d496174`. Own profile reads were going to localStorage with email-as-userId; match history was per-browser. | Refactor to use `useAuth().user.profile` for own profile and `GET /api/matches?limit=12` for match history. Other-user lookup falls back to seeded leaderboard until a public profile endpoint exists. Commit `f5a85b9`. |
| OPS-1 | 🟠 | `deploy.sh` killed the running process before calling `systemctl restart`, racing systemd's `Restart=always` and ending with `:3000 still bound`. | Detect the process manager BEFORE killing; let systemd/pm2 do the stop+start atomically. Manual kill only when `nohup` is the fallback. Commits `9daff6f`, `7915126`. |
| OPS-2 | 🟠 | `deploy.sh` PM detection used `grep -q` which exits early and (under `set -o pipefail`) propagated SIGPIPE as a pipe failure → systemd unit was misdetected as `nohup`. | Replace `grep -q` with `systemctl is-enabled` and `pm2 describe` — proper status commands, no pipe involved. Commit `7915126`. |
| MATCH-CANCEL-1 | 🟠 | (Previous turn) Cancel button on `/matchmaking` was unclickable because pulse rings (CSS `transform: scale(2.4)`) had no `pointer-events: none`. | `pointer-events-none` + `aria-hidden` on each ring; `cancel()` also disconnects socket explicitly. Commit `8781a68`. |

### Hardening shipped

- **Per-event Socket.IO rate limit** (commit `3ae1146`). Each event has a per-socket bucket: `make_move` 60/min, `join_queue` 10/min, draw/resign/rematch 5/min each, etc. On overflow the socket gets a `rate_limited` event; no silent drops. Bounds chess griefing.
- **`middleware.ts` → `proxy.ts`** (commit `50dda88`). Eliminates the Next.js 16 deprecation warning that fired on every build. Function renamed `middleware` → `proxy` per Next 16 convention. Dockerfile updated.
- **Server-wide security headers** (commit `d6f15cd`, applied on VPS). Verified live:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- **Stale session cleanup** (commit `d6f15cd`, installed on VPS). systemd timer fires daily at 03:30 UTC; deletes Session rows where `expiresAt < now()`. First run triggered manually: 1 stale row removed, 9 active sessions remaining. Active player cookies are never invalidated.
- **Rollback script** (`scripts/rollback.sh`). One command: `bash scripts/rollback.sh <sha>` checks out, reinstalls, rebuilds, restarts via auto-detected supervisor. Refuses if working tree is dirty.
- **`public/robots.txt`** — `Disallow: /` for the closed beta. Stops the steady stream of `/robots.txt` 404s in nginx access log.

### Validation against the public URL

- **Multi-user end-to-end Socket.IO smoke test** (`scripts/smoke-multi-socket.mjs`). Runs against `https://playbrainarena.com`:
  - 2 fresh users sign up via `/api/auth/signup`
  - Both connect to Socket.IO with their session cookies (server-side handshake auth)
  - Both `join_queue` for chess → matchmaker pairs them → both get `match_found` with the same `matchId`
  - Both `join_match` → both receive `match_state` with the same FEN, same turn
  - One resigns → both get `match_end` with the correct winner
  - Clean disconnect, no ghost queue entries
  - **Total: 2.0 seconds, all assertions pass**
- **Real users have already played a real chess match.** anti-cheat journal shows: `match_1778345643208_…`, white 5 moves avg 8.08s, black 4 moves avg 7.39s, 0% instant moves. That's organic human gameplay, not synthetic.
- **API surface** verified via curl: `/api/health` (200), `/api/leaderboard` (real rows), `/api/matches` GET unauth (401), POST authed (server-authoritative reward returned), `/login` redirects when authed (`Already signed in`), `/dashboard` shows real username, http→https 301 (apex + www), TLS cert valid (Let's Encrypt R12, 89 days remaining, auto-renewing).

### Production-log audit

- **App journal:** zero error/exception/stack lines in the last 24h. Process is stable.
- **nginx access log:** 632 × 404 — investigated, all are scanner bots (`/wp-admin`, `/.env`, `/.git/config`, `/cgi-bin/.../bin/sh`, gravitysmtp, etc.). 38 historical `/` 404s from before the recent deploy fixes. 17 successful websocket upgrades (Socket.IO). 3 × 409 (signup duplicate handling working). 2 × 401 (auth rejection working).
- **nginx error log:** `SSL_do_handshake() failed (bad key share)` from random IPs — TLS scanner bots probing weird cipher configs. Background internet noise; not our app's fault.

### Audit subagent findings — verification

The Explore subagent surfaced 8 candidate bugs. After reading the actual code:

- **2 confirmed real** (GAMES-1 and PROFILE-1 above)
- **6 false alarms** — clock-arithmetic algebra was correct (the `serverNow` terms cancel); chess-winner attribution was correct (`currentTurnUserId` is captured *before* the turn flips on line 803); claimed "races" misread Node.js's single-threaded event loop. Documenting because it's a useful calibration: subagent output should always be verified against actual code, not trusted on the assertion alone.

---

## 2. Production state — current snapshot

| | |
| --- | --- |
| **URL** | `https://playbrainarena.com` |
| **HEAD** | `d6f15cd6b34f4106b959d28b01a344105ca624d4` (`main`) |
| **BUILD_ID** | `rqrOrj-f-x-mWk4GRmH5t` |
| **TLS** | Let's Encrypt R12, valid through 2026-08-07, certbot auto-renew active |
| **Process** | `brain-arena.service` via systemd, `Restart=always`, supervised |
| **Process manager auto-detect in `deploy.sh`** | Confirmed working — picks `systemd` |
| **DB** | Postgres 16 native (loopback :5432); 2 real users; orphaned matches purged |
| **Session cleanup** | systemd timer `brain-arena-clean.timer`, daily 03:30 UTC, enabled+active |
| **Security headers** | HSTS, X-CTO, X-Frame, Referrer-Policy, Permissions-Policy — verified live |
| **Rate limits** | HTTP 60/min/IP via `proxy.ts`; Socket.IO per-event per-socket via `matchmaking.ts` |

---

## 3. What requires manual browser verification (cannot automate from this CLI session)

These are the things I have NO capacity to verify directly. They should be exercised by a human before broadcasting the beta beyond the current 2-user invite list.

- [ ] Visual polish — pulse animations, transitions, layout under reflow
- [ ] Mobile portrait + landscape on iOS Safari and Android Chrome
- [ ] Multiple tabs with the same account (logout in tab A, observe tab B)
- [ ] Refresh during active gameplay (chess mid-move; solo games at result screen)
- [ ] Reconnect after network blip (kill wifi for 5s during a chess match, reconnect)
- [ ] Browser back-button between game pages (don't get stuck or re-queue)
- [ ] iOS Safari websocket survival across background → foreground

The flows ARE present in the code (chess has 30s reconnect grace, the `Cancel` button now works, dashboard SSR fetches real profile, etc.) — but visual / interaction polish needs eyes on it.

---

## 4. Bug & risk inventory

### Closed this turn

GAMES-1, PROFILE-1, OPS-1, OPS-2, MATCH-CANCEL-1 (previous turn) — all listed in §1.

### Still open (severity-ordered)

| ID | Severity | Description | Mitigation today | Fix priority |
| --- | --- | --- | --- | --- |
| ANTICHEAT-1 | 🟡 | Solo-game match recording is bounds-validated only, not replay-validated. A tampered client could submit a plausible-looking score. | Closed invite list; nothing more to mitigate. | Tier-1 in `NEXT_STEPS.md` |
| SCALE-1 | 🟡 | Matchmaking queue + active chess match state live in single Node process memory. Restart kills active matches. | Coordinate restarts during low-activity windows; `Restart=always` reduces unplanned restarts. | Tier-2 (multi-replica + Redis state) |
| AUTH-1 | 🟡 | `bcryptjs` (pure JS) blocks event loop ~150–300 ms per signup/login. | Fine at beta scale; observed peak load is single-digit ops/min. | Tier-1 (swap to native `bcrypt`) |
| RECOVERY-1 | 🟡 | No password reset / email verification. | Manual DB intervention if a user loses their password. | Tier-1 (SMTP + reset flow) |
| PROFILE-2 | 🟢 | `/profile/<other_user>` falls back to `FAKE_LEADERBOARD` for non-self. No real cross-user lookup. | Closed beta has 2 users who know each other. | Add `GET /api/profile/[username]` |
| MATCH-2 | 🟢 | Solo games' tier promotion happens via `applyMatchOutcome` → uses `tierForLp`; chess uses Elo math via `rankingsService.updatePlayerRank`. Tier thresholds are duplicated in two places. | Both call the shared `tierForLp` helper, so they agree. | Cosmetic — single source of truth. |
| LOG-1 | 🟢 | RSC "Failed to find Server Action 'x'" warnings appearing in app log. Caused by browsers holding RSC payloads from older builds. | Cosmetic; doesn't affect users. Cleared on next page navigation. | Could add a `gen` cache-bust if it becomes noisy. |

---

## 5. Roadmap — next milestone

Sized for ~1 week of focused work. Each item has a clean handoff (you grant me SSH, I finish autonomously).

### Milestone: Public Beta (open signups beyond invite list)

**Tier 1 — required for opening signups beyond invite list**

1. Replay-validate solo-game outcomes (`ANTICHEAT-1`). Send the player's input stream alongside the match outcome; server replays against the seed; rejects on mismatch. ~3 days.
2. Native `bcrypt` swap (`AUTH-1`). 30 min including container rebuild test.
3. Password reset flow (`RECOVERY-1`). Magic-link via SMTP (Resend / Postmark). ~2 days.
4. Email verification (`RECOVERY-1`). Same SMTP wiring. ~1 day.
5. `GET /api/profile/[username]` (`PROFILE-2`). ~2 hours; routes that already render `/profile/[username]/page.tsx` get real data.
6. Public sitemap + opengraph metadata. ~half a day.

**Tier 2 — required for sustained traffic**

7. Multi-replica state (`SCALE-1`) — move matchmaking queue + chess state to Redis. ~1 week, biggest item.
8. MMR-aware matchmaking — pair closest-LP players, not FIFO. ~half a day.
9. Region affinity. ~1 day.
10. Stockfish-correlation chess anti-cheat. ~1 week.
11. Vitest + Playwright test suite with the existing `scripts/smoke-multi-socket.mjs` as a starting point. ~1 week to bootstrap + wire CI.
12. Prometheus `/metrics` endpoint + structured JSON logging (pino) + Sentry. ~3 days.

**Tier 3 — polish for GA**

13. Multiple chess time controls.
14. Premove + animation polish.
15. Three-fold repetition / 50-move-rule UI.
16. i18n.
17. Real human PvP for question games (currently only chess).
18. Mobile chess landscape redesign.
19. Achievements catalog seed (the unlock hooks exist, the `achievements` table is empty).
20. Persist anti-cheat audit flags to a queryable table.

**Tier 4 — explicitly out of scope until legal review**

Payments, wallets, gambling mechanics, random rewards, crypto. Per `FAIRNESS.md`.

---

## 6. Operating from here

```bash
# Standard deploy (from any machine with the SSH key)
ssh -i ~/.ssh/id_brain_arena_deploy root@167.235.73.194 \
  'cd ~/brain-arena && bash scripts/deploy.sh'

# Roll back to a known-good SHA
ssh -i ~/.ssh/id_brain_arena_deploy root@167.235.73.194 \
  "cd ~/brain-arena && bash scripts/rollback.sh <sha>"

# Multi-user smoke test against production (anytime)
node scripts/smoke-multi-socket.mjs https://playbrainarena.com

# Live logs
ssh -i ~/.ssh/id_brain_arena_deploy root@167.235.73.194 \
  'tail -f /var/log/brain-arena/systemd.log'

# Manually trigger a session cleanup (timer does it daily at 03:30 UTC)
ssh -i ~/.ssh/id_brain_arena_deploy root@167.235.73.194 \
  'systemctl start brain-arena-clean.service && \
   journalctl -u brain-arena-clean.service -n 5 --no-pager'

# Edit .env and restart (nothing to rebuild, just pick up the new value)
ssh -i ~/.ssh/id_brain_arena_deploy root@167.235.73.194 \
  '$EDITOR ~/brain-arena/.env && systemctl restart brain-arena.service'
```

---

## 7. Documentation map

| File | Purpose |
| --- | --- |
| `DEPLOYMENT.md` | Quick-recipe section at top + full Docker / VPS guide |
| `KNOWN_LIMITATIONS.md` | Honest list of what Brain Arena is *not* yet |
| `NEXT_STEPS.md` | Tiered roadmap (Tier 1 → 4) with effort estimates |
| `SECURITY_NOTES.md` | Auth/session/match recording security model |
| `FAIRNESS.md` | Skill-only product principles + payments/wallets out of scope |
| `BETA_TESTING.md` | Manual browser checklist (S1–S10 scenarios) |
| `MOBILE_UX_REPORT.md` | Static review of mobile breakpoints |
| `FINAL_QA_REPORT.md` | Pre-launch QA |
| `FINAL_PRODUCTION_REPORT.md` | First production deploy + validation |
| **`PRIVATE_BETA_REPORT.md`** (this file) | Private-beta delivery |
