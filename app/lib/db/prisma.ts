import {
  matchesService,
  profilesService,
  leaderboardService,
} from "../services";
import { isDbConfigured } from "../prisma";
import { DEFAULT_PROFILE, FAKE_LEADERBOARD } from "../fakeData";
import type {
  Db,
  DbBackendId,
  LeaderboardRow,
  MatchRecord,
  ProfileRecord,
} from "./types";
import type { Profile, MatchResult, Match } from "@prisma/client";

const BACKEND_ID: DbBackendId = "supabase"; // legacy enum value; reused as "remote" tag

function profileToRecord(p: Profile): ProfileRecord {
  return {
    id: p.userId,
    username: p.username,
    tier: p.tier as ProfileRecord["tier"],
    division: p.division as ProfileRecord["division"],
    lp: p.lp,
    level: p.level,
    xp: p.xp,
    xpToNext: p.xpToNext,
    bio: p.bio,
    region: p.region,
    joinedAt: p.joinedAt.toISOString().slice(0, 10),
    wins: p.wins,
    losses: p.losses,
    bestStreak: p.bestStreak,
    favoriteGameId: p.favoriteGameId ?? undefined,
  };
}

function matchResultToRecord(
  r: MatchResult & { match: Match },
): MatchRecord {
  return {
    id: r.id,
    gameId: r.match.gameId,
    matchSeed: Number(r.match.matchSeed),
    difficulty: r.match.difficulty,
    playerId: r.userId,
    playerName: r.playerName,
    opponentName: r.opponentName,
    result: r.result as MatchRecord["result"],
    scoreSelf: r.scoreSelf,
    scoreOpponent: r.scoreOpponent,
    durationMs: r.match.durationMs,
    rounds: r.match.rounds,
    lpDelta: r.lpDelta,
    xpGained: r.xpGained,
    createdAt: r.createdAt.getTime(),
  };
}

export const prismaDb: Db = {
  backend: BACKEND_ID,
  profiles: {
    async get(userId) {
      if (!isDbConfigured()) return null;
      const p = await profilesService.getByUserId(userId);
      return p ? profileToRecord(p) : null;
    },
    async getByUsername(username) {
      if (!isDbConfigured()) return null;
      const p = await profilesService.getByUsername(username);
      return p ? profileToRecord(p) : null;
    },
    async upsert() {
      // Profile creation flows through ensureForUser. Direct upsert is
      // intentionally not exposed from the service layer.
    },
    async ensureForUser(opts) {
      if (!isDbConfigured()) {
        // No DB — synthesize a default record so callers don't crash.
        return {
          id: opts.userId,
          username: opts.username,
          email: opts.email,
          tier: DEFAULT_PROFILE.tier,
          division: DEFAULT_PROFILE.division,
          lp: 0,
          level: 1,
          xp: 0,
          xpToNext: 800,
          bio: "",
          region: "EU",
          joinedAt: new Date().toISOString().slice(0, 10),
          wins: 0,
          losses: 0,
          bestStreak: 0,
        };
      }
      const p = await profilesService.ensureForUser(opts);
      return profileToRecord(p);
    },
    async applyMatchOutcome(userId, outcome) {
      if (!isDbConfigured()) return;
      await profilesService.applyMatchOutcome(userId, outcome);
    },
  },
  matches: {
    async record(input) {
      if (!isDbConfigured()) {
        const id = `m_${Date.now().toString(36)}`;
        return { ...input, id, createdAt: Date.now() };
      }
      const created = await matchesService.record({
        gameId: input.gameId,
        matchSeed: input.matchSeed,
        difficulty: input.difficulty,
        rounds: input.rounds,
        durationMs: input.durationMs,
        results: [
          {
            userId: input.playerId,
            playerName: input.playerName,
            opponentName: input.opponentName,
            result: input.result,
            scoreSelf: input.scoreSelf,
            scoreOpponent: input.scoreOpponent,
            lpDelta: input.lpDelta,
            xpGained: input.xpGained,
          },
        ],
      });
      const r = created.results[0];
      return matchResultToRecord({ ...r, match: created });
    },
    async listForUser(userId, limit) {
      if (!isDbConfigured()) return [];
      const rows = await matchesService.listForUser(userId, limit);
      return rows.map(matchResultToRecord);
    },
  },
  leaderboard: {
    async list(opts) {
      if (!isDbConfigured()) {
        // Fall back to seeded demo leaderboard when DB is offline.
        return FAKE_LEADERBOARD.map((r) => ({
          userId: `seed:${r.username.toLowerCase()}`,
          username: r.username,
          tier: r.tier,
          division: r.division,
          lp: r.lp,
          wins: r.wins,
          losses: r.losses,
          region: r.region,
          isYou: r.isYou,
        }));
      }
      const rows = await leaderboardService.list({
        sort: opts?.sort,
        region: opts?.region,
        limit: opts?.limit,
      });
      const youUserId = opts?.youUserId ?? null;
      return rows.map<LeaderboardRow>((p) => ({
        userId: p.userId,
        username: p.username,
        tier: p.tier as LeaderboardRow["tier"],
        division: p.division as LeaderboardRow["division"],
        lp: p.lp,
        wins: p.wins,
        losses: p.losses,
        region: p.region,
        isYou: youUserId !== null && p.userId === youUserId,
      }));
    },
  },
};
