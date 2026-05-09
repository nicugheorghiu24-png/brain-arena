import { Server as HTTPServer } from "http";
import { randomBytes } from "node:crypto";
import { Server as SocketIOServer, Socket } from "socket.io";
import { Chess } from "chess.js";
import { isDbConfigured, requirePrisma } from "./prisma";
import { rankingsService } from "./services/rankings";
import { achievementsService } from "./services/achievements";

/**
 * Cryptographically random 53-bit BigInt for shared match seeds. We cap
 * at MAX_SAFE_INTEGER so the seed survives a JS-number round-trip (the
 * client uses the seed in deterministic question generation that runs
 * on Number, not BigInt). 53 bits is plenty against pre-computation
 * attacks on the question set.
 */
function generateMatchSeed(): bigint {
  // 6 bytes = 48 bits, fits comfortably in a JS Number for client-side
  // deterministic question generation. 48 bits = 2^48 distinct seeds is
  // ample (≈281 trillion). Avoids BigInt literals so this compiles
  // against ES2017 target.
  const buf = randomBytes(6);
  const SHIFT = BigInt(8);
  let n = BigInt(0);
  for (const b of buf) n = (n << SHIFT) | BigInt(b);
  return n;
}

// Match the cookie name set by app/lib/auth/server.ts. Kept inline to
// avoid a server-only import chain (this module is loaded by server.js).
const SESSION_COOKIE = "ba_session";

type SocketAuth = { userId: string; username: string };

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

async function authFromCookie(
  cookieHeader: string | undefined,
): Promise<SocketAuth | null> {
  if (!isDbConfigured()) return null;
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const prisma = requirePrisma();
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { profile: true } } },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    if (!session.user.profile) return null;
    return {
      userId: session.user.id,
      username: session.user.profile.username,
    };
  } catch {
    return null;
  }
}

export type MatchmakingPlayer = {
  socketId: string;
  userId: string;
  username: string;
  gameId: string;
  joinedAt: Date;
  ready: boolean;
};

export type Match = {
  id: string;
  gameId: string;
  players: [MatchmakingPlayer, MatchmakingPlayer];
  seed: bigint;
  createdAt: Date;
};

type ChessMatchState = {
  match: Match;
  chess: InstanceType<typeof Chess>;
  fen: string;
  pgn: string;
  turn: "w" | "b";
  moveHistory: string[];
  startedAt: Date;
  endedAt?: Date;
  result?: {
    outcome: "win" | "loss" | "draw";
    winnerId?: string;
    reason: string;
  };
  drawOffers: Set<string>;
  spectators: Set<string>;
  rematchRequests: Set<string>;
  // Per-move think times in ms, indexed by move number (parallel to
  // moveHistory). Used by the anti-cheat audit at end-of-match.
  moveTimes: number[];
  // Map from disconnected player's userId → forfeit timer. Cleared when
  // the player reconnects via join_match.
  disconnectTimers: Map<string, NodeJS.Timeout>;
  // Chess clock: total ms remaining per side, plus the wall-clock time
  // when the active player's clock began ticking. clockTurnStartedAt = 0
  // means "not running" (pre-game / post-game).
  whiteMs: number;
  blackMs: number;
  clockTurnStartedAt: number;
  timeoutTimer: NodeJS.Timeout | null;
};

// Grace period before a chess disconnect is treated as a forfeit. Real
// production might tune this per-game or per-tier; 30s covers the common
// "wifi blip" case without letting players abandon indefinitely.
const CHESS_DISCONNECT_GRACE_MS = 30_000;

// Chess clock: 5+5 (5 minutes per side, 5-second increment per move).
// Authoritative on the server; clients render a tween off the broadcast.
const CHESS_INITIAL_MS = 5 * 60 * 1000;
const CHESS_INCREMENT_MS = 5 * 1000;

// How long ended matches linger in memory before being reaped. Keeps
// the final state available to reconnecting clients but bounds growth.
const ENDED_MATCH_REAP_MS = 60_000;

type ChessAuditFlag =
  | "instant_moves"
  | "metronomic_timing"
  | "long_engine_grade"; // placeholder for future engine-correlation work

/**
 * Lightweight chess timing audit. Returns flags + summary stats so we
 * can log them and persist them later without committing to any auto-
 * action policy yet. Per-color stats are split by even/odd move index
 * because moveTimes is parallel to moveHistory (white moves first).
 */
function auditChessMatch(state: ChessMatchState): {
  flags: { white: ChessAuditFlag[]; black: ChessAuditFlag[] };
  stats: {
    white: { moves: number; avgMs: number; medianMs: number; instantPct: number };
    black: { moves: number; avgMs: number; medianMs: number; instantPct: number };
  };
} {
  const whiteTimes: number[] = [];
  const blackTimes: number[] = [];
  for (let i = 0; i < state.moveTimes.length; i++) {
    (i % 2 === 0 ? whiteTimes : blackTimes).push(state.moveTimes[i]);
  }

  function summarize(times: number[]) {
    if (times.length === 0) {
      return { moves: 0, avgMs: 0, medianMs: 0, instantPct: 0 };
    }
    const sorted = [...times].sort((a, b) => a - b);
    const sum = sorted.reduce((s, x) => s + x, 0);
    const median = sorted[Math.floor(sorted.length / 2)];
    const instantCount = sorted.filter((x) => x < 200).length;
    return {
      moves: times.length,
      avgMs: Math.round(sum / times.length),
      medianMs: median,
      instantPct: instantCount / times.length,
    };
  }

  function flag(times: number[]): ChessAuditFlag[] {
    if (times.length < 8) return []; // not enough samples to be meaningful
    const flags: ChessAuditFlag[] = [];
    const stats = summarize(times);
    // >40% sub-200ms moves is implausible for a thinking human (premoves
    // and obvious recaptures aside).
    if (stats.instantPct > 0.4) flags.push("instant_moves");
    // Metronomic = very low variance around the mean across many moves.
    const mean = stats.avgMs;
    const variance =
      times.reduce((s, x) => s + (x - mean) ** 2, 0) / times.length;
    const stddev = Math.sqrt(variance);
    if (mean > 500 && stddev / mean < 0.15) {
      flags.push("metronomic_timing");
    }
    return flags;
  }

  return {
    flags: { white: flag(whiteTimes), black: flag(blackTimes) },
    stats: { white: summarize(whiteTimes), black: summarize(blackTimes) },
  };
}

class MatchmakingQueue {
  private queue: Map<string, MatchmakingPlayer[]> = new Map();
  private activeMatches: Map<string, Match> = new Map();
  private activeChessMatches: Map<string, ChessMatchState> = new Map();
  private playerToMatch: Map<string, string> = new Map();

  addPlayer(player: MatchmakingPlayer): { ok: true } | { ok: false; reason: string } {
    // Reject duplicates: same userId already queued or already in an
    // active match. Without this a stuck client could pile up multiple
    // queue entries with different socket ids.
    for (const players of this.queue.values()) {
      if (players.some((p) => p.userId === player.userId)) {
        return { ok: false, reason: "Already in queue." };
      }
    }
    for (const match of this.activeMatches.values()) {
      const existing = match.players.find((p) => p.userId === player.userId);
      if (existing) {
        const state = this.activeChessMatches.get(match.id);
        if (!state || !state.endedAt) {
          return { ok: false, reason: "Already in an active match." };
        }
      }
    }

    const gameQueue = this.queue.get(player.gameId) || [];
    gameQueue.push(player);
    this.queue.set(player.gameId, gameQueue);

    this.tryMatch(player.gameId);
    return { ok: true };
  }

  removePlayer(socketId: string) {
    for (const [gameId, players] of this.queue.entries()) {
      const index = players.findIndex((p) => p.socketId === socketId);
      if (index !== -1) {
        players.splice(index, 1);
        if (players.length === 0) {
          this.queue.delete(gameId);
        }
        break;
      }
    }

    const matchId = this.playerToMatch.get(socketId);
    if (matchId) {
      const match = this.activeMatches.get(matchId);
      if (match) {
        this.handleDisconnect(match, socketId);
      }
      // Drop the old socket→match binding. The match itself stays in
      // activeMatches/activeChessMatches so the player can rejoin via
      // joinMatch(), which rebinds them by userId.
      this.playerToMatch.delete(socketId);
    }

    for (const state of this.activeChessMatches.values()) {
      state.spectators.delete(socketId);
    }
  }

  getMatchForPlayer(socketId: string): Match | null {
    const matchId = this.playerToMatch.get(socketId);
    return matchId ? this.activeMatches.get(matchId) || null : null;
  }

  /**
   * Snapshot of queue + match state for /api/admin/metrics. Cheap —
   * just iterates Maps that are small at beta scale. Don't call this
   * on a hot path.
   */
  snapshot(): {
    queueDepth: Record<string, number>;
    queueDepthTotal: number;
    activeMatches: number;
    activeChessMatches: number;
    activeChessMatchesEnded: number;
    boundSockets: number;
    spectators: number;
  } {
    const queueDepth: Record<string, number> = {};
    let queueDepthTotal = 0;
    for (const [gameId, players] of this.queue.entries()) {
      queueDepth[gameId] = players.length;
      queueDepthTotal += players.length;
    }
    let activeChessMatchesEnded = 0;
    let spectators = 0;
    for (const state of this.activeChessMatches.values()) {
      if (state.endedAt) activeChessMatchesEnded += 1;
      spectators += state.spectators.size;
    }
    return {
      queueDepth,
      queueDepthTotal,
      activeMatches: this.activeMatches.size,
      activeChessMatches: this.activeChessMatches.size,
      activeChessMatchesEnded,
      boundSockets: this.playerToMatch.size,
      spectators,
    };
  }

  setPlayerReady(socketId: string, ready: boolean) {
    const matchId = this.playerToMatch.get(socketId);
    if (!matchId) return;

    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const player = match.players.find((p) => p.socketId === socketId);
    if (player) {
      player.ready = ready;
    }

    if (match.players.every((p) => p.ready)) {
      this.startMatch(match);
    }
  }

  private tryMatch(gameId: string) {
    const gameQueue = this.queue.get(gameId);
    if (!gameQueue || gameQueue.length < 2) return;

    const player1 = gameQueue.shift()!;
    const player2 = gameQueue.shift()!;

    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const seed = generateMatchSeed();

    const match: Match = {
      id: matchId,
      gameId,
      players: [player1, player2],
      seed,
      createdAt: new Date(),
    };

    this.activeMatches.set(matchId, match);
    this.playerToMatch.set(player1.socketId, matchId);
    this.playerToMatch.set(player2.socketId, matchId);

    this.saveMatchToDB(match).catch((error) => {
      console.error("Failed to save match metadata:", error);
    });

    // Chess has no client-side ready handshake — initialise the
    // server-authoritative state and start White's clock now, so when the
    // players land on /chess?matchId=… joinMatch can hand them a live
    // board immediately.
    if (gameId === "chess") {
      const chessState = this.createChessMatchState(match);
      this.activeChessMatches.set(matchId, chessState);
      this.startChessTurn(chessState);
    }

    const io = getIO();
    if (io) {
      io.to(player1.socketId).emit("match_found", {
        matchId,
        opponent: { username: player2.username },
        seed: match.seed.toString(),
      });
      io.to(player2.socketId).emit("match_found", {
        matchId,
        opponent: { username: player1.username },
        seed: match.seed.toString(),
      });
    }

    return match;
  }

  private async saveMatchToDB(match: Match) {
    const { difficulty, rounds } = this.matchMetadata(match.gameId);
    const prisma = requirePrisma();
    await prisma.match.create({
      data: {
        id: match.id,
        gameId: match.gameId,
        matchSeed: match.seed,
        difficulty,
        rounds,
        durationMs: 0,
      },
    });
  }

  private matchMetadata(gameId: string) {
    if (gameId === "chess") {
      return { difficulty: "standard", rounds: 1 };
    }
    return { difficulty: "normal", rounds: 10 };
  }

  private handleDisconnect(match: Match, socketId: string) {
    const state = this.activeChessMatches.get(match.id);
    if (state && !state.endedAt) {
      const disconnected = match.players.find(
        (player) => player.socketId === socketId,
      );
      const opponent = match.players.find((player) => player.socketId !== socketId);
      if (!disconnected || !opponent) return;

      // Don't double-schedule for the same player.
      if (state.disconnectTimers.has(disconnected.userId)) return;

      // Tell the opponent there's a wifi blip in progress so the UI can
      // show "opponent disconnected — 30s grace".
      const io = getIO();
      io?.to(opponent.socketId).emit("opponent_disconnected", {
        userId: disconnected.userId,
        graceMs: CHESS_DISCONNECT_GRACE_MS,
      });

      const timer = setTimeout(() => {
        // Re-check at fire time: the player may have rejoined.
        const current = this.activeChessMatches.get(match.id);
        if (!current || current.endedAt) return;
        const stillDisconnected = !current.match.players.find(
          (p) => p.userId === disconnected.userId && p.socketId !== socketId,
        );
        if (!stillDisconnected) return;
        this.endChessMatch(current, {
          outcome: "win",
          winnerId: opponent.userId,
          reason: "opponent disconnected",
        }).catch((error) =>
          console.error("Failed to finalize disconnected chess match:", error),
        );
      }, CHESS_DISCONNECT_GRACE_MS);

      state.disconnectTimers.set(disconnected.userId, timer);
      // Important: keep the match alive. Cleanup happens in endChessMatch
      // (or when both players have left and the timer fires).
      return;
    }

    // Non-chess matches (or chess matches already ended) get the legacy
    // immediate-cleanup behavior.
    this.activeMatches.delete(match.id);
    this.activeChessMatches.delete(match.id);
    this.playerToMatch.delete(match.players[0].socketId);
    this.playerToMatch.delete(match.players[1].socketId);
  }

  private startMatch(match: Match) {
    const io = getIO();
    if (!io) return;

    let countdown = 3;
    const countdownInterval = setInterval(() => {
      io.to(match.players[0].socketId).emit("countdown", countdown);
      io.to(match.players[1].socketId).emit("countdown", countdown);
      countdown--;
      if (countdown < 0) {
        clearInterval(countdownInterval);
        if (match.gameId === "chess") {
          const chessState = this.createChessMatchState(match);
          this.activeChessMatches.set(match.id, chessState);
          this.broadcastChessState(chessState);
        }

        io.to(match.players[0].socketId).emit("match_start", {
          matchId: match.id,
          opponent: match.players[1].username,
          white: {
            userId: match.players[0].userId,
            username: match.players[0].username,
          },
          black: {
            userId: match.players[1].userId,
            username: match.players[1].username,
          },
        });
        io.to(match.players[1].socketId).emit("match_start", {
          matchId: match.id,
          opponent: match.players[0].username,
          white: {
            userId: match.players[0].userId,
            username: match.players[0].username,
          },
          black: {
            userId: match.players[1].userId,
            username: match.players[1].username,
          },
        });
      }
    }, 1000);
  }

  private createChessMatchState(match: Match): ChessMatchState {
    const chess = new Chess();
    return {
      match,
      chess,
      fen: chess.fen(),
      pgn: chess.pgn(),
      turn: "w",
      moveHistory: [],
      startedAt: new Date(),
      drawOffers: new Set(),
      spectators: new Set(),
      rematchRequests: new Set(),
      moveTimes: [],
      disconnectTimers: new Map(),
      whiteMs: CHESS_INITIAL_MS,
      blackMs: CHESS_INITIAL_MS,
      clockTurnStartedAt: 0,
      timeoutTimer: null,
    };
  }

  /**
   * Start (or restart) the active player's clock. Schedules a timeout
   * timer that auto-ends the match if the player runs out of time.
   * Always pair with a broadcastChessState so clients receive the new
   * clockTurnStartedAt baseline.
   */
  private startChessTurn(state: ChessMatchState) {
    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
    }
    if (state.endedAt) return;

    state.clockTurnStartedAt = Date.now();
    const remaining = state.turn === "w" ? state.whiteMs : state.blackMs;

    state.timeoutTimer = setTimeout(() => {
      const current = this.activeChessMatches.get(state.match.id);
      if (!current || current.endedAt) return;
      const losingColor = current.turn;
      const winner =
        losingColor === "w" ? current.match.players[1] : current.match.players[0];
      // Zero out the loser's clock so the final broadcast is honest.
      if (losingColor === "w") current.whiteMs = 0;
      else current.blackMs = 0;
      current.clockTurnStartedAt = 0;
      this.endChessMatch(current, {
        outcome: "win",
        winnerId: winner.userId,
        reason: "time forfeit",
      }).catch((err) => console.error("Failed to finalize time forfeit:", err));
    }, remaining);
  }

  private buildChessStatePayload(state: ChessMatchState) {
    return {
      matchId: state.match.id,
      white: {
        userId: state.match.players[0].userId,
        username: state.match.players[0].username,
      },
      black: {
        userId: state.match.players[1].userId,
        username: state.match.players[1].username,
      },
      fen: state.fen,
      pgn: state.pgn,
      turn: state.turn,
      moveHistory: state.moveHistory,
      drawOffers: Array.from(state.drawOffers),
      result: state.result,
      clocks: {
        whiteMs: state.whiteMs,
        blackMs: state.blackMs,
        // 0 means "stopped"; clients use this + serverNow to interpolate.
        turnStartedAt: state.clockTurnStartedAt,
        incrementMs: CHESS_INCREMENT_MS,
        initialMs: CHESS_INITIAL_MS,
      },
      serverNow: Date.now(),
    };
  }

  private broadcastChessState(state: ChessMatchState) {
    const io = getIO();
    if (!io) return;

    const payload = this.buildChessStatePayload(state);
    const recipients = new Set<string>([
      state.match.players[0].socketId,
      state.match.players[1].socketId,
      ...state.spectators,
    ]);

    for (const socketId of recipients) {
      io.to(socketId).emit("match_state", payload);
    }
  }

  private async endChessMatch(
    state: ChessMatchState,
    override: { outcome: "win" | "loss" | "draw" | string; winnerId?: string; reason: string },
  ) {
    if (state.endedAt) return;
    state.endedAt = new Date();
    state.result = {
      outcome: override.outcome === "draw" ? "draw" : "win",
      winnerId: override.winnerId,
      reason: override.reason,
    };

    // Cancel any pending disconnect-forfeit timers — match is finalizing.
    for (const timer of state.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    state.disconnectTimers.clear();
    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
    }
    state.clockTurnStartedAt = 0;

    const match = state.match;
    const white = match.players[0];
    const black = match.players[1];

    const whiteResult = this.resolveChessResult("w", state, override, white.userId);
    const blackResult = this.resolveChessResult("b", state, override, black.userId);

    const durationMs = state.endedAt.getTime() - state.startedAt.getTime();
    const whiteScore = whiteResult === "win" ? 3 : whiteResult === "draw" ? 1 : 0;
    const blackScore = blackResult === "win" ? 3 : blackResult === "draw" ? 1 : 0;

    const prisma = requirePrisma();
    await prisma.match.update({
      where: { id: match.id },
      data: {
        durationMs,
        results: {
          create: [
            {
              userId: white.userId,
              playerName: white.username,
              opponentName: black.username,
              result: whiteResult,
              scoreSelf: whiteScore,
              scoreOpponent: blackScore,
              lpDelta: 0,
              xpGained: 30,
            },
            {
              userId: black.userId,
              playerName: black.username,
              opponentName: white.username,
              result: blackResult,
              scoreSelf: blackScore,
              scoreOpponent: whiteScore,
              lpDelta: 0,
              xpGained: 30,
            },
          ],
        },
      },
    });

    const whiteProfile = await prisma.profile.findUnique({ where: { userId: white.userId } });
    const blackProfile = await prisma.profile.findUnique({ where: { userId: black.userId } });
    if (whiteProfile && blackProfile) {
      const whiteRank = await rankingsService.updatePlayerRank(
        white.userId,
        blackProfile.lp,
        whiteResult as "win" | "loss" | "draw",
      );
      const blackRank = await rankingsService.updatePlayerRank(
        black.userId,
        whiteProfile.lp,
        blackResult as "win" | "loss" | "draw",
      );

      // Abandon penalty: if this match ended because someone left
      // mid-game, the loser eats an extra LP penalty on top of the
      // Elo loss. Tracked in Profile.abandonCount and recorded as an
      // audit event. See COMPETITIVE_SYSTEMS.md.
      const ABANDON_LP_PENALTY = 10;
      if (override.reason === "opponent disconnected") {
        const loser = whiteResult === "loss" ? white : black;
        const loserProfile = whiteResult === "loss" ? whiteProfile : blackProfile;
        await prisma.profile.update({
          where: { userId: loser.userId },
          data: {
            lp: { decrement: Math.min(ABANDON_LP_PENALTY, loserProfile.lp) },
            abandonCount: { increment: 1 },
          },
        });
        await prisma.auditEvent.create({
          data: {
            userId: loser.userId,
            matchId: match.id,
            category: "abandon",
            severity: "warn",
            flags: ["disconnect_forfeit"],
            details: {
              lpPenalty: ABANDON_LP_PENALTY,
              reason: override.reason,
              moveCount: state.moveHistory.length,
            },
          },
        });
      }

      // Sync the MatchResult rows with what the ranking service actually
      // applied (Elo delta + per-result XP). Without this, the match
      // history would show the placeholder values written above.
      await prisma.matchResult.updateMany({
        where: { matchId: match.id, userId: white.userId },
        data: { lpDelta: whiteRank.lpDelta, xpGained: whiteRank.xpGained },
      });
      await prisma.matchResult.updateMany({
        where: { matchId: match.id, userId: black.userId },
        data: { lpDelta: blackRank.lpDelta, xpGained: blackRank.xpGained },
      });
    }

    await achievementsService.unlockIfExists(white.userId, "chess_checkmate");
    await achievementsService.unlockIfExists(black.userId, "chess_participant");

    // Audit-only: log timing anomalies. Persisting these to a dedicated
    // table is a follow-up; for now stdout + a Match.id reference is
    // enough to spot patterns in beta.
    try {
      const audit = auditChessMatch(state);
      // Persist to audit_events for admin triage. One row per side
      // when there are flags; "info" severity per-side when clean
      // so we have a baseline distribution to tune thresholds against.
      const writes: Promise<unknown>[] = [];
      for (const [side, player] of [
        ["white", white],
        ["black", black],
      ] as const) {
        const flags = audit.flags[side];
        const stats = audit.stats[side];
        if (flags.length === 0) continue;
        writes.push(
          prisma.auditEvent.create({
            data: {
              userId: player.userId,
              matchId: match.id,
              category: "chess_timing",
              severity: "warn",
              flags,
              details: { side, stats },
            },
          }),
        );
      }
      if (writes.length > 0) {
        await Promise.all(writes);
      }
    } catch (err) {
      console.error("Failed to persist chess audit:", err);
    }

    const io = getIO();
    if (io) {
      const resultPayload = {
        matchId: match.id,
        outcome: state.result,
        white: { userId: white.userId, username: white.username, result: whiteResult },
        black: { userId: black.userId, username: black.username, result: blackResult },
      };
      this.broadcastChessState(state);
      io.to(white.socketId).emit("match_end", resultPayload);
      io.to(black.socketId).emit("match_end", resultPayload);
      for (const spectator of state.spectators) {
        io.to(spectator).emit("match_end", resultPayload);
      }
    }

    // Reap the in-memory state after a grace window so reconnecting
    // clients can still pull the final position + result, but we don't
    // accumulate ended matches forever.
    setTimeout(() => {
      this.activeMatches.delete(match.id);
      this.activeChessMatches.delete(match.id);
      // Drop any lingering socket→match bindings for this match's players.
      for (const [socketId, mid] of this.playerToMatch.entries()) {
        if (mid === match.id) this.playerToMatch.delete(socketId);
      }
    }, ENDED_MATCH_REAP_MS);
  }

  private resolveChessResult(
    color: "w" | "b",
    state: ChessMatchState,
    override: { outcome: "win" | "loss" | "draw" | string; winnerId?: string },
    userId: string,
  ): "win" | "loss" | "draw" {
    if (override.outcome === "draw") return "draw";
    if (override.winnerId) {
      return override.winnerId === userId ? "win" : "loss";
    }

    if (state.chess.isCheckmate()) {
      const winnerColor = state.chess.turn() === "w" ? "black" : "white";
      return winnerColor === "white"
        ? color === "w"
          ? "win"
          : "loss"
        : color === "b"
        ? "win"
        : "loss";
    }

    if (state.chess.isDraw()) {
      return "draw";
    }

    return "draw";
  }

  private async createRematch(match: Match) {
    const newMatchId = `rematch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const seed = generateMatchSeed();
    const newMatch: Match = {
      id: newMatchId,
      gameId: match.gameId,
      players: [match.players[0], match.players[1]],
      seed,
      createdAt: new Date(),
    };

    // Free the previous match's state immediately — clients have already
    // accepted the rematch request, so no one's listening on the old id.
    this.activeMatches.delete(match.id);
    this.activeChessMatches.delete(match.id);

    this.activeMatches.set(newMatchId, newMatch);
    this.playerToMatch.set(match.players[0].socketId, newMatchId);
    this.playerToMatch.set(match.players[1].socketId, newMatchId);
    await this.saveMatchToDB(newMatch);

    const chessState = this.createChessMatchState(newMatch);
    this.activeChessMatches.set(newMatchId, chessState);
    this.startChessTurn(chessState);

    const io = getIO();
    if (!io) return;

    const payload = {
      matchId: newMatchId,
      white: {
        userId: newMatch.players[0].userId,
        username: newMatch.players[0].username,
      },
      black: {
        userId: newMatch.players[1].userId,
        username: newMatch.players[1].username,
      },
      fen: chessState.fen,
      turn: chessState.turn,
      moveHistory: chessState.moveHistory,
      drawOffers: Array.from(chessState.drawOffers),
      result: chessState.result,
    };

    io.to(match.players[0].socketId).emit("rematch_ready", {
      matchId: newMatchId,
      seed: seed.toString(),
    });
    io.to(match.players[1].socketId).emit("rematch_ready", {
      matchId: newMatchId,
      seed: seed.toString(),
    });
    this.broadcastChessState(chessState);
  }

  handlePlayerMove(socket: Socket, data: { matchId: string; from: string; to: string; promotion?: string }) {
    const state = this.activeChessMatches.get(data.matchId);
    if (!state || state.endedAt) {
      socket.emit("move_rejected", { message: "Match not available." });
      return;
    }

    const match = state.match;
    const player = match.players.find((p) => p.socketId === socket.id);
    if (!player) {
      socket.emit("move_rejected", { message: "You are not part of this match." });
      return;
    }

    const currentTurnUserId = state.turn === "w" ? match.players[0].userId : match.players[1].userId;
    if (player.userId !== currentTurnUserId) {
      socket.emit("move_rejected", { message: "Not your turn." });
      return;
    }

    // Validate promotion choice; chess.js silently accepts anything but
    // we want a tight allow-list before reaching it.
    const promotion =
      data.promotion && /^[qrbn]$/i.test(data.promotion)
        ? data.promotion.toLowerCase()
        : "q";
    let move;
    try {
      move = state.chess.move({ from: data.from, to: data.to, promotion });
    } catch {
      socket.emit("move_rejected", { message: "Illegal move." });
      return;
    }
    if (!move) {
      socket.emit("move_rejected", { message: "Illegal move." });
      return;
    }

    // Charge the mover their think-time, then add the increment. We
    // measure against the recorded turn-start so the server, not the
    // client, is the source of truth for time used.
    if (state.clockTurnStartedAt > 0) {
      const elapsed = Math.max(0, Date.now() - state.clockTurnStartedAt);
      state.moveTimes.push(elapsed);
      if (move.color === "w") {
        const remaining = state.whiteMs - elapsed;
        if (remaining <= 0) {
          // Edge case: the move arrived after the timer logically expired
          // but before the timeoutTimer fired. Reject as time forfeit.
          state.whiteMs = 0;
          state.clockTurnStartedAt = 0;
          this.endChessMatch(state, {
            outcome: "win",
            winnerId: match.players[1].userId,
            reason: "time forfeit",
          }).catch((err) => console.error("Failed to finalize time forfeit:", err));
          return;
        }
        state.whiteMs = remaining + CHESS_INCREMENT_MS;
      } else {
        const remaining = state.blackMs - elapsed;
        if (remaining <= 0) {
          state.blackMs = 0;
          state.clockTurnStartedAt = 0;
          this.endChessMatch(state, {
            outcome: "win",
            winnerId: match.players[0].userId,
            reason: "time forfeit",
          }).catch((err) => console.error("Failed to finalize time forfeit:", err));
          return;
        }
        state.blackMs = remaining + CHESS_INCREMENT_MS;
      }
    }

    state.fen = state.chess.fen();
    state.pgn = state.chess.pgn();
    state.turn = state.chess.turn();
    state.moveHistory.push(move.san);

    if (state.chess.isGameOver()) {
      // Game over: stop the clocks before broadcasting so the final
      // payload has clockTurnStartedAt = 0.
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
        state.timeoutTimer = null;
      }
      state.clockTurnStartedAt = 0;
      this.broadcastChessState(state);

      const outcome = state.chess.isDraw() ? "draw" : "win";
      const winnerId = outcome === "win" ? currentTurnUserId : undefined;
      this.endChessMatch(state, {
        outcome,
        winnerId,
        reason: state.chess.isDraw() ? "draw" : "checkmate",
      }).catch((error) => console.error("Failed to finalize chess match:", error));
      return;
    }

    // Hand the clock to the opponent and broadcast the new baseline.
    this.startChessTurn(state);
    this.broadcastChessState(state);
  }

  handleDrawOffer(socket: Socket, data: { matchId: string; userId: string }) {
    const state = this.activeChessMatches.get(data.matchId);
    if (!state || state.endedAt) return;

    state.drawOffers.add(data.userId);
    this.broadcastChessState(state);

    if (state.drawOffers.size === 2) {
      this.endChessMatch(state, {
        outcome: "draw",
        reason: "mutual draw agreement",
      }).catch((error) => console.error("Failed to finalize drawing chess match:", error));
    }
  }

  handleResign(socket: Socket, data: { matchId: string; userId: string }) {
    const state = this.activeChessMatches.get(data.matchId);
    if (!state || state.endedAt) return;
    const match = state.match;
    const resigning = match.players.find((player) => player.userId === data.userId);
    const winner = match.players.find((player) => player.userId !== data.userId);
    if (!resigning || !winner) return;

    this.endChessMatch(state, {
      outcome: "win",
      winnerId: winner.userId,
      reason: "resignation",
    }).catch((error) => console.error("Failed to finalize resignation:", error));
  }

  handleRematchRequest(socket: Socket, data: { matchId: string; userId: string }) {
    const state = this.activeChessMatches.get(data.matchId);
    if (!state || state.endedAt) return;

    state.rematchRequests.add(data.userId);
    const opponent = state.match.players.find((player) => player.userId !== data.userId);
    const io = getIO();
    if (opponent && io) {
      io.to(opponent.socketId).emit("rematch_pending", {
        requestingUserId: data.userId,
        requestingUserName: state.match.players.find((p) => p.userId === data.userId)?.username,
      });
    }

    if (state.rematchRequests.size === 2) {
      this.createRematch(state.match).catch((error) => console.error("Failed to create rematch:", error));
    }
  }

  joinMatch(socket: Socket, data: { matchId: string; userId: string; username: string; spectate?: boolean }) {
    const match = this.activeMatches.get(data.matchId);
    if (!match) {
      socket.emit("match_not_found", { matchId: data.matchId });
      return;
    }

    const player = match.players.find((player) => player.userId === data.userId);
    const state = this.activeChessMatches.get(match.id);
    if (player) {
      player.socketId = socket.id;
      this.playerToMatch.set(socket.id, match.id);

      // Clear any pending forfeit timer for this user — they're back.
      const timer = state?.disconnectTimers.get(player.userId);
      if (timer) {
        clearTimeout(timer);
        state?.disconnectTimers.delete(player.userId);
        const opponent = match.players.find((p) => p.userId !== player.userId);
        if (opponent) {
          getIO()?.to(opponent.socketId).emit("opponent_reconnected", {
            userId: player.userId,
          });
        }
      }
    } else if (data.spectate) {
      if (state) {
        state.spectators.add(socket.id);
      }
    }

    if (state) {
      // Send the joining client a one-shot match_state straight from the
      // shared builder so clock + result fields stay in lockstep with
      // broadcastChessState's payload shape.
      socket.emit("match_state", this.buildChessStatePayload(state));
    }
  }
}

export const matchmakingQueue = new MatchmakingQueue();

let io: SocketIOServer | null = null;

export function initSocketIO(server: HTTPServer) {
  // CORS for the websocket upgrade handshake. In dev we accept the
  // local Next dev origin; in production we accept whatever
  // PUBLIC_ORIGIN is set to (comma-separated for multi-domain
  // deployments — eg. "https://brainarena.gg,https://www.brainarena.gg").
  // When the websocket and HTTP are served from the same origin
  // (the standard single-VPS deploy), CORS is effectively a no-op.
  const isProd = process.env.NODE_ENV === "production";
  const publicOrigin = (process.env.PUBLIC_ORIGIN ?? "").trim();
  const corsOrigin: string | string[] | boolean = isProd
    ? publicOrigin
      ? publicOrigin.split(",").map((s) => s.trim()).filter(Boolean)
      : false
    : "http://localhost:3000";

  io = new SocketIOServer(server, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Handshake auth. Read ba_session from the upgrade request, validate
  // against the session table, and bind a server-trusted identity onto
  // the socket. Spectators (no session) are allowed to connect but are
  // restricted to spectate-only operations.
  io.use(async (socket, next) => {
    const auth = await authFromCookie(socket.handshake.headers.cookie);
    socket.data.auth = auth; // null = anonymous spectator
    next();
  });

  // Per-socket per-event rate limit. Buckets are reset every minute.
  // Bounds chess griefing — a single misbehaving client can't flood
  // make_move with illegal positions or hammer offer_draw. Limits
  // chosen to be 10× normal play for a generous headroom.
  const SOCKET_RATE_LIMITS: Record<string, number> = {
    join_queue: 10,
    leave_queue: 20,
    ready: 20,
    join_match: 20,
    make_move: 60, // ~1 move/sec for an entire bullet game
    offer_draw: 5,
    resign: 5,
    request_rematch: 5,
  };
  function rateOk(socket: Socket, event: string): boolean {
    const limit = SOCKET_RATE_LIMITS[event];
    if (!limit) return true;
    const buckets = (socket.data.rateBuckets ??= new Map<
      string,
      { count: number; resetAt: number }
    >());
    const now = Date.now();
    const b = buckets.get(event);
    if (!b || now > b.resetAt) {
      buckets.set(event, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (b.count >= limit) {
      socket.emit("rate_limited", { event, limit, retryInMs: b.resetAt - now });
      return false;
    }
    b.count += 1;
    return true;
  }

  io.on("connection", (socket) => {
    const auth: SocketAuth | null = socket.data.auth ?? null;
    console.log(
      `Player connected: ${socket.id} ${auth ? `(user=${auth.username})` : "(anon)"}`,
    );

    socket.on("join_queue", (data: { gameId: string }) => {
      if (!rateOk(socket, "join_queue")) return;
      if (!auth) {
        socket.emit("queue_error", { reason: "Not authenticated." });
        return;
      }
      if (!data || typeof data.gameId !== "string" || !data.gameId) {
        socket.emit("queue_error", { reason: "Invalid payload." });
        return;
      }
      const player: MatchmakingPlayer = {
        socketId: socket.id,
        userId: auth.userId,
        username: auth.username,
        gameId: data.gameId,
        joinedAt: new Date(),
        ready: false,
      };
      const result = matchmakingQueue.addPlayer(player);
      if (!result.ok) {
        socket.emit("queue_error", { reason: result.reason });
        return;
      }
      socket.emit("queued", { position: 1 });
    });

    socket.on("leave_queue", () => {
      if (!rateOk(socket, "leave_queue")) return;
      matchmakingQueue.removePlayer(socket.id);
    });

    socket.on("ready", () => {
      if (!rateOk(socket, "ready")) return;
      matchmakingQueue.setPlayerReady(socket.id, true);
    });

    socket.on(
      "join_match",
      (data: { matchId: string; spectate?: boolean }) => {
        if (!rateOk(socket, "join_match")) return;
        if (!data || typeof data.matchId !== "string") return;
        // Spectators allowed without auth; players must be authenticated.
        if (!auth && !data.spectate) {
          socket.emit("match_not_found", { matchId: data.matchId });
          return;
        }
        matchmakingQueue.joinMatch(socket, {
          matchId: data.matchId,
          userId: auth?.userId ?? `spectator_${socket.id}`,
          username: auth?.username ?? "Spectator",
          spectate: data.spectate,
        });
      },
    );

    socket.on(
      "make_move",
      (data: {
        matchId: string;
        from: string;
        to: string;
        promotion?: string;
      }) => {
        if (!rateOk(socket, "make_move")) return;
        if (!auth) {
          socket.emit("move_rejected", { message: "Not authenticated." });
          return;
        }
        matchmakingQueue.handlePlayerMove(socket, data);
      },
    );

    socket.on("offer_draw", (data: { matchId: string }) => {
      if (!rateOk(socket, "offer_draw")) return;
      if (!auth) return;
      matchmakingQueue.handleDrawOffer(socket, {
        matchId: data.matchId,
        userId: auth.userId,
      });
    });

    socket.on("resign", (data: { matchId: string }) => {
      if (!rateOk(socket, "resign")) return;
      if (!auth) return;
      matchmakingQueue.handleResign(socket, {
        matchId: data.matchId,
        userId: auth.userId,
      });
    });

    socket.on("request_rematch", (data: { matchId: string }) => {
      if (!rateOk(socket, "request_rematch")) return;
      if (!auth) return;
      matchmakingQueue.handleRematchRequest(socket, {
        matchId: data.matchId,
        userId: auth.userId,
      });
    });

    socket.on("disconnect", () => {
      matchmakingQueue.removePlayer(socket.id);
      console.log(`Player disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
