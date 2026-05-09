import type { Profile } from "@prisma/client";
import { requirePrisma } from "../prisma";

type Outcome = {
  result: "win" | "loss" | "draw";
  lpDelta: number;
  xpGained: number;
};

function applyXp(profile: Profile, xpGained: number) {
  let xp = profile.xp + xpGained;
  let level = profile.level;
  let xpToNext = profile.xpToNext;
  while (xp >= xpToNext) {
    xp -= xpToNext;
    level += 1;
    xpToNext = Math.round(xpToNext * 1.18);
  }
  return { xp, level, xpToNext };
}

/**
 * Tier/division thresholds. Mirrors `rankingsService.updatePlayerRank`
 * so chess (Elo path) and solo games (fixed-LP path) end up at the same
 * tier for the same LP. Single source of truth lives here so it can be
 * called from a transaction without a second round-trip.
 */
export function tierForLp(lp: number): { tier: string; division: string } {
  if (lp >= 2000) return { tier: "Master", division: "I" };
  if (lp >= 1500) {
    return {
      tier: "Diamond",
      division: lp >= 1800 ? "I" : lp >= 1650 ? "II" : "III",
    };
  }
  if (lp >= 1200) {
    return {
      tier: "Platinum",
      division: lp >= 1350 ? "I" : lp >= 1275 ? "II" : "III",
    };
  }
  if (lp >= 900) {
    return {
      tier: "Gold",
      division: lp >= 1050 ? "I" : lp >= 975 ? "II" : "III",
    };
  }
  if (lp >= 600) {
    return {
      tier: "Silver",
      division: lp >= 750 ? "I" : lp >= 675 ? "II" : "III",
    };
  }
  return {
    tier: "Bronze",
    division: lp >= 300 ? "I" : lp >= 150 ? "II" : "III",
  };
}

export const profilesService = {
  async getByUserId(userId: string) {
    const prisma = requirePrisma();
    return prisma.profile.findUnique({ where: { userId } });
  },

  async getByUsername(username: string) {
    const prisma = requirePrisma();
    return prisma.profile.findUnique({ where: { username } });
  },

  async ensureForUser(opts: {
    userId: string;
    username: string;
  }) {
    const prisma = requirePrisma();
    return prisma.profile.upsert({
      where: { userId: opts.userId },
      create: { userId: opts.userId, username: opts.username },
      update: {},
    });
  },

  async applyMatchOutcome(userId: string, outcome: Outcome) {
    const prisma = requirePrisma();
    return prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) return null;

      // 1.5× LP magnitude during placement. Same on wins and losses
      // — gets the player to their real tier faster in either
      // direction. Per COMPETITIVE_SYSTEMS.md placement matches spec.
      const placementBoost = profile.placementMatchesPlayed < 5 ? 1.5 : 1;
      const adjustedLpDelta = Math.round(outcome.lpDelta * placementBoost);

      const lp = Math.max(0, profile.lp + adjustedLpDelta);
      const wins = profile.wins + (outcome.result === "win" ? 1 : 0);
      const losses = profile.losses + (outcome.result === "loss" ? 1 : 0);
      const xpFields = applyXp(profile, outcome.xpGained);
      const { tier, division } = tierForLp(lp);

      // Streak: wins increment, anything else resets. Best-streak is
      // the lifetime maximum.
      const currentStreak =
        outcome.result === "win" ? profile.currentStreak + 1 : 0;
      const bestStreak = Math.max(profile.bestStreak, currentStreak);

      // Placement: tick up until 5 (per COMPETITIVE_SYSTEMS.md). Both
      // wins and losses count — placement just measures "have we seen
      // enough to place this player." Caps at 5.
      const placementMatchesPlayed = Math.min(
        5,
        profile.placementMatchesPlayed + 1,
      );

      const updated = await tx.profile.update({
        where: { userId },
        data: {
          lp,
          wins,
          losses,
          tier,
          division,
          currentStreak,
          bestStreak,
          placementMatchesPlayed,
          ...xpFields,
        },
      });
      return updated;
    });
  },
};
