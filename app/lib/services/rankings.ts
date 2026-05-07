import { requirePrisma } from "../prisma";

export type RankResult = "win" | "loss" | "draw";

export interface RankUpdate {
  newLp: number;
  lpDelta: number;
  newTier?: string;
  newDivision?: string;
}

export const rankingsService = {
  async updatePlayerRank(
    userId: string,
    opponentLp: number,
    result: RankResult,
  ): Promise<RankUpdate> {
    const prisma = requirePrisma();

    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new Error("Profile not found");
    }

    const expectedScore = 1 / (1 + Math.pow(10, (opponentLp - profile.lp) / 400));
    const actualScore = result === "win" ? 1 : result === "loss" ? 0 : 0.5;

    const lpDelta = Math.round(32 * (actualScore - expectedScore));
    const newLp = Math.max(0, profile.lp + lpDelta);

    // Simple tier logic (can be expanded)
    let newTier = profile.tier;
    let newDivision = profile.division;

    if (newLp >= 2000) {
      newTier = "Master";
      newDivision = "I";
    } else if (newLp >= 1500) {
      newTier = "Diamond";
      newDivision = newLp >= 1800 ? "I" : newLp >= 1650 ? "II" : "III";
    } else if (newLp >= 1200) {
      newTier = "Platinum";
      newDivision = newLp >= 1350 ? "I" : newLp >= 1275 ? "II" : "III";
    } else if (newLp >= 900) {
      newTier = "Gold";
      newDivision = newLp >= 1050 ? "I" : newLp >= 975 ? "II" : "III";
    } else if (newLp >= 600) {
      newTier = "Silver";
      newDivision = newLp >= 750 ? "I" : newLp >= 675 ? "II" : "III";
    } else {
      newTier = "Bronze";
      newDivision = newLp >= 300 ? "I" : newLp >= 150 ? "II" : "III";
    }

    await prisma.profile.update({
      where: { userId },
      data: {
        lp: newLp,
        tier: newTier,
        division: newDivision,
        wins: result === "win" ? { increment: 1 } : undefined,
        losses: result === "loss" ? { increment: 1 } : undefined,
      },
    });

    return {
      newLp,
      lpDelta,
      newTier: newTier !== profile.tier ? newTier : undefined,
      newDivision: newDivision !== profile.division ? newDivision : undefined,
    };
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