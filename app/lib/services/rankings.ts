import { requirePrisma } from "../prisma";
import { tierForLp } from "./profiles";

export type RankResult = "win" | "loss" | "draw";

// XP per chess result. Cheap relative to bcrypt; reasonable to write
// per-match. Mirrors what matchmaking.ts records into MatchResult.
const CHESS_XP_BY_RESULT: Record<RankResult, number> = {
  win: 30,
  draw: 15,
  loss: 8,
};

export interface RankUpdate {
  newLp: number;
  lpDelta: number;
  newTier?: string;
  newDivision?: string;
  xpGained: number;
  newLevel: number;
  leveledUp: boolean;
}

export const rankingsService = {
  async updatePlayerRank(
    userId: string,
    opponentLp: number,
    result: RankResult,
  ): Promise<RankUpdate> {
    const prisma = requirePrisma();

    return prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) {
        throw new Error("Profile not found");
      }

      // Elo update (K=32). Same math as before; tier rule extracted to
      // tierForLp so chess and solo games agree on thresholds.
      const expectedScore =
        1 / (1 + Math.pow(10, (opponentLp - profile.lp) / 400));
      const actualScore =
        result === "win" ? 1 : result === "loss" ? 0 : 0.5;
      const lpDelta = Math.round(32 * (actualScore - expectedScore));
      const newLp = Math.max(0, profile.lp + lpDelta);
      const { tier: newTier, division: newDivision } = tierForLp(newLp);

      // XP/level. Same rolling-overflow rule as profilesService.applyXp
      // (kept inline here to avoid a circular import).
      const xpGained = CHESS_XP_BY_RESULT[result];
      let xp = profile.xp + xpGained;
      let level = profile.level;
      let xpToNext = profile.xpToNext;
      while (xp >= xpToNext) {
        xp -= xpToNext;
        level += 1;
        xpToNext = Math.round(xpToNext * 1.18);
      }

      await tx.profile.update({
        where: { userId },
        data: {
          lp: newLp,
          tier: newTier,
          division: newDivision,
          xp,
          level,
          xpToNext,
          wins: result === "win" ? { increment: 1 } : undefined,
          losses: result === "loss" ? { increment: 1 } : undefined,
        },
      });

      return {
        newLp,
        lpDelta,
        newTier: newTier !== profile.tier ? newTier : undefined,
        newDivision: newDivision !== profile.division ? newDivision : undefined,
        xpGained,
        newLevel: level,
        leveledUp: level > profile.level,
      };
    });
  },

  async getLeaderboard(limit = 100) {
    const prisma = requirePrisma();
    return prisma.profile.findMany({
      orderBy: [
        { lp: "desc" },
        { wins: "desc" },
      ],
      take: limit,
      select: {
        username: true,
        tier: true,
        division: true,
        lp: true,
        wins: true,
        losses: true,
      },
    });
  },
};