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
      if (!profile) return;
      const lp = Math.max(0, profile.lp + outcome.lpDelta);
      const wins = profile.wins + (outcome.result === "win" ? 1 : 0);
      const losses = profile.losses + (outcome.result === "loss" ? 1 : 0);
      const xpFields = applyXp(profile, outcome.xpGained);
      await tx.profile.update({
        where: { userId },
        data: { lp, wins, losses, ...xpFields },
      });
    });
  },
};
