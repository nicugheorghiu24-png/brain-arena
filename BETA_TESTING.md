# Brain Arena — Beta Testing Guide

Welcome to the Brain Arena beta. This guide tells you what to try, what
to expect, and how to report issues.

## What's in the beta

- **Game Hub** at `/games` listing five experiences: Logic Quiz,
  Memory Match, Reaction Duel, and Math Sprint (all vs deterministic AI),
  plus Chess Arena (real-time human PvP).
- **Real-time multiplayer chess** with server-authoritative validation,
  5+5 time control, draw offers, resignation, rematches, and
  spectator mode.
- **Server-authoritative match recording.** All five games persist to
  Postgres via `POST /api/matches` (or the chess Socket.IO end-of-match
  flow). LP / XP / level / tier are computed server-side; the client
  cannot self-award progression.
- **Ranked progression**: per-account LP (Elo for chess, fixed-delta
  for solo), tier/division promotion (Bronze → Master), live
  leaderboard at `/leaderboard` reading from `/api/leaderboard`.
- **Account system**: email + password signup, sessions persisted to
  Postgres, dashboard with match history.

## Getting set up

1. Sign up at `/register`. Username is 3–20 chars, letters / numbers /
   underscore / hyphen.
2. Confirm you land on the dashboard.
3. Open `/games` and pick a duel.

## Test scenarios

### S1 — Game Hub
- [ ] All five tiles render.
- [ ] Each "Play" button leads to `/matchmaking?game=<id>`.
- [ ] Mobile (≤ 400 px viewport) lays out single-column without
      horizontal scroll.

### S2 — Chess matchmaking
- [ ] Open two browsers (or two private windows) with two accounts.
- [ ] Both queue for chess from `/games`.
- [ ] Both redirect to `/chess?matchId=…` and see the same starting
      position.
- [ ] White's clock is ticking, black's is paused.
- [ ] Each player sees themselves on the bottom of the board (board
      flips for black).

### S3 — Chess play
- [ ] Make a few moves. The other client receives them within a second.
- [ ] Tap a piece to see legal-move dots; capture squares show the
      fuchsia frame.
- [ ] When in check, the king's square shows a red ring.
- [ ] Promote a pawn (move to 8th / 1st rank). The Q/R/B/N chooser
      appears; choosing the piece sends the move.

### S4 — Clocks
- [ ] Active clock counts down smoothly (200 ms tick).
- [ ] Making a move adds 5 s and starts opponent's clock.
- [ ] Under 30 s the clock turns amber; under 10 s it turns red and
      pulses.
- [ ] If a player runs out of time, the match ends with reason "time
      forfeit" and the opponent wins.

### S5 — Disconnect / reconnect
- [ ] During a live game, kill the network on one client (toggle
      airplane mode).
- [ ] The other client sees an "Opponent disconnected — auto-forfeit
      in 30 s" banner with a live countdown.
- [ ] Reconnect within 30 s: the banner clears, both players see a
      success toast, the game continues from the same position.
- [ ] Reconnect after 30 s: the still-connected player wins by
      "opponent disconnected".

### S6 — Resign / draw / rematch
- [ ] Resign: the resigner sees "Defeat", the opponent sees "Victory",
      reason "resignation".
- [ ] Both players offer a draw: match ends "Draw — mutual draw
      agreement".
- [ ] After a result, both players click Request Rematch: a fresh game
      begins, clocks reset to 5+5.

### S7 — Spectator
- [ ] Open `/chess?matchId=<live id>&spectate=1` in a third browser.
- [ ] You see the live board, paired move history, both clocks, and
      the captured-pieces panel.
- [ ] Controls (offer draw / resign / rematch) are hidden; instead a
      "Spectator mode" panel is shown.

### S8 — Edge cases
- [ ] Refresh `/chess?matchId=…` mid-game: state is reloaded and play
      resumes.
- [ ] Try to queue twice from the same account (two tabs): the second
      gets a "Matchmaking error: Already in queue." toast.
- [ ] Open `/chess?matchId=does-not-exist`: shows "Match unavailable"
      with a "Find another match" CTA.

### S9 — Solo games (vs AI)
All four are solo against a deterministic AI opponent; the result still
counts toward your LP / XP / leaderboard.
- [ ] Logic Quiz (`/arena`): you see 5 questions in a deterministic
      order based on the match seed. Bot answers with a configured
      accuracy.
- [ ] Memory Match, Reaction Duel, Math Sprint render and complete
      without crashes.
- [ ] After each game ends: open `/dashboard` and confirm Match
      History shows the game with non-zero LP delta. Open in
      incognito → log in → confirm history is the **same** (proves
      it's persisted to Postgres, not browser localStorage).

### S10 — Account
- [ ] Logout from the navbar; refresh; you should land on `/` not the
      dashboard.
- [ ] Sign in again; match history populates from earlier matches.

## What to report

When you find a bug, please send:

- **What you did**: a numbered list of steps to reproduce.
- **What you expected** vs **what happened**.
- **Browser + OS** (Chrome 130 / iOS 17 / etc.).
- **Approximate time** (helps correlate with server logs).
- **Match ID** (visible in the chess sidebar) if relevant.
- A screenshot or short screen capture if the visual is the bug.

## What's known weak (do not file these as bugs)

- See `KNOWN_LIMITATIONS.md` for a full list. Highlights:
  - Single time control (5+5) only.
  - No engine-cheat detection — please don't run Stockfish against your
    friends.
  - Mobile portrait stacks the board and sidebar; you'll scroll.
  - Some Romanian copy on the dashboard.

## What's explicitly out of scope

- **Payments, wallets, gambling, crypto.** Not in this build, not in
  this product. See `FAIRNESS.md`.

## Reporting an issue

Email or DM the engineering team with the report template above.
For mass test sessions, please coordinate so the in-process queue
isn't churning while we're trying to debug a single match.

Thank you for helping us ship Brain Arena.
