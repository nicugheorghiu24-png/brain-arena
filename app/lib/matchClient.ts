"use client";

import { db } from "./db";
import type { AchievementRecord } from "./games/achievements-catalog";

export type ClientMatchOutcome = {
  gameId: string;
  difficulty: string;
  rounds: number;
  durationMs: number;
  result: "win" | "loss" | "draw";
  scoreSelf: number;
  scoreOpponent: number;
  opponentName: string;
  matchSeed?: number;
  // Optional input stream for server-side replay validation. Shape
  // is per-game (math: { answers: [{questionId, chosenIndex,
  // correctIndex, ms}, ...] }). The server's validator registry in
  // app/lib/games/replay/index.ts decides what to do with it.
  inputs?: unknown;
};

export type MatchMilestones = {
  tierPromoted: boolean;
  leveledUp: boolean;
  newStreakRecord: boolean;
  firstWinEver: boolean;
};

export type RecordedMatch = {
  source: "server" | "local";
  reward: { lpDelta: number; xpGained: number };
  profile: {
    lp: number;
    xp: number;
    level: number;
    xpToNext: number;
    tier: string;
    division: string;
    wins: number;
    losses: number;
  } | null;
  // Set on server source only. The local-fallback path has no DB,
  // so milestones can't be computed there.
  milestones: MatchMilestones | null;
  achievementsUnlocked: AchievementRecord[];
};

/**
 * Record a finished solo-game outcome. Always tries the server first
 * (POST /api/matches → Postgres + server-authoritative reward), then
 * falls back to localStorage via the local Db backend if the API is
 * unreachable or the user is anonymous. The server response is the
 * source of truth for displayed lpDelta/xpGained.
 *
 * Pages should call this from the result-screen useEffect after they've
 * computed an OPTIMISTIC reward for immediate display, then reconcile
 * the rendered numbers from the returned `reward` field if needed.
 */
export async function recordSoloMatchOutcome(
  outcome: ClientMatchOutcome,
  fallback: {
    userId: string;
    username: string;
    email?: string;
    optimisticLpDelta: number;
    optimisticXpGained: number;
  },
): Promise<RecordedMatch> {
  try {
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(outcome),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as
        | {
            ok: true;
            reward: { lpDelta: number; xpGained: number };
            profile: RecordedMatch["profile"];
            milestones: MatchMilestones | null;
            achievementsUnlocked: AchievementRecord[];
          }
        | null;
      if (data?.ok) {
        return {
          source: "server",
          reward: data.reward,
          profile: data.profile,
          milestones: data.milestones ?? null,
          achievementsUnlocked: data.achievementsUnlocked ?? [],
        };
      }
    }
    // 401 (anonymous) or 503 (no DB) → fall through to local.
  } catch {
    // Network down → fall through to local.
  }

  // Local fallback. Mirrors the original behavior for dev / DB-less mode
  // and for users who haven't signed up yet.
  await db.profiles.ensureForUser({
    userId: fallback.userId,
    username: fallback.username,
    email: fallback.email,
  });
  await db.matches.record({
    gameId: outcome.gameId,
    matchSeed: outcome.matchSeed ?? 0,
    difficulty: outcome.difficulty,
    playerId: fallback.userId,
    playerName: fallback.username,
    opponentName: outcome.opponentName,
    result: outcome.result,
    scoreSelf: outcome.scoreSelf,
    scoreOpponent: outcome.scoreOpponent,
    durationMs: outcome.durationMs,
    rounds: outcome.rounds,
    lpDelta: fallback.optimisticLpDelta,
    xpGained: fallback.optimisticXpGained,
  });
  await db.profiles.applyMatchOutcome(fallback.userId, {
    result: outcome.result,
    lpDelta: fallback.optimisticLpDelta,
    xpGained: fallback.optimisticXpGained,
  });
  return {
    source: "local",
    reward: {
      lpDelta: fallback.optimisticLpDelta,
      xpGained: fallback.optimisticXpGained,
    },
    profile: null,
    milestones: null,
    achievementsUnlocked: [],
  };
}
