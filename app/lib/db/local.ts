import { DEFAULT_PROFILE, FAKE_LEADERBOARD } from "../fakeData";
import type {
  Db,
  LeaderboardRow,
  LeaderboardSort,
  MatchRecord,
  ProfileRecord,
} from "./types";

const PROFILE_PREFIX = "brain-arena:profile:";
const PROFILE_BY_NAME_PREFIX = "brain-arena:profile-by-name:";
const MATCHES_PREFIX = "brain-arena:matches:";
const MATCH_INDEX_PREFIX = "brain-arena:match-index:";
const MAX_MATCHES_PER_USER = 100;

function safeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota errors are non-fatal.
  }
}

function profileKey(userId: string) {
  return `${PROFILE_PREFIX}${userId}`;
}
function profileByNameKey(username: string) {
  return `${PROFILE_BY_NAME_PREFIX}${username.toLowerCase()}`;
}
function matchesKey(userId: string) {
  return `${MATCHES_PREFIX}${userId}`;
}
function matchIndexKey(matchId: string) {
  return `${MATCH_INDEX_PREFIX}${matchId}`;
}

function defaultProfileFor(opts: {
  userId: string;
  username: string;
  email?: string;
}): ProfileRecord {
  return {
    id: opts.userId,
    username: opts.username,
    email: opts.email,
    tier: DEFAULT_PROFILE.tier,
    division: DEFAULT_PROFILE.division,
    lp: DEFAULT_PROFILE.lp,
    level: DEFAULT_PROFILE.level,
    xp: DEFAULT_PROFILE.xp,
    xpToNext: DEFAULT_PROFILE.xpToNext,
    bio: DEFAULT_PROFILE.bio,
    region: DEFAULT_PROFILE.region,
    joinedAt: new Date().toISOString().slice(0, 10),
    wins: DEFAULT_PROFILE.wins,
    losses: DEFAULT_PROFILE.losses,
    bestStreak: DEFAULT_PROFILE.bestStreak,
  };
}

function applyXp(profile: ProfileRecord, xpGained: number): ProfileRecord {
  let xp = profile.xp + xpGained;
  let level = profile.level;
  let xpToNext = profile.xpToNext;
  while (xp >= xpToNext) {
    xp -= xpToNext;
    level += 1;
    xpToNext = Math.round(xpToNext * 1.18);
  }
  return { ...profile, xp, level, xpToNext };
}

function applyLp(profile: ProfileRecord, lpDelta: number): ProfileRecord {
  const lp = Math.max(0, profile.lp + lpDelta);
  return { ...profile, lp };
}

function applyResult(
  profile: ProfileRecord,
  result: "win" | "loss" | "draw",
): ProfileRecord {
  if (result === "win") return { ...profile, wins: profile.wins + 1 };
  if (result === "loss") return { ...profile, losses: profile.losses + 1 };
  return profile;
}

export const localDb: Db = {
  backend: "local",
  profiles: {
    async get(userId) {
      return safeGet<ProfileRecord>(profileKey(userId));
    },
    async getByUsername(username) {
      const userId = safeGet<string>(profileByNameKey(username));
      if (!userId) return null;
      return safeGet<ProfileRecord>(profileKey(userId));
    },
    async upsert(profile) {
      safeSet(profileKey(profile.id), profile);
      safeSet(profileByNameKey(profile.username), profile.id);
    },
    async ensureForUser(opts) {
      const existing = safeGet<ProfileRecord>(profileKey(opts.userId));
      if (existing) {
        // Keep username in sync if the user changed it via signup.
        if (existing.username !== opts.username) {
          existing.username = opts.username;
          safeSet(profileKey(opts.userId), existing);
          safeSet(profileByNameKey(opts.username), opts.userId);
        }
        return existing;
      }
      const fresh = defaultProfileFor(opts);
      safeSet(profileKey(fresh.id), fresh);
      safeSet(profileByNameKey(fresh.username), fresh.id);
      return fresh;
    },
    async applyMatchOutcome(userId, { result, lpDelta, xpGained }) {
      const existing = safeGet<ProfileRecord>(profileKey(userId));
      if (!existing) return;
      const updated = applyXp(applyLp(applyResult(existing, result), lpDelta), xpGained);
      safeSet(profileKey(userId), updated);
      safeSet(profileByNameKey(updated.username), updated.id);
    },
  },
  matches: {
    async record(input) {
      const id = `m_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const record: MatchRecord = { ...input, id, createdAt: Date.now() };
      const existing = safeGet<MatchRecord[]>(matchesKey(input.playerId)) ?? [];
      const next = [record, ...existing].slice(0, MAX_MATCHES_PER_USER);
      safeSet(matchesKey(input.playerId), next);
      safeSet(matchIndexKey(id), record);
      return record;
    },
    async listForUser(userId, limit = 20) {
      const all = safeGet<MatchRecord[]>(matchesKey(userId)) ?? [];
      return all.slice(0, limit);
    },
  },
  leaderboard: {
    async list(opts) {
      const sort: LeaderboardSort = opts?.sort ?? "mmr";
      const region = opts?.region;
      const youUserId = opts?.youUserId ?? null;
      const limit = opts?.limit ?? 50;

      // Seed rows from the curated demo leaderboard so the page always
      // has a populated look. Mark "you" using the real local profile
      // when present so stats stay accurate.
      const youProfile = youUserId
        ? safeGet<ProfileRecord>(profileKey(youUserId))
        : null;

      const rows: LeaderboardRow[] = FAKE_LEADERBOARD.map((row) => ({
        userId: `seed:${row.username.toLowerCase()}`,
        username: row.username,
        tier: row.tier,
        division: row.division,
        lp: row.lp,
        wins: row.wins,
        losses: row.losses,
        region: row.region,
        isYou: row.isYou,
      }));

      // Replace the demo "you" row with the real profile if available.
      if (youProfile) {
        const youIdx = rows.findIndex((r) => r.isYou);
        const realYou: LeaderboardRow = {
          userId: youProfile.id,
          username: youProfile.username,
          tier: youProfile.tier,
          division: youProfile.division,
          lp: youProfile.lp,
          wins: youProfile.wins,
          losses: youProfile.losses,
          region: youProfile.region,
          isYou: true,
        };
        if (youIdx >= 0) rows[youIdx] = realYou;
        else rows.push(realYou);
      }

      const filtered = region ? rows.filter((r) => r.region === region) : rows;

      const sorted = [...filtered].sort((a, b) => {
        switch (sort) {
          case "mmr":
            return b.lp - a.lp;
          case "xp":
            // XP isn't on rows; fall back to lp as a proxy.
            return b.lp - a.lp;
          case "wins":
            return b.wins - a.wins;
          case "winrate": {
            const wrA = a.wins / Math.max(1, a.wins + a.losses);
            const wrB = b.wins / Math.max(1, b.wins + b.losses);
            return wrB - wrA;
          }
        }
      });

      return sorted.slice(0, limit);
    },
  },
};
