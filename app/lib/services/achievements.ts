import type { Profile } from "@prisma/client";
import { requirePrisma } from "../prisma";

export type AchievementRecord = {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
};

/**
 * The canonical achievement catalog. Single source of truth in code;
 * mirrored into the `achievements` table on first /api/matches POST
 * via ensureAchievementCatalog(). Adding a new achievement is a
 * matter of appending here + adding a corresponding check in
 * unlockAchievementsForOutcome.
 *
 * Rarity is a UX hint — the colour of the badge — not a balance lever.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementRecord[] = [
  // Onboarding
  {
    id: "first_win",
    title: "First Blood",
    description: "Win your very first match.",
    icon: "🎯",
    rarity: "common",
  },
  // Streaks
  {
    id: "streak_3",
    title: "Hot Streak",
    description: "Win 3 matches in a row.",
    icon: "🔥",
    rarity: "common",
  },
  {
    id: "streak_5",
    title: "On Fire",
    description: "Win 5 matches in a row.",
    icon: "🔥🔥",
    rarity: "rare",
  },
  {
    id: "streak_10",
    title: "Unstoppable",
    description: "Win 10 matches in a row.",
    icon: "⚡",
    rarity: "epic",
  },
  // Volume
  {
    id: "played_10",
    title: "Getting Warm",
    description: "Play 10 matches.",
    icon: "🎮",
    rarity: "common",
  },
  {
    id: "played_50",
    title: "Veteran",
    description: "Play 50 matches.",
    icon: "🎖️",
    rarity: "rare",
  },
  // Tier promotions
  {
    id: "tier_silver",
    title: "Silver Climb",
    description: "Reach Silver tier.",
    icon: "🥈",
    rarity: "common",
  },
  {
    id: "tier_gold",
    title: "Gold Standard",
    description: "Reach Gold tier.",
    icon: "🥇",
    rarity: "rare",
  },
  {
    id: "tier_platinum",
    title: "Platinum Mind",
    description: "Reach Platinum tier.",
    icon: "💎",
    rarity: "epic",
  },
  {
    id: "tier_diamond",
    title: "Diamond Brain",
    description: "Reach Diamond tier.",
    icon: "💠",
    rarity: "legendary",
  },
] as const;

/** Ordered tier rank — used for "promoted to" detection. */
const TIER_RANK: Record<string, number> = {
  Bronze: 0,
  Silver: 1,
  Gold: 2,
  Platinum: 3,
  Diamond: 4,
  Master: 5,
};

let catalogEnsured = false;

/**
 * Idempotently upsert the catalog into the `achievements` table. Runs
 * on demand (first call) and is a no-op thereafter for the lifetime
 * of the process. Re-runs on a fresh process — designed to be safe
 * across restarts.
 */
async function ensureAchievementCatalog(): Promise<void> {
  if (catalogEnsured) return;
  const prisma = requirePrisma();
  for (const a of ACHIEVEMENT_CATALOG) {
    await prisma.achievement.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        title: a.title,
        description: a.description,
        icon: a.icon,
        rarity: a.rarity,
      },
      update: {
        title: a.title,
        description: a.description,
        icon: a.icon,
        rarity: a.rarity,
      },
    });
  }
  catalogEnsured = true;
}

type ProfileSnapshot = Pick<
  Profile,
  | "lp"
  | "level"
  | "tier"
  | "division"
  | "currentStreak"
  | "bestStreak"
  | "wins"
  | "losses"
  | "placementMatchesPlayed"
>;

/**
 * After a match has been recorded and applyMatchOutcome has updated
 * the profile, evaluate which catalog achievements have just become
 * true and unlock them. Returns the freshly-unlocked records (NOT
 * already-unlocked ones), so the client can fire a celebration.
 *
 * Called from /api/matches POST and (next turn) from chess match
 * end. Idempotent — calling twice with the same after-state returns
 * an empty array on the second call.
 */
export async function unlockAchievementsForOutcome(opts: {
  userId: string;
  gameId: string;
  result: "win" | "loss" | "draw";
  before: ProfileSnapshot | null;
  after: ProfileSnapshot;
}): Promise<AchievementRecord[]> {
  await ensureAchievementCatalog();
  const prisma = requirePrisma();
  const { userId, result, before, after } = opts;

  // Decide which catalog ids are now-true. Use AFTER state for
  // monotonic counters; cross-reference BEFORE for "promoted" events.
  const candidates: string[] = [];

  // first_win: AFTER has wins=1 and this match is the win
  if (result === "win" && after.wins === 1) candidates.push("first_win");

  // streaks: based on currentStreak
  if (after.currentStreak >= 3) candidates.push("streak_3");
  if (after.currentStreak >= 5) candidates.push("streak_5");
  if (after.currentStreak >= 10) candidates.push("streak_10");

  // volume: total matches played
  const total = after.wins + after.losses;
  if (total >= 10) candidates.push("played_10");
  if (total >= 50) candidates.push("played_50");

  // tier promotion: whichever tier is now true and was not before
  const beforeTierRank = before ? TIER_RANK[before.tier] ?? -1 : -1;
  const afterTierRank = TIER_RANK[after.tier] ?? -1;
  if (afterTierRank > beforeTierRank) {
    if (afterTierRank >= TIER_RANK.Silver) candidates.push("tier_silver");
    if (afterTierRank >= TIER_RANK.Gold) candidates.push("tier_gold");
    if (afterTierRank >= TIER_RANK.Platinum) candidates.push("tier_platinum");
    if (afterTierRank >= TIER_RANK.Diamond) candidates.push("tier_diamond");
  }

  if (candidates.length === 0) return [];

  // Fetch which of the candidates the user already has, so we only
  // emit the freshly-unlocked ones to the client. Prisma upsert is
  // still idempotent — the filter is just for the response payload.
  const existing = await prisma.userAchievement.findMany({
    where: { userId, achievementId: { in: candidates } },
    select: { achievementId: true },
  });
  const alreadyUnlocked = new Set(existing.map((e) => e.achievementId));

  const fresh: AchievementRecord[] = [];
  for (const id of candidates) {
    if (alreadyUnlocked.has(id)) continue;
    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId: id } },
      create: { userId, achievementId: id },
      update: {},
    });
    const record = ACHIEVEMENT_CATALOG.find((a) => a.id === id);
    if (record) fresh.push(record);
  }
  return fresh;
}

export const achievementsService = {
  async listForUser(userId: string) {
    const prisma = requirePrisma();
    return prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" },
    });
  },

  async unlock(userId: string, achievementId: string) {
    const prisma = requirePrisma();
    return prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: { userId, achievementId },
      update: {},
    });
  },

  async unlockIfExists(userId: string, achievementId: string) {
    const prisma = requirePrisma();
    const achievement = await prisma.achievement.findUnique({
      where: { id: achievementId },
    });
    if (!achievement) {
      return null;
    }
    return this.unlock(userId, achievementId);
  },

  async listCatalog() {
    const prisma = requirePrisma();
    return prisma.achievement.findMany();
  },
};
