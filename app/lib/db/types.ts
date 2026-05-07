import type { Tier, Division, Rarity } from "../types";

export type ProfileRecord = {
  id: string;
  username: string;
  email?: string;
  tier: Tier;
  division: Division;
  lp: number;
  level: number;
  xp: number;
  xpToNext: number;
  bio: string;
  region: string;
  joinedAt: string;
  wins: number;
  losses: number;
  bestStreak: number;
  favoriteGameId?: string;
};

export type MatchRecord = {
  id: string;
  gameId: string;
  matchSeed: number;
  difficulty: string;
  playerId: string;
  playerName: string;
  opponentName: string;
  result: "win" | "loss" | "draw";
  scoreSelf: number;
  scoreOpponent: number;
  durationMs: number;
  rounds: number;
  lpDelta: number;
  xpGained: number;
  createdAt: number;
};

export type AchievementUnlock = {
  userId: string;
  achievementId: string;
  unlockedAt: number;
  rarity: Rarity;
};

export type LeaderboardRow = {
  userId: string;
  username: string;
  tier: Tier;
  division: Division;
  lp: number;
  wins: number;
  losses: number;
  region: string;
  isYou?: boolean;
};

export type LeaderboardSort = "mmr" | "xp" | "wins" | "winrate";

export type DbBackendId = "local" | "supabase";

export interface DbProfileApi {
  get(userId: string): Promise<ProfileRecord | null>;
  getByUsername(username: string): Promise<ProfileRecord | null>;
  upsert(profile: ProfileRecord): Promise<void>;
  ensureForUser(opts: {
    userId: string;
    username: string;
    email?: string;
  }): Promise<ProfileRecord>;
  applyMatchOutcome(
    userId: string,
    outcome: { result: "win" | "loss" | "draw"; lpDelta: number; xpGained: number },
  ): Promise<void>;
}

export interface DbMatchApi {
  record(match: Omit<MatchRecord, "id" | "createdAt">): Promise<MatchRecord>;
  listForUser(userId: string, limit?: number): Promise<MatchRecord[]>;
}

export interface DbLeaderboardApi {
  list(opts?: {
    sort?: LeaderboardSort;
    region?: string;
    limit?: number;
    youUserId?: string | null;
  }): Promise<LeaderboardRow[]>;
}

export interface Db {
  backend: DbBackendId;
  profiles: DbProfileApi;
  matches: DbMatchApi;
  leaderboard: DbLeaderboardApi;
}
